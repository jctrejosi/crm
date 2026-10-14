#!/usr/bin/env bash
# Contenedor único del CRM. Arranca, en orden y en el mismo contenedor:
#
#   Postgres+PostGIS  → bases `crm` (extensión PostGIS) y `analytics`  (127.0.0.1:5432)
#   backend (NestJS)  → 127.0.0.1:${BACKEND_PORT:-3100}
#   ia-service        → 127.0.0.1:${IA_SERVICE_PORT:-8002}
#   Caddy             → :80  (sirve la SPA + proxy /api → backend)  ← ÚNICO expuesto
set -euo pipefail

PGDATA="${PGDATA:-/var/lib/postgresql/data}"
PGPORT="${PGPORT:-5432}"
PSQL=(gosu postgres psql -h 127.0.0.1 -p "$PGPORT" -U postgres)
log() { echo "[crm] $*"; }

# ── 1. Postgres: init (solo la primera vez) ───────────────────────────────────
if [ ! -s "$PGDATA/PG_VERSION" ]; then
  log "initdb en $PGDATA"
  mkdir -p "$PGDATA"
  chown -R postgres:postgres "$PGDATA"
  gosu postgres initdb -D "$PGDATA" --username=postgres --auth-local=trust --auth-host=trust >/dev/null
fi
chown -R postgres:postgres "$PGDATA"

log "arrancando Postgres…"
gosu postgres postgres -D "$PGDATA" -c listen_addresses='127.0.0.1' -c port="$PGPORT" &
PG_PID=$!

for _ in $(seq 1 60); do
  gosu postgres pg_isready -q -h 127.0.0.1 -p "$PGPORT" && break
  sleep 1
done

# ── 2. Bases de datos (idempotente) ───────────────────────────────────────────
ensure_db() {  # devuelve 0 si la acaba de crear
  local db="$1"
  if "${PSQL[@]}" -tAc "SELECT 1 FROM pg_database WHERE datname='${db}'" | grep -q 1; then
    return 1
  fi
  log "creando base de datos ${db}"
  gosu postgres createdb -h 127.0.0.1 -p "$PGPORT" -U postgres "$db"
  return 0
}

ensure_db crm || true
log "aplicando extensiones a crm"
"${PSQL[@]}" -d crm -q -f /app/db/init-operational.sql

# Esquema propio del CRM (drizzle) — solo si `crm` aún no lo tiene.
# Ojo: PostGIS crea `spatial_ref_sys` en `public`, así que no basta contar tablas.
crm_ready() { [ "$("${PSQL[@]}" -d crm -tAc "SELECT to_regclass('public.users') IS NOT NULL" 2>/dev/null || echo f)" = "t" ]; }
if ! crm_ready && ls /app/backend/drizzle/migrate/*.sql >/dev/null 2>&1; then
  log "aplicando esquema de crm (drizzle)…"
  cat /app/backend/drizzle/migrate/*.sql | "${PSQL[@]}" -d crm -q || true
fi

# Usuario admin opcional (solo si se define SEED_ADMIN_EMAIL + SEED_ADMIN_PASSWORD).
if [ -n "${SEED_ADMIN_EMAIL:-}" ] && [ -n "${SEED_ADMIN_PASSWORD:-}" ]; then
  log "sembrando admin ${SEED_ADMIN_EMAIL}"
  hash="$(cd /app/backend && node -e "console.log(require('bcryptjs').hashSync(process.argv[1],10))" "$SEED_ADMIN_PASSWORD")"
  "${PSQL[@]}" -d crm -q -c "INSERT INTO users (email, username, password_hash, first_name, last_name, is_superuser, is_active) VALUES ('${SEED_ADMIN_EMAIL}', '${SEED_ADMIN_USERNAME:-admin}', '${hash}', 'Admin', 'CRM', true, true) ON CONFLICT (email) DO NOTHING;" || true
fi

ensure_db analytics || true

# Réplica `analytics`: con RESTORE_ANALYTICS=1 y la réplica vacía, se restaura
# desde /app/db/backups (partes o volcado completo). Si no, se garantiza el DDL.
has_replica() { [ "$("${PSQL[@]}" -d analytics -tAc "SELECT count(*) FROM pos.clientes" 2>/dev/null || echo 0)" != "0" ]; }
table_count() { "${PSQL[@]}" -d analytics -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema IN ('pos','analytics')" 2>/dev/null || echo 0; }

if [ "${RESTORE_ANALYTICS:-0}" = "1" ] && ! has_replica && ls /app/db/backups/*.backup* >/dev/null 2>&1; then
  log "restaurando la réplica analytics desde /app/db/backups…"
  bkdir=/app/db/backups
  dump=""; tmp=""
  dump="$(ls -1 "$bkdir"/*.backup 2>/dev/null | head -1 || true)"
  if [ -z "$dump" ]; then
    first="$(ls -1 "$bkdir"/*.backup.part-* 2>/dev/null | sort | head -1 || true)"
    if [ -n "$first" ]; then
      stem="${first%.part-*}"
      tmp=/tmp/analytics_restore.dump
      cat "$stem".part-* > "$tmp"
      dump="$tmp"
    fi
  fi
  if [ -n "$dump" ]; then
    gosu postgres pg_restore -h 127.0.0.1 -p "$PGPORT" -U postgres -d analytics \
      --no-owner --no-privileges --clean --if-exists -j 4 "$dump" \
      | grep -vE "(does not exist|already exists), skipping" || true
    [ -n "$tmp" ] && rm -f "$tmp"
  fi
elif [ "$(table_count)" = "0" ]; then
  log "aplicando DDL de analytics (esquema vacío)"
  "${PSQL[@]}" -d analytics -q -f /app/db/schema.sql </dev/null || true
fi

# ── 3. Servicios internos ─────────────────────────────────────────────────────
log "arrancando ia-service…"
( cd /app/ia-service && exec /opt/ia-venv/bin/python -m uvicorn app.main:app \
    --host 127.0.0.1 --port "${IA_SERVICE_PORT:-8002}" ) &
IA_PID=$!

log "arrancando backend…"
( cd /app/backend && exec node dist/src/main.js ) &
BACKEND_PID=$!

log "arrancando Caddy (:80)…"
caddy run --config /etc/caddy/Caddyfile --adapter caddyfile &
CADDY_PID=$!

term() {
  log "parando…"
  kill -TERM "$CADDY_PID" "$BACKEND_PID" "$IA_PID" 2>/dev/null || true
  gosu postgres pg_ctl -D "$PGDATA" -m fast stop >/dev/null 2>&1 || kill -TERM "$PG_PID" 2>/dev/null || true
}
trap term TERM INT

# Si cualquiera de los procesos termina, se para todo el contenedor.
wait -n || true
term
wait || true
