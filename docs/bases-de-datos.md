# Bases de datos

El CRM tiene **dos** bases PostgreSQL **propias**, ambas definidas en
`db/docker-compose.yml` y levantadas por `node dev.js` (servicio `db`).
**Ninguna depende del ecommerce.**

| BD | Contenedor | Puerto | Imagen | Contenido | Quién la usa |
|---|---|---|---|---|---|
| **`crm`** (operativa) | `crm_postgres` | **5437** | `postgis/postgis:16-3.4` | `campaigns`, `campaign_*`, `products`, `customers`, `orders`, `users`, `settings`… | El **backend** (Drizzle ORM) |
| **`analytics`** (réplica) | `analytics_postgres` | **5436** | `postgres:16-alpine` | schemas `pos` y `analytics` (legado Advantage) | Los **modelos de ML** (Astaroth) |

- Origen de la réplica y plan de reconstrucción: [migracion-analytics.md](./migracion-analytics.md).
- Backups (dumps troceados): [backups-analytics.md](./backups-analytics.md).

## `crm` — base operativa (5437)

Es la base **transaccional del CRM**: campañas, catálogo, pedidos, clientes,
usuarios y configuración. El backend la consume vía Drizzle
(`DATABASE_URL=postgresql://postgres:postgres@localhost:5437/crm`).

- Se puebla **una vez** copiando la BD del ecommerce (ver *Migrar/refrescar* más
  abajo). A partir de ahí las dos bases **divergen**.
- Al crear el contenedor, `db/init-operational.sql` instala las extensiones:
  `postgis`, `citext`, `uuid-ossp`, `unaccent`, `pg_trgm` y el wrapper
  `public.immutable_unaccent(text)` (para indexar búsquedas sin tildes).
- El volcado vive en el volumen docker `crm_postgres_data`.

## `analytics` — réplica del legado (5436)

Réplica de **solo lectura** del legado **Advantage** (POS VISADS_25) que alimenta
la **segmentación** de campañas. **No guarda campañas**: es el insumo del ML.

| Schema | Contenido |
|---|---|
| `pos` | `venta_lineas` (10M filas, particionada por mes), `clientes` (184K con contacto y consentimientos), `facturas`, `bodegas`, `sync_control` |
| `analytics` | `vw_rfm_clientes` (vista RFM: ~82K clientes), `cliente_segmento` (~82K) |

Conteos de referencia (dump 2026-10-02): `pos.venta_lineas` 9.998.703 ·
`pos.clientes` 184.660 · `analytics.vw_rfm_clientes` 81.997 ·
`analytics.cliente_segmento` 81.955.

- **DDL versionado**: `db/schema.sql` (`pg_dump --schema-only`, ~1.4k líneas).
- El volcado son ~346 MB y vive en el volumen docker `analytics_postgres_data`.
- El ML (Astaroth) lee `analytics.vw_rfm_clientes` **server-side** y escribe
  `analytics.cliente_segmento`.

## Levantarlas

Las levanta el lanzador junto con todo lo demás:

```bash
node dev.js            # levanta crm (5437) + analytics (5436) + servicios
node dev.js --stop     # detiene los servicios (los contenedores docker siguen)
```

O solo las bases:

```bash
cd db && docker compose up -d --wait
```

Conexiones:

- CRM operativa: `postgresql://postgres:postgres@localhost:5437/crm`
- Analytics: `postgresql://postgres:postgres@localhost:5436/analytics`
  (es la `DATABASE_URL` que usa el `clustering-api` de Astaroth).

## Backup y restauración

### `analytics`

El volcado completo (~346 MB) **no** se versiona; se **trocea en partes de 45 MB**
(para poder subirlo a GitHub). Las **partes** (`*.backup.part-NNN`) y el **sha256**
del volcado completo sí se versionan.

```sh
cd db/backups
F=analytics_$(date +%F).backup
docker exec analytics_postgres pg_dump -U postgres -d analytics -Fc -Z9 \
  --no-owner --no-privileges > "$F"
sha256sum "$F" > "$F.sha256"
split -b 45M -d --numeric-suffixes=0 -a 3 "$F" "$F.part-"
```

Inventario, reensamblado y verificación paso a paso: [backups-analytics.md](./backups-analytics.md).

**Restaurar** (sobrescribe la BD `analytics`):

```sh
bash db/restore.sh                          # dump completo o reensambla las partes
bash db/restore.sh db/backups/analytics_2026-10-02.backup
```

El script verifica el `sha256`, restaura con `pg_restore` y comprueba los conteos.
Si solo están las **partes** versionadas (clon nuevo), las **reensambla** primero.

El lanzador lo hace solo: al levantar `db`, si el volumen aún no tiene datos,
`dev.js` restaura desde `db/backups` (usa el `.backup` completo o reensambla las
partes, valida el sha256 y verifica los conteos) antes de arrancar el resto.

**Recrear solo el esquema** (sin datos):

```sh
docker exec -i analytics_postgres psql -U postgres -d analytics < db/schema.sql
```

> Si no tienes el dump, ver el plan de reconstrucción en
> [migracion-analytics.md §6](./migracion-analytics.md).

### `crm`

No hay dump versionado. Se puebla/refresca desde el ecommerce (siguiente
sección). Para un respaldo puntual: `pg_dump` del contenedor `crm_postgres`.

## Migrar/refrescar la BD operativa desde el ecommerce

La BD `crm` se pobló una vez copiando la del ecommerce. Es una copia puntual:
**sobrescribe** `crm` (`--clean`).

```bash
bash db/migrate-from-ecommerce.sh    # solo la copia (sobrescribe `crm`)

# o desde el lanzador: levanta todo y migra al final
node dev.js --migrate
```

> `--migrate` corre **después** de que los servicios están arriba y hace
> `--clean` sobre `crm`, así que la deja con el esquema del ecommerce. Después
> hay que reaplicar el esquema propio del CRM (columnas como
> `campaigns.draft_state`) desde `backend/` con `pnpm db:push` — que hoy requiere
> `DATABASE_URL` en el entorno, porque los scripts `db:*` no cargan
> `.env.development.local` (a diferencia de `dev`/`start`).

Cuando haya que mantenerlas sincronizadas de forma continua, hará falta un
proceso de sincronización (no incluido).

## Notas

- **Datos**: viven en los volúmenes docker `analytics_postgres_data` (~2.9 GB) y
  `crm_postgres_data`, no en el repo. Se preservan al recrear el contenedor; se
  **pierden** con `docker compose down -v` o `docker volume prune`.
- **Backups**: `analytics` es el insumo del ML; programa un `pg_dump` periódico y
  cópialo fuera de la máquina (git no lo versiona).
- **No exponer**: datos personales (cédulas, emails, teléfonos, consentimientos).
