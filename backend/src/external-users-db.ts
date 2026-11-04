import mysql from "mysql2/promise";

let pool: mysql.Pool | undefined;

export function getExternalUsersPool() {
  if (pool) return pool;

  const requiredValues = {
    DB_EXTERNAL_HOST: Bun.env.DB_EXTERNAL_HOST,
    DB_EXTERNAL_DATABASE: Bun.env.DB_EXTERNAL_DATABASE,
    DB_EXTERNAL_USERNAME: Bun.env.DB_EXTERNAL_USERNAME,
    DB_EXTERNAL_PASSWORD: Bun.env.DB_EXTERNAL_PASSWORD,
  };
  const missingValues = Object.entries(requiredValues)
    .filter(([, value]) => !value?.trim())
    .map(([name]) => name);
  if (missingValues.length > 0) {
    throw new Error(`Missing external users database configuration: ${missingValues.join(", ")}`);
  }

  const port = Number(Bun.env.DB_EXTERNAL_PORT ?? 3306);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("DB_EXTERNAL_PORT must be a valid TCP port.");
  }

  pool = mysql.createPool({
    host: requiredValues.DB_EXTERNAL_HOST,
    port,
    database: requiredValues.DB_EXTERNAL_DATABASE,
    user: requiredValues.DB_EXTERNAL_USERNAME,
    password: requiredValues.DB_EXTERNAL_PASSWORD,
    waitForConnections: true,
    connectionLimit: 5,
    connectTimeout: 10000,
  });
  return pool;
}
