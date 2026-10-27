import pool from "./db";
import type { RowDataPacket } from "mysql2";
import { randomInt } from "node:crypto";

const migrationUrl = new URL("../../database/init/002_create_application_tables.sql", import.meta.url);
const equipmentMigrationUrl = new URL("../../database/init/004_create_equipment_workflow.sql", import.meta.url);

async function migrate() {
  const migrationFiles = [migrationUrl, equipmentMigrationUrl];
  const statements = (await Promise.all(migrationFiles.map((url) => Bun.file(url).text())))
    .flatMap((sql) => sql.split(";").map((statement) => statement.trim()).filter(Boolean));
  const connection = await pool.getConnection();

  try {
    for (const statement of statements) {
      await connection.query(statement);
    }
    const equipmentItemColumns = [
      {
        table: "equipment_declaration_items",
        column: "item_type",
        definition: "ENUM('Equipo', 'Herramienta') NOT NULL DEFAULT 'Equipo' AFTER declaration_id",
      },
      {
        table: "equipment_inspection_items",
        column: "declared_item_type",
        definition: "ENUM('Equipo', 'Herramienta') NOT NULL DEFAULT 'Equipo' AFTER declaration_item_id",
      },
    ] as const;
    for (const itemColumn of equipmentItemColumns) {
      const [columns] = await connection.query<RowDataPacket[]>(
        `SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?
           AND COLUMN_NAME = ?`,
        [itemColumn.table, itemColumn.column],
      );
      if (columns.length === 0) {
        await connection.query(
          `ALTER TABLE ${itemColumn.table} ADD COLUMN ${itemColumn.column} ${itemColumn.definition}`,
        );
      }
    }
    await connection.query(
      `UPDATE equipment_declarations
       SET token_revoked_at = COALESCE(submitted_at, NOW())
       WHERE status = 'Enviada' AND token_revoked_at IS NULL`,
    );
    const [appointmentEmailColumns] = await connection.query<RowDataPacket[]>(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'appointments'
         AND COLUMN_NAME = 'visitor_email'`,
    );
    if (appointmentEmailColumns.length === 0) {
      await connection.query(
        "ALTER TABLE appointments ADD COLUMN visitor_email VARCHAR(254) NOT NULL DEFAULT '' AFTER visitor_name",
      );
    }
    const [appointmentOwnerColumns] = await connection.query<RowDataPacket[]>(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'appointments'
         AND COLUMN_NAME = 'created_by_login'`,
    );
    if (appointmentOwnerColumns.length === 0) {
      await connection.query(
        "ALTER TABLE appointments ADD COLUMN created_by_login VARCHAR(255) NULL AFTER registered_by",
      );
    }
    await connection.query(
      `UPDATE appointments appointment_row
       JOIN accesos owner_account
         ON owner_account.login = appointment_row.registered_by
         OR owner_account.name = appointment_row.registered_by
       LEFT JOIN accesos other_account
         ON other_account.login <> owner_account.login
        AND (
          other_account.login = appointment_row.registered_by
          OR other_account.name = appointment_row.registered_by
        )
       SET appointment_row.created_by_login = owner_account.login
       WHERE appointment_row.created_by_login IS NULL
         AND other_account.login IS NULL`,
    );
    const [appointmentOwnerIndexes] = await connection.query<RowDataPacket[]>(
      `SELECT INDEX_NAME
       FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'appointments'
         AND INDEX_NAME = 'idx_appointments_created_by_login'`,
    );
    if (appointmentOwnerIndexes.length === 0) {
      await connection.query(
        "ALTER TABLE appointments ADD INDEX idx_appointments_created_by_login (created_by_login)",
      );
    }
    const [referenceCodeColumns] = await connection.query<RowDataPacket[]>(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'appointments'
         AND COLUMN_NAME = 'reference_code'`,
    );
    if (referenceCodeColumns.length === 0) {
      await connection.query(
        "ALTER TABLE appointments ADD COLUMN reference_code CHAR(8) NULL AFTER visitor_email",
      );
    }
    const [appointmentsWithoutReference] = await connection.query<RowDataPacket[]>(
      "SELECT id FROM appointments WHERE reference_code IS NULL OR reference_code = '' ORDER BY id",
    );
    for (const appointment of appointmentsWithoutReference) {
      let referenceCode = "";
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const candidate = randomInt(0, 100_000_000).toString().padStart(8, "0");
        const [matches] = await connection.query<RowDataPacket[]>(
          "SELECT id FROM appointments WHERE reference_code = ? LIMIT 1",
          [candidate],
        );
        if (matches.length === 0) {
          referenceCode = candidate;
          break;
        }
      }
      if (!referenceCode) {
        throw new Error(`No se pudo generar un código de referencia para la cita ${appointment.id}.`);
      }
      await connection.query(
        "UPDATE appointments SET reference_code = ? WHERE id = ?",
        [referenceCode, appointment.id],
      );
    }
    const [referenceCodeIndexes] = await connection.query<RowDataPacket[]>(
      `SELECT INDEX_NAME
       FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'appointments'
         AND INDEX_NAME = 'uq_appointments_reference_code'`,
    );
    if (referenceCodeIndexes.length === 0) {
      await connection.query(
        "ALTER TABLE appointments ADD UNIQUE INDEX uq_appointments_reference_code (reference_code)",
      );
    }
    await connection.query(
      "ALTER TABLE appointments MODIFY reference_code CHAR(8) NOT NULL",
    );
    const dailyLogReferences = [
      {
        column: "appointment_id",
        definition: "BIGINT UNSIGNED NULL",
        index: "idx_daily_log_entries_appointment_id",
        constraint: "fk_daily_log_entries_appointment",
        referencedTable: "appointments",
      },
      {
        column: "external_staff_id",
        definition: "BIGINT UNSIGNED NULL",
        index: "idx_daily_log_entries_external_staff_id",
        constraint: "fk_daily_log_entries_external_staff",
        referencedTable: "external_staff",
      },
      {
        column: "visitor_record_id",
        definition: "BIGINT UNSIGNED NULL",
        index: "idx_daily_log_entries_visitor_record_id",
        constraint: "fk_daily_log_entries_visitor",
        referencedTable: "general_visitors",
      },
    ] as const;
    for (const reference of dailyLogReferences) {
      const [columns] = await connection.query<RowDataPacket[]>(
        `SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'daily_log_entries'
           AND COLUMN_NAME = ?`,
        [reference.column],
      );
      if (columns.length === 0) {
        await connection.query(
          `ALTER TABLE daily_log_entries ADD COLUMN ${reference.column} ${reference.definition}`,
        );
      }

      const [indexes] = await connection.query<RowDataPacket[]>(
        `SELECT INDEX_NAME
         FROM INFORMATION_SCHEMA.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'daily_log_entries'
           AND INDEX_NAME = ?`,
        [reference.index],
      );
      if (indexes.length === 0) {
        await connection.query(
          `ALTER TABLE daily_log_entries ADD INDEX ${reference.index} (${reference.column})`,
        );
      }

      const [constraints] = await connection.query<RowDataPacket[]>(
        `SELECT CONSTRAINT_NAME
         FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
         WHERE CONSTRAINT_SCHEMA = DATABASE()
           AND TABLE_NAME = 'daily_log_entries'
           AND CONSTRAINT_NAME = ?`,
        [reference.constraint],
      );
      if (constraints.length === 0) {
        await connection.query(
          `ALTER TABLE daily_log_entries
           ADD CONSTRAINT ${reference.constraint}
           FOREIGN KEY (${reference.column}) REFERENCES ${reference.referencedTable} (id)
           ON UPDATE CASCADE ON DELETE SET NULL`,
        );
      }
    }
    const dailyLogRecorderColumns = [
      { column: "recorded_by_login", definition: "VARCHAR(255) NULL AFTER person_name" },
      { column: "recorded_by_name", definition: "VARCHAR(255) NULL AFTER recorded_by_login" },
    ] as const;
    for (const recorderColumn of dailyLogRecorderColumns) {
      const [columns] = await connection.query<RowDataPacket[]>(
        `SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'daily_log_entries'
           AND COLUMN_NAME = ?`,
        [recorderColumn.column],
      );
      if (columns.length === 0) {
        await connection.query(
          `ALTER TABLE daily_log_entries ADD COLUMN ${recorderColumn.column} ${recorderColumn.definition}`,
        );
      }
    }
    console.log(`Migración completada: ${statements.length} instrucciones ejecutadas.`);
  } catch (error) {
    console.error("No se pudo completar la migración de la base de datos:", error);
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

await migrate();
