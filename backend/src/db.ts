import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: Bun.env.DB_HOST ?? "127.0.0.1",
  port: Number(Bun.env.DB_PORT ?? 3306),
  database: Bun.env.DB_NAME ?? "visitas",
  user: Bun.env.DB_USER ?? "visitas_app",
  password: Bun.env.DB_PASSWORD ?? "visitas_local",
  waitForConnections: true,
  connectionLimit: 10,
});

export default pool;
