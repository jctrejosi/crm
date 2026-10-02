# db-campaigns/ — PostgreSQL de analytics (campañas y segmentación)

Réplica de solo lectura del legado **Advantage** (los `.ADT` pasados a Postgres)
que alimenta la **segmentación** de campañas del panel `Interface web analytics`.
**No tiene nada que ver con la BD transaccional del ecommerce** (esa vive en
`db/docker/`, puerto 5432).

- Origen y proceso de migración: **[`MIGRATION.md`](./MIGRATION.md)**.
- Backups (dumps): **[`backups/README.md`](./backups/README.md)** (los `.backup`
  no se versionan; el manifiesto y el DDL sí).
- DDL versionado: **`schema.sql`** (`pg_dump --schema-only`).
- Restauración: **`restore.sh`**.

## Qué contiene

| Schema | Contenido |
|---|---|
| `pos` | `venta_lineas` (10M filas, particionado por mes), `clientes` (184K con contacto y consentimientos), `facturas`, `bodegas`, `sync_control` |
| `analytics` | `vw_rfm_clientes` (vista RFM: 82K clientes), `cliente_segmento` (81.955) |

Conteos de referencia (dump 2026-09-29): `pos.venta_lineas` 9.998.703 ·
`pos.clientes` 184.660 · `vw_rfm_clientes` 81.997 · `cliente_segmento` 81.955.

## Levantarla

La levanta el lanzador junto con todo lo demás:

```bash
node dev.js            # levanta PostgreSQL (5432) + analytics (5436) + servicios
node dev.js --stop     # detiene los servicios (las BDs docker siguen)
```

O solo la BD:

```bash
cd db-campaigns && docker compose up -d --wait
```

Conexión: `postgresql://postgres:postgres@localhost:5436/analytics`
(es la `DATABASE_URL` que usa el `clustering-api` de Astaroth).

## Backup

El volcado completo (~350 MB) **no** se versiona; se **trocea en partes de 45 MB**
(para poder subirlo a GitHub). Las **partes** (`*.backup.part-NNN`) y el **sha256**
del volcado completo sí se versionan.

```sh
cd db-campaigns/backups
F=analytics_$(date +%F).backup
docker exec analytics_postgres pg_dump -U postgres -d analytics -Fc -Z9 \
  --no-owner --no-privileges > "$F"
sha256sum "$F" > "$F.sha256"
split -b 45M -d --numeric-suffixes=0 -a 3 "$F" "$F.part-"
```

Inventario, reensamblado y verificación paso a paso: [`backups/README.md`](./backups/README.md).

## Restaurar

**Desde el backup** (sobrescribe la BD `analytics`):

```sh
bash db-campaigns/restore.sh                          # dump completo o reensambla las partes
bash db-campaigns/restore.sh backups/analytics_2026-09-29.backup
```

El script verifica el `sha256`, restaura con `pg_restore` y comprueba los conteos.
Si solo están las **partes** versionadas (clon nuevo), las **reensambla** primero.

O desde el launcher (levanta `db-campaigns` y restaura la copia de una):

```sh
node dev.js --migration-campaigns     # usa el .backup o reensambla las partes; verifica y sale
```

**Volumen vacío (PC nuevo):**

```bash
cd db-campaigns && docker compose up -d --wait
bash db-campaigns/restore.sh
docker exec analytics_postgres psql -U postgres -d analytics \
  -c "SELECT count(*) FROM analytics.vw_rfm_clientes;"   # → 81997
```

**Recrear solo el esquema** (sin datos): `docker exec -i analytics_postgres psql -U postgres -d analytics < db-campaigns/schema.sql`

> Si no tienes el dump, ver el plan de reconstrucción en
> [`MIGRATION.md` §6](./MIGRATION.md) (re-extraer del legado ADS).

## Notas

- **Datos**: viven en el volumen docker `analytics_postgres_data` (~2.9 GB), no en
  este folder. Se preservan al recrear el contenedor; se **pierden** con
  `docker compose down -v` o `docker volume prune`.
- **Backups**: esta BD es el insumo del ML; programa un `pg_dump` periódico y
  cópialo fuera de la máquina (git no lo versiona).
- **No exponer**: datos personales (cédulas, emails, teléfonos, consentimientos).
