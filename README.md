# Visitas

Esqueleto de aplicación con Vue 3 y TypeScript para el frontend, Bun y TypeScript para la API, y MySQL 8.4 como base de datos.

## Requisitos

- [Bun](https://bun.sh/) 1.2 o posterior
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) con Docker Compose

## Inicio rápido

1. Instala las dependencias desde la raíz:

   ```powershell
   bun install
   ```

2. Crea el archivo de configuración del backend:

   ```powershell
   Copy-Item backend\.env.example backend\.env
   ```

3. Inicia MySQL:

   ```powershell
   docker compose up -d db
   ```

4. En una terminal, inicia la API:

   ```powershell
   bun run dev:backend
   ```

5. En otra terminal, inicia el frontend:

   ```powershell
   bun run dev:frontend
   ```

Abre <http://localhost:5173>. Vite reenvía las solicitudes `/api` a `http://localhost:3000`.
La API ofrece `GET /api/health` para comprobar la conexión y `GET /api/visits` para consultar las visitas.

## Comandos

| Comando | Descripción |
| --- | --- |
| `bun run dev:frontend` | Inicia Vue con recarga en caliente |
| `bun run dev:backend` | Inicia la API con reinicio al cambiar archivos |
| `bun run typecheck` | Comprueba los tipos de frontend y backend |
| `bun run build` | Genera el build del frontend y comprueba el backend |
| `docker compose up -d db` | Inicia MySQL en segundo plano |
| `docker compose down` | Detiene MySQL conservando sus datos |

## Estructura

```text
frontend/              Aplicación Vue 3 + Vite + TypeScript
backend/               API Bun + TypeScript
  src/db.ts            Pool de conexiones MySQL
  src/index.ts         Endpoints HTTP
database/init/         Esquema inicial de MySQL
docker-compose.yml     Servicio local de base de datos
```

Las credenciales de Compose son solo para desarrollo local. Cámbialas antes de usar este proyecto en un entorno compartido o de producción.
