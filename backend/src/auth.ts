import type { RowDataPacket } from "mysql2";
import { createHash, timingSafeEqual } from "node:crypto";
import pool from "./db";
import { getExternalUsersPool } from "./external-users-db";

type AccessRow = RowDataPacket & {
  login: string;
  pswd: string;
  name: string | null;
  email: string | null;
  active: string | null;
  role: string | null;
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
};

const dummyPasswordHash = Bun.password.hash(crypto.randomUUID(), {
  algorithm: "argon2id",
});

function hasProgrammerRole(role: string | null) {
  return role?.trim().toLocaleLowerCase("es") === "programador";
}

export async function getActiveUser(login: string): Promise<AuthenticatedUser | null> {
  const [rows] = await getExternalUsersPool().execute<UserIdentityRow[]>(
    `SELECT login, pswd, name, email, active, role
     FROM seg_users
     WHERE login = ?
     LIMIT 1`,
    [login],
  );
  const user = rows[0];
  if (!user || !["Y", "1"].includes(user.active ?? "")) return null;
  const [sectionRows] = await pool.execute<RowDataPacket[]>(
    "SELECT 1 FROM accesos_secciones WHERE login = ? AND seccion = 'administrador' LIMIT 1",
    [user.login],
  );

  return {
    login: user.login,
    name: user.name,
    email: user.email,
    role: user.role,
    isAdmin: sectionRows.length > 0 || hasProgrammerRole(user.role),
    sessionKey: user.pswd,
  };
}

export async function authenticateUser(
  identifier: string,
  password: string,
): Promise<AuthenticatedUser | null> {
  const query = `SELECT login, pswd, name, email, active, role
   FROM seg_users
   WHERE login = ? OR email = ?
   LIMIT 1`;
  const values = [identifier, identifier];
  const [rows] = await getExternalUsersPool().execute<AccessRow[]>(query, values);
  const user = rows[0];
  const isArgon2id = user?.pswd.startsWith("$argon2id$") ?? false;
  const isLegacyMd5 = user ? /^[a-f\d]{32}$/i.test(user.pswd) : false;
  const hash = user && isArgon2id
    ? user.pswd
    : await dummyPasswordHash;
  const passwordMatches = await Bun.password.verify(password, hash);
  const legacyMd5Matches = isLegacyMd5 && user
    ? timingSafeEqual(
        Buffer.from(createHash("md5").update(password, "utf8").digest("hex")),
        Buffer.from(user.pswd.toLowerCase()),
      )
    : false;

  if (
    !user ||
    !(isArgon2id ? passwordMatches : legacyMd5Matches) ||
    !["Y", "1"].includes(user.active ?? "")
  ) {
    return null;
  }
  const [sectionRows] = await pool.execute<RowDataPacket[]>(
    "SELECT 1 FROM accesos_secciones WHERE login = ? AND seccion = 'administrador' LIMIT 1",
    [user.login],
  );

  return {
    login: user.login,
    name: user.name,
    email: user.email,
    role: user.role,
    isAdmin: sectionRows.length > 0 || hasProgrammerRole(user.role),
    sessionKey: user.pswd,
  };
}
