# syntax=docker/dockerfile:1
#
# CRM — imagen de despliegue (UN ÚNICO contenedor global).
#
# Dentro del contenedor:
#   Postgres+PostGIS → bases `crm` y `analytics`  (interno, 127.0.0.1:5432)
#   Node             → backend NestJS compilado    (interno, 127.0.0.1:3100)
#   Python           → ia-service FastAPI          (interno, 127.0.0.1:8002)
#   Caddy            → sirve la web (SPA) + proxy reverso /api → backend
#
# Se publica SOLO el puerto 80 (la web). Nada más sale del contenedor.

###############################################################################
# 1) Web (React + Vite) → estáticos, compilados con API relativa (/api)
###############################################################################
FROM node:22-bookworm-slim AS web
RUN corepack enable
WORKDIR /web
COPY ["interface web/package.json", "interface web/pnpm-lock.yaml", "./"]
RUN pnpm install --frozen-lockfile
COPY ["interface web/", "./"]
# La web se sirve en el mismo origen; Caddy proxya /api → backend.
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}
RUN pnpm build

###############################################################################
# 2) Backend (NestJS) → dist + node_modules de producción
###############################################################################
FROM node:22-bookworm-slim AS backend
WORKDIR /backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/ ./
# build + genera el SQL del esquema (drizzle) que el contenedor aplicará a `crm`
RUN npm run build \
 && DATABASE_URL=postgresql://placeholder/db npx drizzle-kit generate \
 && npm prune --omit=dev

###############################################################################
# 3) Runtime: Postgres16+PostGIS + Node (backend) + Python (ia) + Caddy (proxy)
###############################################################################
FROM postgres:16-bookworm AS runtime

# Binarios de Node y Caddy, tomados de sus imágenes.
COPY --from=node:22-bookworm-slim /usr/local/bin/node /usr/local/bin/node
COPY --from=caddy:2.9.1 /usr/bin/caddy /usr/local/bin/caddy

# PostGIS (repo PGDG que ya trae la imagen), Python y tini.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      postgresql-16-postgis-3 python3 python3-venv python3-pip ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*

# --- backend ---
WORKDIR /app/backend
COPY --from=backend /backend/node_modules ./node_modules
COPY --from=backend /backend/dist ./dist
COPY --from=backend /backend/package.json ./package.json
COPY --from=backend /backend/drizzle ./drizzle

# --- ia-service (entorno virtual aislado) ---
COPY ia-service/ /app/ia-service/
RUN python3 -m venv /opt/ia-venv \
 && /opt/ia-venv/bin/pip install --no-cache-dir -r /app/ia-service/requirements.txt

# --- db: DDL y extensiones (se aplican en el arranque) ---
COPY db/init-operational.sql /app/db/init-operational.sql
COPY db/schema.sql /app/db/schema.sql

# --- web estática + proxy ---
COPY --from=web /web/dist /srv/www
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY deploy/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh \
 && sed -i 's/\r$//' /usr/local/bin/entrypoint.sh /etc/caddy/Caddyfile

ENV NODE_ENV=production \
    BACKEND_PORT=3100 \
    IA_SERVICE_PORT=8002 \
    IA_SERVICE_URL=http://127.0.0.1:8002 \
    DATABASE_URL=postgresql://postgres@127.0.0.1:5432/crm \
    DB_SSL=false \
    CORS_ORIGIN=http://localhost:8080 \
    CORS_CREDENTIALS=true \
    PGDATA=/var/lib/postgresql/data

EXPOSE 80
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
