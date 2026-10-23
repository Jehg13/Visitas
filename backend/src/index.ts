import pool from "./db";

const port = Number(Bun.env.PORT ?? 3000);

const server = Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/health") {
      try {
        await pool.query("SELECT 1");
        return Response.json({ status: "ok", database: "connected" });
      } catch (error) {
        console.error("Database health check failed:", error);
        return Response.json(
          { status: "error", database: "disconnected" },
          { status: 503 },
        );
      }
    }

    if (request.method === "GET" && url.pathname === "/api/visits") {
      try {
        const [visits] = await pool.query(
          "SELECT id, visitor_name, visited_at FROM visits ORDER BY visited_at DESC",
        );
        return Response.json(visits);
      } catch (error) {
        console.error("Failed to load visits:", error);
        return Response.json(
          { error: "No se pudieron cargar las visitas." },
          { status: 500 },
        );
      }
    }

    return Response.json({ error: "Ruta no encontrada." }, { status: 404 });
  },
});

console.log(`API disponible en http://localhost:${server.port}`);
