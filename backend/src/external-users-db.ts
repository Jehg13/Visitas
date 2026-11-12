import { isIP } from "node:net";
import mysql from "mysql2/promise";

let pool: mysql.Pool | undefined;

export function buildExternalUsersPoolOptions(
  env: Record<string, string | undefined> = Bun.env,
): mysql.PoolOptions {
  const requiredValues = {
    DB_EXTERNAL_HOST: env.DB_EXTERNAL_HOST,
    DB_EXTERNAL_DATABASE: env.DB_EXTERNAL_DATABASE,
    DB_EXTERNAL_USERNAME: env.DB_EXTERNAL_USERNAME,
    DB_EXTERNAL_PASSWORD: env.DB_EXTERNAL_PASSWORD,
  };
  const missingValues = Object.entries(requiredValues)
    .filter(([, value]) => !value?.trim())
    .map(([name]) => name);
  if (missingValues.length > 0) {
    throw new Error(`Missing external users database configuration: ${missingValues.join(", ")}`);
  }

  const port = Number(env.DB_EXTERNAL_PORT ?? 3306);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("DB_EXTERNAL_PORT must be a valid TCP port.");
  }

  const sslValue = env.DB_EXTERNAL_SSL?.trim().toLowerCase();
  if (sslValue && sslValue !== "true" && sslValue !== "false") {
    throw new Error("DB_EXTERNAL_SSL must be set to true or false.");
  }
  const useSsl = sslValue === "true";
  const host = requiredValues.DB_EXTERNAL_HOST;
  if (useSsl && host !== undefined && isIP(host)) {
    throw new Error("DB_EXTERNAL_HOST must be a DNS hostname when TLS is enabled.");
  }
  const ca = env.DB_EXTERNAL_SSL_CA?.trim();
  if (ca && !useSsl) {
    throw new Error("DB_EXTERNAL_SSL_CA requires DB_EXTERNAL_SSL=true.");
  }
  if (ca && !ca.includes("-----BEGIN CERTIFICATE-----")) {
    throw new Error("DB_EXTERNAL_SSL_CA must contain a PEM-encoded certificate.");
  }

  return {
    host,
    port,
    database: requiredValues.DB_EXTERNAL_DATABASE,
    user: requiredValues.DB_EXTERNAL_USERNAME,
    password: requiredValues.DB_EXTERNAL_PASSWORD,
    waitForConnections: true,
    connectionLimit: 5,
    connectTimeout: 10000,
    ...(useSsl
      ? {
          ssl: {
            rejectUnauthorized: true,
            verifyIdentity: true,
            ...(ca ? { ca } : {}),
          },
        }
      : {}),
  };
}

export function getExternalUsersPool() {
  if (pool) return pool;

  pool = mysql.createPool(buildExternalUsersPoolOptions());
  return pool;
}
