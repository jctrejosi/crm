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

SRC_CONTAINER="${SRC_CONTAINER:-ecommerce_postgres}"
SRC_DB="${SRC_DB:-ecommerce}"
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
docker exec "$SRC_CONTAINER" pg_dump -U postgres -d "$SRC_DB" -Fc --no-owner --no-privileges > "$DUMP"
SIZE=$(du -h "$DUMP" | cut -f1)
echo "   dump: ${DUMP} (${SIZE})"

echo "📥 Copiando al contenedor destino..."
docker cp "$DUMP" "${DST_CONTAINER}:/tmp/crm_migrate.dump"

echo "♻️  Restaurando en ${DST_DB} (--clean --if-exists)..."
docker exec "$DST_CONTAINER" pg_restore -U postgres -d "$DST_DB" \
  --no-owner --no-privileges --clean --if-exists --jobs 4 \
  /tmp/crm_migrate.dump 2>&1 | grep -vE "does not exist, skipping" || true
docker exec "$DST_CONTAINER" rm -f /tmp/crm_migrate.dump

echo "🔎 Verificando conteos..."
docker exec "$DST_CONTAINER" psql -U postgres -d "$DST_DB" -tAc "
  SELECT 'campaigns=' || (SELECT count(*) FROM campaigns)
      || ' products=' || (SELECT count(*) FROM products)
      || ' customers=' || (SELECT count(*) FROM customers)
      || ' orders=' || (SELECT count(*) FROM orders)
      || ' users=' || (SELECT count(*) FROM users)
      || ' campaign_recipients=' || (SELECT count(*) FROM campaign_recipients);"

echo "✅ Listo. La BD operativa del CRM vive en ${DST_CONTAINER}:5437/${DST_DB}."
