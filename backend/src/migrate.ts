import pool from "./db";
import { getExternalUsersPool } from "./external-users-db";
import type { RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { randomInt } from "node:crypto";

const migrationUrl = new URL("../../database/init/002_create_application_tables.sql", import.meta.url);
const equipmentMigrationUrl = new URL("../../database/init/004_create_equipment_workflow.sql", import.meta.url);
const appointmentHistoryMigrationUrl = new URL("../../database/init/005_create_appointment_history.sql", import.meta.url);
const visitorIdentificationMigrationUrl = new URL(
  "../../database/init/006_expand_visitor_identification_type.sql",
  import.meta.url,
);
const departmentHostsMigrationUrl = new URL(
  "../../database/init/007_create_department_hosts.sql",
  import.meta.url,
);

async function migrate() {
  const migrationFiles = [
    migrationUrl,
    equipmentMigrationUrl,
    appointmentHistoryMigrationUrl,
    visitorIdentificationMigrationUrl,
    departmentHostsMigrationUrl,
  ];
  const statements = (await Promise.all(migrationFiles.map((url) => Bun.file(url).text())))
    .flatMap((sql) => sql.split(";").map((statement) => statement.trim()).filter(Boolean));
  const maxRetries = 15;
  const retryIntervalMs = 2000;
  let connection: PoolConnection | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      console.log(`[db:migrate] Conectando a la base de datos (${Bun.env.DB_HOST ?? "127.0.0.1"}:${Bun.env.DB_PORT ?? 3306}/${Bun.env.DB_NAME ?? "visitas_recep"})... (intento ${attempt}/${maxRetries})`);
      connection = await pool.getConnection();
      console.log("[db:migrate] Conexión establecida con éxito.");
      break;
    } catch (err: any) {
      console.warn(`[db:migrate] Intento ${attempt}/${maxRetries} falló: ${err?.message ?? err}`);
      if (attempt === maxRetries) {
        throw new Error(`[db:migrate] No se pudo conectar a la base de datos después de ${maxRetries} intentos: ${err?.message ?? err}`);
      }
      await new Promise((resolve) => setTimeout(resolve, retryIntervalMs));
    }
  }

  if (!connection) {
    throw new Error("[db:migrate] No se pudo obtener una conexión con la base de datos.");
  }

  try {
    for (const statement of statements) {
      await connection.query(statement);
    }
    const [visitorKioskColumns] = await connection.query<RowDataPacket[]>(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'visitor_kiosk_registrations'
         AND COLUMN_NAME = 'reception_id_claim_status'`,
    );
    if (visitorKioskColumns.length === 0) {
      await connection.query(
        `ALTER TABLE visitor_kiosk_registrations
         ADD COLUMN reception_id_claim_status
           ENUM('No aplica', 'Pendiente', 'Confirmada', 'No confirmada')
           NOT NULL DEFAULT 'No aplica'
           AFTER visitor_declared_id_retained`,
      );
    }
    await connection.query(
      `UPDATE visitor_kiosk_registrations
       SET reception_id_claim_status =
         CASE WHEN reception_received_id_at IS NULL THEN 'Pendiente' ELSE 'Confirmada' END
       WHERE visitor_declared_id_retained = TRUE
         AND reception_id_claim_status = 'No aplica'`,
    );
    await connection.query(
      `ALTER TABLE visitor_kiosk_inspection_items
       MODIFY kiosk_item_id BIGINT UNSIGNED NULL,
       MODIFY result ENUM('Conforme', 'Incidencia', 'Coincide', 'Faltante', 'Dañado', 'Extra') NOT NULL`,
    );
    for (const [tableName, columnName] of [
      ["visitor_kiosk_inspection_items", "keep_at_reception"],
      ["equipment_inspection_items", "keep_at_reception"],
    ]) {
      const [columns] = await connection.execute<RowDataPacket[]>(
        `SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [tableName, columnName],
      );
      if (columns.length === 0) {
        await connection.query(
          `ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` BOOLEAN NOT NULL DEFAULT FALSE AFTER notes`,
        );
      }
    }
    for (const tableName of [
      "visitor_kiosk_inspection_items",
      "equipment_inspection_items",
    ]) {
      const [columns] = await connection.execute<RowDataPacket[]>(
        `SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
           AND COLUMN_NAME = 'returned_to_visitor'`,
        [tableName],
      );
      if (columns.length === 0) {
        await connection.query(
          `ALTER TABLE \`${tableName}\`
           ADD COLUMN returned_to_visitor BOOLEAN NOT NULL DEFAULT FALSE
           AFTER keep_at_reception`,
        );
      }
    }
    const [visitorColumns] = await connection.query<RowDataPacket[]>(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'business_partners'
         AND COLUMN_NAME IN ('subject', 'visitor_record_id')`,
    );
    const existingVisitorColumns = new Set(visitorColumns.map((column) => String(column.COLUMN_NAME)));
    if (!existingVisitorColumns.has("subject")) {
      await connection.query(
        "ALTER TABLE business_partners ADD COLUMN subject VARCHAR(500) NULL AFTER category",
      );
    }
    if (!existingVisitorColumns.has("visitor_record_id")) {
      await connection.query(
        "ALTER TABLE business_partners ADD COLUMN visitor_record_id BIGINT UNSIGNED NULL AFTER subject",
      );
    }
    const [businessPartnerOwnerColumns] = await connection.query<RowDataPacket[]>(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'business_partners'
         AND COLUMN_NAME IN ('created_by_login', 'created_by_name')`,
    );
    const existingBusinessPartnerOwnerColumns = new Set(
      businessPartnerOwnerColumns.map((column) => String(column.COLUMN_NAME)),
    );
    if (!existingBusinessPartnerOwnerColumns.has("created_by_login")) {
      await connection.query(
        "ALTER TABLE business_partners ADD COLUMN created_by_login VARCHAR(255) NULL AFTER is_active",
      );
    }
    if (!existingBusinessPartnerOwnerColumns.has("created_by_name")) {
      await connection.query(
        "ALTER TABLE business_partners ADD COLUMN created_by_name VARCHAR(255) NULL AFTER created_by_login",
      );
    }
    const [businessPartnerOwnerIndexes] = await connection.query<RowDataPacket[]>(
      `SELECT INDEX_NAME
       FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'business_partners'
         AND INDEX_NAME = 'idx_business_partners_created_by_login'`,
    );
    if (businessPartnerOwnerIndexes.length === 0) {
      await connection.query(
        "ALTER TABLE business_partners ADD INDEX idx_business_partners_created_by_login (created_by_login)",
      );
    }
    await connection.query(
      "ALTER TABLE general_visitors MODIFY curp CHAR(18) NULL",
    );
    await connection.query(
      "ALTER TABLE business_partners MODIFY rfc VARCHAR(13) NULL",
    );
    await connection.query(
      "ALTER TABLE business_partners MODIFY partner_type ENUM('Contratista', 'Proveedor', 'Visitante') NOT NULL",
    );
    const [visitorIndexes] = await connection.query<RowDataPacket[]>(
      `SELECT INDEX_NAME
       FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'business_partners'
         AND INDEX_NAME = 'uq_business_partners_visitor_record'`,
    );
    if (visitorIndexes.length === 0) {
      await connection.query(
        "ALTER TABLE business_partners ADD UNIQUE INDEX uq_business_partners_visitor_record (visitor_record_id)",
      );
    }
    const [visitorConstraints] = await connection.query<RowDataPacket[]>(
      `SELECT CONSTRAINT_NAME
       FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
       WHERE CONSTRAINT_SCHEMA = DATABASE()
         AND TABLE_NAME = 'business_partners'
         AND CONSTRAINT_NAME = 'fk_business_partners_visitor'`,
    );
    if (visitorConstraints.length === 0) {
      await connection.query(
        `ALTER TABLE business_partners
         ADD CONSTRAINT fk_business_partners_visitor
         FOREIGN KEY (visitor_record_id) REFERENCES general_visitors (id)
         ON UPDATE CASCADE ON DELETE RESTRICT`,
      );
    }
    await connection.query(
      `CREATE TABLE IF NOT EXISTS app_migrations (
         migration_key VARCHAR(120) NOT NULL,
         completed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
         PRIMARY KEY (migration_key)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
    const initialAdminLogin = Bun.env.INITIAL_ADMIN_LOGIN?.trim();
    if (initialAdminLogin) {
      if (initialAdminLogin.length > 255) {
        throw new Error("INITIAL_ADMIN_LOGIN must be 255 characters or fewer.");
      }
      const [externalAdmins] = await getExternalUsersPool().execute<RowDataPacket[]>(
        "SELECT login FROM seg_users WHERE login = ? AND active IN ('Y', '1') LIMIT 1",
        [initialAdminLogin],
      );
      if (externalAdmins.length === 0) {
        throw new Error("INITIAL_ADMIN_LOGIN must match an active account in seg_users.");
      }
      await connection.execute(
        "INSERT IGNORE INTO accesos_secciones (login, seccion) VALUES (?, 'administrador')",
        [initialAdminLogin],
      );
      await connection.execute(
        "INSERT IGNORE INTO app_migrations (migration_key) VALUES ('initial-admin-section-access-v1')",
      );
    }
    const [visitorBackfill] = await connection.execute<RowDataPacket[]>(
      "SELECT migration_key FROM app_migrations WHERE migration_key = 'visitor-partners-backfill-v1' LIMIT 1",
    );
    if (visitorBackfill.length === 0) {
      await connection.query(
        `INSERT INTO business_partners
           (name, description, rfc, category, subject, visitor_record_id,
            employee_count, partner_type, is_active)
         SELECT visitors.full_name, 'Público General', NULL, 'Visitante', NULL, visitors.id,
                1, 'Visitante', TRUE
         FROM general_visitors AS visitors
         WHERE NOT EXISTS (
           SELECT 1
           FROM business_partners AS partners
           WHERE partners.visitor_record_id = visitors.id
         )`,
      );
      await connection.execute(
        "INSERT INTO app_migrations (migration_key) VALUES ('visitor-partners-backfill-v1')",
      );
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
    const [unassignedAppointments] = await connection.query<RowDataPacket[]>(
      `SELECT id, registered_by
       FROM appointments
       WHERE created_by_login IS NULL AND registered_by <> ''`,
    );
    const registeredByValues = [...new Set(
      unassignedAppointments.map((appointment) => String(appointment.registered_by).trim()).filter(Boolean),
    )];
    if (registeredByValues.length > 0) {
      const [users] = await getExternalUsersPool().query<RowDataPacket[]>(
        `SELECT login, name
         FROM seg_users
         WHERE login IN (?) OR name IN (?)`,
        [registeredByValues, registeredByValues],
      );
      const loginsByIdentity = new Map<string, Set<string>>();
      for (const user of users) {
        const login = String(user.login);
        for (const identity of [user.login, user.name]) {
          if (typeof identity !== "string" || !identity.trim()) continue;
          const key = identity.trim().toLocaleLowerCase();
          const logins = loginsByIdentity.get(key) ?? new Set<string>();
          logins.add(login);
          loginsByIdentity.set(key, logins);
        }
      }
      for (const appointment of unassignedAppointments) {
        const key = String(appointment.registered_by).trim().toLocaleLowerCase();
        const logins = loginsByIdentity.get(key);
        if (logins?.size === 1) {
          await connection.execute(
            "UPDATE appointments SET created_by_login = ? WHERE id = ? AND created_by_login IS NULL",
            [[...logins][0], appointment.id],
          );
        }
      }
    }
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
    const [appointmentDeletedAtColumns] = await connection.query<RowDataPacket[]>(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'appointments'
         AND COLUMN_NAME = 'deleted_at'`,
    );
    if (appointmentDeletedAtColumns.length === 0) {
      await connection.query(
        "ALTER TABLE appointments ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL AFTER updated_at",
      );
    }
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
  } catch (error: any) {
    console.error("[db:migrate] No se pudo completar la migración de la base de datos:", error?.message ?? error);
    if (error?.sqlMessage) {
      console.error("[db:migrate] Detalle SQL:", error.sqlMessage);
    }
    if (error?.code) {
      console.error("[db:migrate] Código de error:", error.code);
    }
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

await migrate();
