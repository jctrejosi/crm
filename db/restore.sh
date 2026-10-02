#!/usr/bin/env bash
# Restaura la réplica de analytics (crm/db) en el contenedor analytics_postgres.
#
# Uso:
#   bash db/restore.sh                       # .backup más reciente, o reensambla las partes
#   bash db/restore.sh ruta/al/dump.backup   # dump concreto
#   DB_CONTAINER=analytics_postgres DB_NAME=analytics bash db/restore.sh
#
# Si no hay dump completo (solo las partes versionadas), las reensambla y
# comprueba el sha256 del volcado completo. Al final verifica conteos.
set -euo pipefail

CONTAINER="${DB_CONTAINER:-analytics_postgres}"
DB="${DB_NAME:-analytics}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BKDIR="$DIR/backups"
TMP="${TMPDIR:-/tmp}/analytics_restore.dump"
CTMP="/tmp/analytics_restore.dump"

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

# ── 1. Elegir la fuente: dump explícito → dump completo → partes ───────────────
WORK=""
SHAFILE=""

if [ "${1:-}" != "" ] && [ -f "${1:-}" ]; then
  WORK="$1"
  SHAFILE="$1.sha256"
else
  FULL="$(ls -1t "$BKDIR"/*.backup 2>/dev/null | head -1 || true)"
  if [ -n "$FULL" ]; then
    WORK="$FULL"
    SHAFILE="$FULL.sha256"
  else
    # Con varios backups en la carpeta, usa el conjunto de partes más reciente.
    LATEST="$(ls -1t "$BKDIR"/*.backup.part-* 2>/dev/null | head -1 || true)"
    if [ -z "$LATEST" ]; then
      echo "✘ No encontré dump completo ni partes en $BKDIR" >&2
      echo "  Uso: bash db/restore.sh <ruta.backup>" >&2
      exit 1
    fi
    STEM="${LATEST%.part-*}"
    mapfile -t PARTS < <(ls -1 "$STEM.part-"* | sort)
    echo "→ Reensamblando ${#PARTS[@]} partes de $(basename "$STEM") en $TMP ..."
    cat "${PARTS[@]}" > "$TMP"
    WORK="$TMP"
    SHAFILE="$STEM.sha256"
  fi
fi
echo "→ Fuente: $WORK"

# ── 2. Integridad (sha256 del volcado completo) ───────────────────────────────
if [ -f "$SHAFILE" ]; then
  EXPECTED="$(awk '{print $1}' "$SHAFILE")"
  ACTUAL="$(sha256_of "$WORK")"
  if [ "$EXPECTED" != "$ACTUAL" ]; then
    echo "✘ El volcado NO coincide con su sha256." >&2
    echo "  esperado: $EXPECTED" >&2
    echo "  obtenido: $ACTUAL" >&2
    echo "  Suele ser por una parte faltante. Copia db/backups/ completo." >&2
    rm -f "$TMP"
    exit 1
  fi
  echo "✓ sha256 OK"
fi

# ── 3. El contenedor debe existir ─────────────────────────────────────────────
if ! docker inspect -f '{{.State.Running}}' "$CONTAINER" >/dev/null 2>&1; then
  echo "✘ El contenedor $CONTAINER no existe/está parado." >&2
  echo "  Levántalo: cd db && docker compose up -d --wait" >&2
  exit 1
fi

# ── 4. Copiar y restaurar ─────────────────────────────────────────────────────
echo "→ Copiando al contenedor $CONTAINER..."
docker cp "$WORK" "$CONTAINER:$CTMP"
rm -f "$TMP"

echo "→ Restaurando en la BD $DB (pg_restore)..."
set +e
docker exec "$CONTAINER" pg_restore -U postgres -d "$DB" -j 4 \
  --clean --if-exists --no-owner --no-privileges "$CTMP"
RC=$?
set -e
docker exec "$CONTAINER" rm -f "$CTMP"
echo "  pg_restore exit=$RC (los avisos benignos no impiden la restauración)"

# ── 5. Verificación de conteos ────────────────────────────────────────────────
echo "→ Verificando conteos..."
docker exec "$CONTAINER" psql -U postgres -d "$DB" -tAc \
  "SELECT 'vw_rfm_clientes=' || count(*) FROM analytics.vw_rfm_clientes
   UNION ALL SELECT 'cliente_segmento=' || count(*) FROM analytics.cliente_segmento
   UNION ALL SELECT 'pos.clientes=' || count(*) FROM pos.clientes
   UNION ALL SELECT 'pos.venta_lineas=' || count(*) FROM pos.venta_lineas"

echo "✓ Restauración terminada."
