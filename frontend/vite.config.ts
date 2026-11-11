import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const buildId = new Date().toISOString();

export default defineConfig({
  define: {
    __APP_BUILD_ID__: JSON.stringify(buildId),
  },
  plugins: [
    vue(),
    {
      name: "emit-app-build-id",
      configureServer(server) {
        server.middlewares.use("/app-version.json", (_request, response) => {
          response.setHeader("Cache-Control", "no-store");
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ buildId }));
        });
      },
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "app-version.json",
          source: JSON.stringify({ buildId }),
        });
      },
    },
  ],
  server: {
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
