FROM oven/bun:1.2-alpine AS dependencies

WORKDIR /app

COPY package.json bun.lock ./
COPY frontend/package.json frontend/package.json
COPY backend/package.json backend/package.json
RUN bun install --frozen-lockfile

FROM dependencies AS frontend-build

COPY frontend frontend
RUN bun run --filter visitas-frontend build

FROM oven/bun:1.2-alpine AS api

WORKDIR /app
ENV NODE_ENV=production

COPY package.json bun.lock ./
COPY frontend/package.json frontend/package.json
COPY backend/package.json backend/package.json
RUN bun install --frozen-lockfile --production

COPY backend backend
COPY database database

EXPOSE 3000

CMD ["bun", "run", "--filter", "visitas-backend", "start"]

FROM nginx:stable-alpine AS web

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend-build /app/frontend/dist /usr/share/nginx/html

EXPOSE 80
