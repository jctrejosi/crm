#!/usr/bin/env bash
# =============================================================================
# Migra la BD operativa del CRM desde la BD del ecommerce.
#
# El CRM tiene su PROPIA base de datos (`crm`, contenedor `crm_postgres`, :5437).
# Este script la puebla copiando la BD del ecommerce (`ecommerce_postgres`, :5432):
# campañas, catálogo, pedidos, clientes, usuarios y configuración.
#
# ADVERTENCIA: sobrescribe el contenido de la BD `crm` (usa --clean).
# Es una copia puntual: a partir de aquí las dos BD divergen. Si quieres refrescar
# datos desde el ecommerce, vuelve a ejecutar este script.
#
# Uso:  bash crm/db/migrate-from-ecommerce.sh
# =============================================================================
set -euo pipefail

# Git Bash (MSYS) reescribe rutas `/tmp/...` como `C:/Users/...` al pasarlas a
# Docker; desactivarlo para que el contenedor vea las rutas correctas.
export MSYS_NO_PATHCONV=1

# Con MSYS_NO_PATHCONV=1, las rutas de HOST para `docker cp` hay que pasarlas
# explícitamente en formato Windows. En Linux devuelve la misma ruta.
to_host_path() {
  if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi
}

SRC_CONTAINER="${SRC_CONTAINER:-ecommerce_postgres}"
SRC_DB="${SRC_DB:-ecommerce}"
SRC_USER="${SRC_USER:-postgres}"
SRC_PASSWORD="${SRC_PASSWORD:-postgres}"
DST_CONTAINER="${DST_CONTAINER:-crm_postgres}"
DST_DB="${DST_DB:-crm}"
DUMP="${DUMP:-/tmp/crm_migrate_$(date +%F).dump}"

echo "▶ Origen : ${SRC_CONTAINER}/${SRC_DB} (:5432)"
echo "▶ Destino: ${DST_CONTAINER}/${DST_DB} (:5437)"

for c in "$SRC_CONTAINER" "$DST_CONTAINER"; do
  if ! docker ps --format '{{.Names}}' | grep -qx "$c"; then
    echo "✘ El contenedor '$c' no está corriendo."
    echo "  Levanta las BDs con: cd crm/db && docker compose up -d --wait"
    exit 1
  fi
done

echo "📦 Volcando ${SRC_DB}..."
# El dump se ejecuta en un contenedor efímero dentro del namespace de red del
# contenedor origen (habla con 127.0.0.1:5432). Evita depender del stdout de
# `docker exec`, que en Windows/Docker Desktop se pierde y deja un dump vacío.
DUMPER="crm_migrate_dump_$$"
cleanup_dumper() { docker rm -f "$DUMPER" >/dev/null 2>&1 || true; }
trap cleanup_dumper EXIT
docker rm -f "$DUMPER" >/dev/null 2>&1 || true
docker run -d --name "$DUMPER" \
  --network "container:${SRC_CONTAINER}" \
  -e "PGPASSWORD=${SRC_PASSWORD}" \
  postgres:16-alpine \
  pg_dump -h 127.0.0.1 -p 5432 -U "$SRC_USER" -d "$SRC_DB" \
  -Fc --no-owner --no-privileges -f /tmp/crm_migrate.dump >/dev/null
RC="$(docker inspect --format '{{.State.ExitCode}}' "$DUMPER")"
if [ "${RC:-1}" != "0" ]; then
  echo "✘ pg_dump falló (exit=${RC:-?})" >&2
  docker logs --tail 20 "$DUMPER" >&2 || true
  exit 1
fi
docker cp "${DUMPER}:/tmp/crm_migrate.dump" "$(to_host_path "$DUMP")"
cleanup_dumper
trap - EXIT
SIZE=$(du -h "$DUMP" | cut -f1)
BYTES=$(wc -c < "$DUMP")
if [ "${BYTES:-0}" -lt 1024 ]; then
  echo "✘ El dump quedó vacío o incompleto (${BYTES:-0} bytes): $DUMP" >&2
  exit 1
fi
echo "   dump: ${DUMP} (${SIZE})"

echo "📥 Copiando al contenedor destino..."
docker cp "$DUMP" "${DST_CONTAINER}:/tmp/crm_migrate.dump"

echo "♻️  Restaurando en ${DST_DB} (--clean --if-exists)..."
docker exec "$DST_CONTAINER" pg_restore -U postgres -d "$DST_DB" \
  --no-owner --no-privileges --clean --if-exists --jobs 4 \
  /tmp/crm_migrate.dump 2>&1 | grep -vE "does not exist, skipping" || true
docker exec "$DST_CONTAINER" rm -f /tmp/crm_migrate.dump

echo "🔎 Verificando conteos..."
COUNTS="$(docker exec "$DST_CONTAINER" psql -U postgres -d "$DST_DB" -tAc "
  SELECT 'campaigns=' || (SELECT count(*) FROM campaigns)
      || ' products=' || (SELECT count(*) FROM products)
      || ' customers=' || (SELECT count(*) FROM customers)
      || ' orders=' || (SELECT count(*) FROM orders)
      || ' users=' || (SELECT count(*) FROM users)
      || ' campaign_recipients=' || (SELECT count(*) FROM campaign_recipients);")"
echo "$COUNTS"

PRODUCTS="$(printf '%s\n' "$COUNTS" | tr -d '\r' | sed -n 's/.* products=\([0-9][0-9]*\).*/\1/p')"
if [ -z "$PRODUCTS" ] || ! [ "$PRODUCTS" -ge 1 ] 2>/dev/null; then
  echo "✘ La migración no dejó datos (products=${PRODUCTS:-?})." >&2
  exit 1
fi

echo "✅ Listo. La BD operativa del CRM vive en ${DST_CONTAINER}:5437/${DST_DB}."
