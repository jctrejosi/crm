#!/usr/bin/env bash
# Arranque del contenedor de aplicación del CRM:
#   1. backend NestJS → 127.0.0.1:${BACKEND_PORT:-3100}  (interno)
#   2. ia-service     → 127.0.0.1:${IA_PORT:-8002}       (interno)
#   3. Caddy          → :${HTTP_PORT:-8080} / :${HTTPS_PORT:-8443}  (el compose publica 80/443)
#
# El Caddyfile se genera en runtime desde variables de entorno
# (gen-caddyfile.mjs), así que los dominios/hosts se configuran sin rebuild.
set -euo pipefail

BACKEND_PORT="${BACKEND_PORT:-3100}"
IA_PORT="${IA_PORT:-8002}"
# Caddy no corre como root → escucha en puertos altos que el compose publica 80/443.
HTTP_PORT="${HTTP_PORT:-8080}"
HTTPS_PORT="${HTTPS_PORT:-8443}"
export BACKEND_PORT IA_PORT HTTP_PORT HTTPS_PORT

# ── Salvaguardas de seguridad (fail-closed) ─────────────────

# TLS=false publica el sitio sin cifrar (credenciales y tokens en claro): hay
# que aceptarlo explícitamente para evitar dejarlo así por descuido.
TLS="${TLS:-true}"
if [ "$TLS" = "false" ] && [ "${ALLOW_INSECURE:-false}" != "true" ]; then
  echo "✘ TLS=false publica el sitio SIN cifrar (credenciales y tokens en claro)." >&2
  echo "  Si es una prueba local a propósito, arranca con ALLOW_INSECURE=true." >&2
  exit 1
fi
if [ "$TLS" = "false" ]; then
  echo "⚠️  TLS DESACTIVADO (ALLOW_INSECURE=true): el tráfico viaja sin cifrar." >&2
fi

# El panel se protege además con Basic Auth por defecto (defensa en profundidad
# sobre el login JWT del CRM): sin credenciales NO arrancamos, en vez de dejarlo
# abierto en silencio.
PROTECT_WEB="${PROTECT_WEB:-true}"
if [ "$PROTECT_WEB" = "true" ] && [ -z "${ADMIN_PASSWORD_HASH:-}" ] && [ -z "${ADMIN_PASSWORD:-}" ]; then
  echo "✘ PROTECT_WEB=true pero falta ADMIN_PASSWORD o ADMIN_PASSWORD_HASH." >&2
  echo "  Define una en docker/.env, o pon PROTECT_WEB=false (no recomendado)." >&2
  exit 1
fi

# El backend no arranca sin JWT_SECRET (jwt.config.ts lanza al cargar). Fallamos
# antes, con un mensaje claro, en vez de morir con un stacktrace de Nest.
if [ -z "${JWT_SECRET:-}" ]; then
  echo "✘ Falta JWT_SECRET (obligatorio para firmar los JWT del panel)." >&2
  echo "  Genera uno con:  openssl rand -hex 32" >&2
  echo "  y defínelo en docker/.env." >&2
  exit 1
fi

# CORS_ORIGIN: si no lo defines, se deriva de HOST_WEB (lo usan el backend y el
# ia-service; el panel es el único origen del navegador).
# `PUBLIC_SCHEME` fija el esquema público real cuando TLS=false porque TLS lo
# termina un edge por delante (modo edge compartido: PUBLIC_SCHEME=https).
if [ -z "${CORS_ORIGIN:-}" ]; then
  scheme="${PUBLIC_SCHEME:-https}"
  if [ -z "${PUBLIC_SCHEME:-}" ] && [ "$TLS" = "false" ]; then
    scheme="http"
  fi
  CORS_ORIGIN=""
  for h in "${HOST_WEB:-}"; do
    [ -n "$h" ] && CORS_ORIGIN="${CORS_ORIGIN:+$CORS_ORIGIN,}${scheme}://${h}"
  done
  export CORS_ORIGIN
fi

echo "==> CRM (contenedor): backend :${BACKEND_PORT} · ia-service :${IA_PORT} · Caddy :${HTTP_PORT}/:${HTTPS_PORT}"
node /app/gen-caddyfile.mjs
# Normaliza el formato (evita el aviso de 'not formatted' de Caddy).
caddy fmt --overwrite "${CADDYFILE_OUT:-/config/Caddyfile.generated}"

# ---- Backend NestJS ----
cd /app/backend
# Sync de esquema idempotente (ADD COLUMN IF NOT EXISTS); si falla se avisa,
# pero no se aborta el arranque (la app reintenta al conectar).
echo "==> backend: sync de esquema"
if ! DATABASE_URL="${DATABASE_URL:-}" DB_SSL="${DB_SSL:-false}" node scripts/sync-schema.js; then
  echo "==> backend: ⚠️  el sync de esquema falló (¿DATABASE_URL o BD caída?); se continúa" >&2
fi

MAIN="dist/src/main.js"
[ -f "$MAIN" ] || MAIN="dist/main.js"
echo "==> backend: node $MAIN (:${BACKEND_PORT})"
BACKEND_PORT="$BACKEND_PORT" node "$MAIN" &
BACKEND_PID=$!

# ---- ia-service FastAPI ----
cd /app/ia-service
echo "==> ia-service: uvicorn (:${IA_PORT})"
/opt/ia-venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port "$IA_PORT" &
IA_PID=$!

# ---- Caddy (proxy + TLS + estáticos) ----
cd /app
echo "==> caddy: :${HTTP_PORT}/:${HTTPS_PORT}"
caddy run --config "${CADDYFILE_OUT:-/config/Caddyfile.generated}" --adapter caddyfile &
CADDY_PID=$!

# Si cualquiera muere, se detiene todo (el orquestador reinicia el contenedor).
trap 'kill "$BACKEND_PID" "$IA_PID" "$CADDY_PID" 2>/dev/null || true' INT TERM EXIT

wait -n "$BACKEND_PID" "$IA_PID" "$CADDY_PID"
