# syntax=docker/dockerfile:1
# ============================================================
# Imagen ÚNICA (contenedor de aplicación) del stack CRM:
#   backend NestJS + ia-service FastAPI + ML (clustering/xgboost/uplift)
#   + panel web (Vite) + Caddy.
#
# Caddy expone el puerto público y enruta por dominio/host; backend,
# ia-service y los servicios ML escuchan solo en 127.0.0.1 (red interna del
# contenedor). El proceso corre como usuario SIN privilegios y Caddy escucha en
# :8080/:8443 (el compose los publica como 80/443). Los dominios/hosts se
# configuran por variables de entorno en runtime (ver docker/gen-caddyfile.mjs y
# docker/docker-compose.yml).
#
# Las bases de datos (crm :5437 / analytics :5436) NO van en esta imagen: las
# levanta docker/docker-compose.yml en la red interna (nunca publicadas).
#
# Construir: docker compose -f docker/docker-compose.yml build
# El contexto de build es la raíz del repo.
# ============================================================

# ── 1. Backend NestJS ───────────────────────────────────────
FROM node:20-bookworm-slim AS backend
WORKDIR /build/backend

# Dependencias primero (capa cacheable). El proyecto usa npm (ver dev.js).
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY backend/ ./
# `nest build` compila src/ → dist/src (drizzle.config.ts de la raíz entra en el
# build y fija la raíz común). `drizzle/schema.ts` se importa en runtime
# (src/database/drizzle.service.ts) pero tsconfig.build.json lo excluye del
# build principal: se compila aparte al MISMO layout (dist/drizzle/schema.js).
RUN npm run build \
 && ./node_modules/.bin/tsc \
      --outDir dist --rootDir . \
      --module nodenext --moduleResolution nodenext --target ES2023 \
      --esModuleInterop --skipLibCheck --declaration false --sourceMap false \
      drizzle/schema.ts \
 && npm prune --omit=dev

# ── 2. Panel web (Vite) ─────────────────────────────────────
# Las VITE_* se hornean en el bundle: pásalas como --build-arg con las URLs
# públicas (p. ej. https://crm-api.tudominio.com).
FROM node:20-bookworm-slim AS fronts
ARG VITE_API_URL=http://localhost:3100
ARG VITE_SMS_API_URL=
ENV VITE_API_URL=${VITE_API_URL} \
    VITE_SMS_API_URL=${VITE_SMS_API_URL} \
    CI=true
RUN corepack enable
WORKDIR /fronts
COPY ["interface web/package.json", "interface web/pnpm-lock.yaml", "./"]
RUN pnpm install --frozen-lockfile
COPY ["interface web/", "./"]
RUN pnpm run build

# ── 3-5. Servicios de ML (un venv aislado por servicio) ──────
# clustering / xgboost / uplift tienen dependencias pesadas y potencialmente
# incompatibles entre sí (scikit-learn, xgboost, shap, econml). Cada uno usa su
# propio venv.
#
# IMPORTANTE: se usan Python 3.13 (python:3.13-slim-bookworm), la misma versión
# con la que se entrenaron los modelos en Astaroth. xgboost 3.4.1 exige
# Python >=3.12; con 3.11 no se pueden cargar los modelos tal cual.
# El runtime usa la MISMA base, así que los symlinks del venv
# (`bin/python → /usr/local/bin/python3.13`) existen allí.
FROM python:3.13-slim-bookworm AS ml-base

FROM ml-base AS ml-clustering
WORKDIR /build/clustering-api
COPY ml/clustering-api/requirements.txt .
RUN python3 -m venv /opt/clustering-venv \
 && /opt/clustering-venv/bin/pip install --no-cache-dir -r requirements.txt
COPY ml/clustering-api/ ./

FROM ml-base AS ml-xgboost
WORKDIR /build/xgboost-api
COPY ml/xgboost-api/requirements.txt .
RUN python3 -m venv /opt/xgboost-venv \
 && /opt/xgboost-venv/bin/pip install --no-cache-dir -r requirements.txt
COPY ml/xgboost-api/ ./

FROM ml-base AS ml-uplift
WORKDIR /build/uplift-api
COPY ml/uplift-api/requirements.txt .
RUN python3 -m venv /opt/uplift-venv \
 && /opt/uplift-venv/bin/pip install --no-cache-dir -r requirements.txt
COPY ml/uplift-api/ ./

# ── 6. Runtime: Node + Python + Caddy + ML ──────────────
# Base Python 3.13 (igual que los venvs de ML y que Astaroth). Node se copia
# de la imagen oficial: el backend ya viene compilado y en runtime solo se
# necesita el binario `node` (no npm).
FROM python:3.13-slim-bookworm AS runtime
COPY --from=node:20-bookworm-slim /usr/local/bin/node /usr/local/bin/node

ENV NODE_ENV=production \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    BACKEND_PORT=3100 \
    IA_PORT=8002 \
    CLUSTERING_PORT=8010 \
    XGBOOST_PORT=8011 \
    UPLIFT_PORT=8012 \
    HTTP_PORT=8080 \
    HTTPS_PORT=8443 \
    XDG_DATA_HOME=/data \
    XDG_CONFIG_HOME=/config \
    CADDYFILE_OUT=/config/Caddyfile.generated

# libgomp1: runtime de OpenMP que necesitan los wheels de xgboost/sklearn.
# libstdc++6: lo necesita el binario de Node copiado desde la imagen oficial.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libgomp1 libstdc++6 \
      curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Caddy: reverse proxy (TLS automático) y servidor de estáticos.
ARG CADDY_VERSION=2.11.7
RUN curl -fsSL "https://github.com/caddyserver/caddy/releases/download/v${CADDY_VERSION}/caddy_${CADDY_VERSION}_linux_amd64.tar.gz" \
      | tar -xz -C /usr/local/bin caddy \
    && chmod +x /usr/local/bin/caddy

WORKDIR /app

# Backend compilado.
COPY --from=backend /build/backend/dist ./backend/dist
COPY --from=backend /build/backend/node_modules ./backend/node_modules
COPY --from=backend /build/backend/package.json ./backend/package.json
COPY --from=backend /build/backend/scripts/sync-schema.js ./backend/scripts/sync-schema.js
COPY --from=backend /build/backend/scripts/init-db.js ./backend/scripts/init-db.js
# SQL idempotente de extensiones de la BD operativa (lo ejecuta init-db.js).
COPY db/init-operational.sql ./db/init-operational.sql

# Panel compilado.
COPY --from=fronts /fronts/dist /srv/web

# ia-service (Python).
COPY ia-service/ ./ia-service
RUN python3 -m venv /opt/ia-venv \
 && /opt/ia-venv/bin/pip install --no-cache-dir -r ./ia-service/requirements.txt

# Servicios de ML: venvs + código + modelos entrenados (saved_models).
# Los modelos se hornean en la imagen (~15 MB) porque son necesarios para que
# la segmentación/propensión/uplift funcionen sin montar volúmenes.
COPY --from=ml-clustering /opt/clustering-venv /opt/clustering-venv
COPY --from=ml-xgboost /opt/xgboost-venv /opt/xgboost-venv
COPY --from=ml-uplift /opt/uplift-venv /opt/uplift-venv
COPY --from=ml-clustering /build/clustering-api ./ml/clustering-api
COPY --from=ml-xgboost /build/xgboost-api ./ml/xgboost-api
COPY --from=ml-uplift /build/uplift-api ./ml/uplift-api

# Proxy + arranque.
COPY docker/entrypoint.sh ./entrypoint.sh
COPY docker/gen-caddyfile.mjs ./gen-caddyfile.mjs
# Normaliza CRLF (el repo puede clonarse/trabajarse en Windows), da permisos,
# crea los directorios persistentes (certificados ACME en /data y logs de
# winston en /app/backend/logs) y un usuario SIN privilegios con el que se
# ejecuta todo.
RUN sed -i 's/\r$//' ./entrypoint.sh \
 && chmod +x ./entrypoint.sh \
 && mkdir -p /data /config /app/backend/logs \
 && groupadd --system --gid 10002 crm \
 && useradd --system --uid 10002 --gid crm --home-dir /app --shell /usr/sbin/nologin crm \
 && chown -R crm:crm /data /config /app/backend/logs /app/ml

# No root: Caddy escucha en 8080/8443 (el host publica 80/443).
USER crm

EXPOSE 8080 8443 8010 8011 8012
CMD ["./entrypoint.sh"]
