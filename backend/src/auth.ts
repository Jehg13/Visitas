import type { RowDataPacket } from "mysql2";
import type { PoolConnection as PromisePoolConnection } from "mysql2/promise";
import pool from "./db";

type AccessRow = RowDataPacket & {
  login: string;
  pswd: string;
  name: string | null;
  email: string | null;
  active: string | null;
  role: string | null;
  priv_admin: string | null;
  section_admin: number;
};

export type AuthenticatedUser = {
  login: string;
  name: string | null;
  email: string | null;
  role: string | null;
  isAdmin: boolean;
  sessionKey: string;
};

type UserIdentityRow = RowDataPacket & {
  login: string;
  pswd: string;
  name: string | null;
  email: string | null;
  active: string | null;
  role: string | null;
  priv_admin: string | null;
  section_admin: number;
};

const dummyPasswordHash = Bun.password.hash(crypto.randomUUID(), {
  algorithm: "argon2id",
});

export async function getActiveUser(login: string): Promise<AuthenticatedUser | null> {
  const [rows] = await pool.execute<UserIdentityRow[]>(
    `SELECT login, pswd, name, email, active, role, priv_admin,
            EXISTS (
              SELECT 1 FROM accesos_secciones s
              WHERE s.login = accesos.login AND s.seccion = 'administrador'
            ) AS section_admin
     FROM accesos
     WHERE login = ?
     LIMIT 1`,
    [login],
  );
  const user = rows[0];
  if (!user || !["Y", "1"].includes(user.active ?? "")) return null;

  return {
    login: user.login,
    name: user.name,
    email: user.email,
    role: user.role,
    isAdmin: ["Y", "1"].includes(user.priv_admin ?? "") || Boolean(user.section_admin),
    sessionKey: user.pswd,
  };
}

export async function authenticateUser(
  identifier: string,
  password: string,
  connection?: PromisePoolConnection,
): Promise<AuthenticatedUser | null> {
  const query = `SELECT login, pswd, name, email, active, role, priv_admin,
          EXISTS (
            SELECT 1 FROM accesos_secciones s
            WHERE s.login = accesos.login AND s.seccion = 'administrador'
          ) AS section_admin
   FROM accesos
   WHERE login = ? OR email = ?
   LIMIT 1`;
  const values = [identifier, identifier];
  const [rows] = connection
    ? await connection.execute<AccessRow[]>(query, values)
    : await pool.execute<AccessRow[]>(
        query,
        values,
      );
  const user = rows[0];
  const hash = user?.pswd.startsWith("$argon2id$")
    ? user.pswd
    : await dummyPasswordHash;
  const passwordMatches = await Bun.password.verify(password, hash);

  if (
    !user ||
    !user.pswd.startsWith("$argon2id$") ||
    !passwordMatches ||
    !["Y", "1"].includes(user.active ?? "")
  ) {
    return null;
  }

  return {
    login: user.login,
    name: user.name,
    email: user.email,
    role: user.role,
    isAdmin: ["Y", "1"].includes(user.priv_admin ?? "") || Boolean(user.section_admin),
    sessionKey: user.pswd,
  };
}
