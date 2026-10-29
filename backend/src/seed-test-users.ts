import type { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "./db";

type SeedUser = {
  login: string;
  name: string;
  email: string;
  active: string;
  priv_admin: string;
  role: string;
  sectionAccess: ("recepcion" | "administrador")[];
};

type ExistingUser = RowDataPacket & {
  login: string;
  pswd: string;
};

const seedUrl = new URL("../../database/seeds/001_test_users.json", import.meta.url);

async function seedTestUsers() {
  const password = Bun.env.SEED_TEST_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error("Define SEED_TEST_PASSWORD con al menos 12 caracteres para sembrar usuarios.");
  }

  const users = await Bun.file(seedUrl).json() as SeedUser[];
  const passwordHash = await Bun.password.hash(password, { algorithm: "argon2id" });
  if (!passwordHash.startsWith("$argon2id$")) {
    throw new Error("Bun no generó un hash Argon2id válido.");
  }
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    let inserted = 0;
    let initialized = 0;
    let updated = 0;
    let sectionPermissions = 0;

    for (const user of users) {
      const [rows] = await connection.execute<ExistingUser[]>(
        "SELECT login, pswd FROM accesos WHERE login = ? OR email = ? LIMIT 1 FOR UPDATE",
        [user.login, user.email],
      );
      const existing = rows[0];

      if (!existing) {
        await connection.execute(
          `INSERT INTO accesos (login, pswd, name, email, active, priv_admin, role)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [user.login, passwordHash, user.name, user.email, user.active, user.priv_admin, user.role],
        );
        inserted += 1;
      } else {
        const passwordUpdate = existing.pswd === "PENDIENTE_DE_HASH"
          ? ", pswd = ?"
          : "";
        const values = [
          user.name,
          user.email,
          user.active,
          user.priv_admin,
          user.role,
          ...(passwordUpdate ? [passwordHash] : []),
          existing.login,
        ];
        await connection.execute(
          `UPDATE accesos
           SET name = ?, email = ?, active = ?, priv_admin = ?, role = ?${passwordUpdate}
           WHERE login = ?`,
          values,
        );
        updated += 1;
        if (passwordUpdate) initialized += 1;
      }

      for (const section of user.sectionAccess) {
        const [permissionResult] = await connection.execute<ResultSetHeader>(
          "INSERT IGNORE INTO accesos_secciones (login, seccion) VALUES (?, ?)",
          [user.login, section],
        );
        sectionPermissions += permissionResult.affectedRows;
      }
    }

    await connection.commit();
    console.log(
      `Seed completado: ${inserted} usuarios insertados, ${updated} perfiles sincronizados, ${sectionPermissions} permisos de acceso creados y ${initialized} contraseñas inicializadas con Argon2id.`,
    );
  } catch (error) {
    await connection.rollback();
    console.error("No se pudieron insertar los usuarios de prueba:", error);
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

await seedTestUsers();
