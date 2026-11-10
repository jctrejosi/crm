# crm/ — Panel CRM (analytics + campañas) de Mercaldas

Proyecto independiente, **hermano** del repo `ecommerce` (vive en
`/home/jk/Proyectos/dsi/crm`), con **backend y bases de datos propias**.
Contiene el panel web, su API, el servicio de IA y las dos bases de datos que
necesita.

## Estructura

| Carpeta | Qué es | Puerto |
|---|---|---|
| `interface web/` | Panel React + Vite (campañas, dashboard). Gestor: **pnpm** | 8444 |
| `Interface desktop crm/` | Shell Electron del panel + instaladores Windows firmados (`release/`) | — |
| `backend/` | API NestJS propia del CRM (recortada del backend del ecommerce) | 3100 |
| `ia-service/` | FastAPI + DeepSeek (contenido, nombre y explicación de campañas) | 8002 |
| `ml/` | Modelos: `clustering-api` (8010) · `xgboost-api` (8011) · `uplift-api` (8012) | 8010 · 8011 · 8012 |
| `db/` | Las **dos** bases Postgres del CRM (docker) | 5437 · 5436 |
| `docs/` | Documentación del proyecto (estado actual, bases de datos, migración) | — |
| `docker/` | Despliegue en **contenedor de aplicación** (backend + ia + panel + Caddy + BDs) | 30280 · 30281 (loopback) |
| `dev.js` | Lanzador del CRM (`node dev.js`) | — |
| `prod.js` + `prod.config.json` | Lanzador de **producción** (dominios, DNS, build y `up`) | — |

## Cómo levantarlo

```bash
node dev.js            # db + backend + web + ia (dev)
node dev.js --migrate  # además, al terminar de levantar, refresca la BD `crm` desde el ecommerce
node dev.js --restore  # al montar la BD, fuerza el restore de analytics desde db/backups
node dev.js --backup-db    # vuelca la BD operativa `crm` a backups/crm_<fecha>.dump
node dev.js --restore-db   # deja la BD `crm` como el respaldo (pg_restore --clean) y sale
node dev.js --init     # primer arranque desde cero: dependencias + BD + respaldo, y arranca
node dev.js --stop     # detiene lo levantado
node dev.js --help
```

Si faltan `node_modules` (backend/web) o `.venv` (ia y `ml/`), se instalan solos.
Requisitos: Node 20+, pnpm, Docker y **Python 3.13** (los modelos de `ml/` fijan
versiones que exigen Python ≥3.12). Al levantar `db`, si el volumen de
`analytics` está vacío se restaura desde `db/backups` (equivalente a
`db/restore.sh`; sin bash, también en Windows).

URLs: web <http://localhost:8444> · backend <http://localhost:3100> (docs en
`/api/docs`) · ia-service <http://localhost:8002/docs>. Logs en `logs/*.log`.

## Producción (VPS, con dominios y TLS)

```bash
node prod.js --dns          # qué crear en GoDaddy + firewall (no toca nada)
node prod.js                # sincroniza docker/.env, construye y levanta
cd ../ecommerce/docker/edge && docker compose up -d   # el edge publica 80/443 y hace TLS
node prod.js --status       # contenedores y puertos publicados
node prod.js --logs         # logs del contenedor de aplicación
node prod.js --stop         # detiene (los datos quedan)
```

Los dominios y la IP se configuran en **`prod.config.json`** (`mode: "edge"` =
los 80/443 los publica el edge compartido; `"direct"` = este contenedor es el
único del servidor); los secretos (JWT, contraseña del panel, DeepSeek, BD) en
**`docker/.env`** (el contenedor es fail-closed: sin `JWT_SECRET` ni contraseña
del panel no arranca). El CRM escucha en puertos propios (`30280/30281`) solo en
loopback para no chocar con nada más.

📖 Pasos completos: [`docs/RUNBOOK-EXPOSICION.md`](./docs/RUNBOOK-EXPOSICION.md)
🔐 Modelo de seguridad: [`docs/SECURITY.md`](./docs/SECURITY.md)

## Documentación

Toda la documentación de proyecto vive en **[`docs/`](./docs/README.md)**:

- **[Estado actual](./docs/estado-actual.md)** — arquitectura, servicios, puertos,
  componentes, configuración y deuda técnica conocida. **Empieza por aquí.**
- [Bases de datos](./docs/bases-de-datos.md) — las dos Postgres (`crm` :5437 y
  `analytics` :5436).
- [Migración de analytics](./docs/migracion-analytics.md) — origen del legado
  Advantage y plan de reconstrucción.
- [Backups de analytics](./docs/backups-analytics.md) — dumps troceados y cómo
  restaurarlos.
- [Runbook de exposición](./docs/RUNBOOK-EXPOSICION.md) — despliegue en el VPS:
  DNS en GoDaddy, firewall, `prod.js`, verificación y edge compartido.
- [Seguridad](./docs/SECURITY.md) — modelo de seguridad del contenedor y
  riesgos residuales.

## Bases de datos (propias del CRM)

Las dos viven en `db/docker-compose.yml` y **no dependen del ecommerce**:

| BD | Contenedor | Puerto | Contenido | Quién la usa |
|---|---|---|---|---|
| **`crm`** (operativa) | `crm_postgres` | 5437 | `campaigns`, `campaign_*`, `products`, `customers`, `orders`, `users`, `settings`… | El **backend** del CRM (Drizzle) |
| **`analytics`** (réplica) | `analytics_postgres` | 5436 | Schemas `pos` (`clientes` 184k, `venta_lineas` 10M) y `analytics` (`vw_rfm_clientes` 82k) | Los **modelos de ML** (Astaroth) |

> `analytics` es una réplica de solo lectura del legado Advantage; **no guarda
> campañas**, es el insumo de la segmentación.

### Migrar/refrescar la BD operativa desde el ecommerce

La BD `crm` se pobló una vez copiando la del ecommerce. Es una copia puntual:
a partir de ahí **las dos BD divergen** (el ecommerce ya no alimenta al CRM).

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

Cuando haya que mantenerlas sincronizadas de forma continua, habrá que añadir
un proceso de sincronización (no incluido).

### Restaurar la copia de datos de `analytics`

```bash
node dev.js --db --restore   # elige el backup más reciente de db/backups y restaura
bash db/restore.sh           # equivalente en Linux/macOS (reensambla las partes si hace falta)
```

Sin `--restore`, al levantar `--db` solo se restaura si el volumen está vacío. Con
`--restore` se fuerza: sobrescribe `analytics` con el backup versionado (verifica
sha256 y conteos antes de dar por buena la restauración). Todo corre en Node, así
que funciona igual en Windows (allí `bash`/`restore.sh` no están disponibles).

### Respaldar / restaurar la BD operativa (`crm`)

```bash
node dev.js --backup-db                # vuelca `crm` a backups/crm_<fecha>.dump (+ .sha256)
node dev.js --restore-db               # restaura `crm` desde el respaldo más reciente de backups/
node dev.js --restore-db=backups\xxx.dump   # un respaldo concreto
```

O desde el lanzador: `Activar-Desarrollo.bat -BackupDb` (crea y sale),
`Activar-Desarrollo.bat -RestoreDb` (restaura y arranca) y
`Activar-Desarrollo.bat -Init` (instala dependencias, crea la base si falta y la
restaura desde `backups/` cuando está vacía, y arranca todo). `--restore-db`
aplica el volcado sobre la base existente con `pg_restore --clean --if-exists`
(no la borra ni la recrea), así que la deja exactamente como el respaldo; la
réplica `analytics` (:5436) no se toca.

## Dependencias externas (no las levanta `dev.js`)

- **Servicio de SMS** (`seeds/Vassago/sms_service`): usado por el botón
  "Enviar prueba". Se configura en `interface web/.env` (`VITE_SMS_API_URL`).
  Los modelos ocupan `8010–8012`, así que el SMS debe usar otro puerto (por
  defecto `8015`).

> Los modelos de ML (`clustering`, `xgboost`, `uplift`) vivían antes en el repo
> `Astaroth`; ahora están en [`ml/`](./ml/README.md) y los levanta `dev.js` y el
> contenedor de producción. Ya **no** hay un contenedor `mercaldas_astaroth_app`
> del que depender.

## APIs que expone el backend del CRM

Recortadas del backend del ecommerce a lo que usa el panel:

- `campaigns`: `/admin/campaigns/*` (CRUD, `generate`, `suggest-name`,
  `interpret-segment`, `segment-preview` SSE, `clients/score`,
  `clients/filter-options`, `:id/recipients*`, `:id/audience*`, `:id/history`,
  `:id/relaunch`).
- `dashboard`: `/admin/dashboard/*` (stats, ventas, stock, pedidos, etc.).
- `catalog`: `POST /catalog/products`, `GET /catalog/categories`,
  `POST /catalog/products/from-file` (import por PLU).
- `orders`: `GET /admin/orders/:id` (detalle del pedido en el dashboard).
- `auth`, `landing/general`, `admin/settings/public-info`.

## Configuración

`interface web/.env`:

```env
VITE_API_URL=http://localhost:3100
VITE_SMS_API_URL=http://localhost:8015
```

`backend/.env.development.local`:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5437/crm
DB_SSL=false
BACKEND_PORT=3100
CORS_ORIGIN=...,http://localhost:8444      # incluir el front del CRM
CORS_CREDENTIALS=true
JWT_SECRET=...
IA_SERVICE_URL=http://127.0.0.1:8002
CLUSTERING_API_URL=http://127.0.0.1:8010
XGBOOST_API_URL=http://127.0.0.1:8011
UPLIFT_API_URL=http://127.0.0.1:8012
CLUSTERING_API_KEY=change-me              # = ADMIN_KEY de los 3 servicios ML
CLUSTERING_MODEL_NAME=seg_rfm_v1
XGBOOST_PROPENSITY_MODEL=prop_activo
UPLIFT_MODEL=uplift_dr_learner
```

`ia-service/.env`: `IA_SERVICE_DEEPSEEK_API_KEY` (o `DEEPSEEK_API_KEY`).
