# Estado actual del proyecto

> Fotografía del CRM de Mercaldas a **2026-10-08**. Documenta *qué hay hoy*:
> arquitectura, servicios, datos, configuración y deuda técnica conocida.
> Para el detalle de cada área ver el [índice de documentación](./README.md).

## 1. Qué es

Panel **CRM** de Mercaldas, centrado en **analytics** (segmentación de clientes)
y **campañas** de marketing. Es un proyecto **independiente y hermano** del repo
`ecommerce`: tiene backend y bases de datos **propias** y en tiempo de ejecución
**no depende** del ecommerce.

La única relación con el ecommerce es histórica:

- La BD operativa `crm` se **pobló una vez** copiando la del ecommerce
  (`db/migrate-from-ecommerce.sh`). A partir de ahí las dos divergen.
- La BD `analytics` es una **réplica de solo lectura** del legado Advantage
  (POS VISADS_25), no del ecommerce.

## 2. Servicios y puertos

Los levanta [dev.js](../dev.js) (`node dev.js`):

| Servicio | Carpeta | Stack | Puerto | Health / docs |
|---|---|---|---|---|
| **web** | `interface web/` | React 19 + Vite 8 + Tailwind 4 | **8444** | <http://localhost:8444> |
| **backend** | `backend/` | NestJS 11 + Drizzle ORM | **3100** | `/api/docs` (Swagger) |
| **ia** | `ia-service/` | FastAPI + DeepSeek | **8002** | `/docs`, `/health` |
| **clustering** | `ml/clustering-api/` | scikit-learn + joblib | **8010** | interno (lo llama el backend) |
| **xgboost** | `ml/xgboost-api/` | xgboost + SHAP | **8011** | interno |
| **uplift** | `ml/uplift-api/` | econml | **8012** | interno |
| **db · crm** | `db/` | Postgres 16 + PostGIS (docker) | **5437** | operativa |
| **db · analytics** | `db/` | Postgres 16 (docker) | **5436** | réplica del legado |

> El servicio `db` de `dev.js` levanta **las dos** bases vía
> `db/docker-compose.yml`. Detalle en [bases-de-datos.md](./bases-de-datos.md).

## 3. Estructura de carpetas

```
crm/
├── dev.js                 # Lanzador multiplataforma (db+backend+web+ia)
├── README.md              # Entrada del repo
├── AGENTS.md              # Guía para agentes (reglas de contexto)
├── docs/                  # Documentación del proyecto  ← aquí
├── backend/               # API NestJS + Drizzle (esquema, módulos, scripts)
├── interface web/         # Panel React + Vite (gestor: pnpm)
├── ia-service/            # FastAPI + DeepSeek (contenido de campañas)
├── ml/                    # Modelos ML: clustering · xgboost · uplift
├── db/                    # Postgres (compose, DDL, backups, scripts)
└── logs/                  # Salida de los servicios (git-ignored)
```

## 4. Cómo levantarlo

```bash
node dev.js            # db + backend + web + ia (modo dev)
node dev.js --migrate  # además, al final, refresca la BD `crm` desde el ecommerce
node dev.js --restore  # al montar la BD, fuerza el restore de analytics desde db/backups
node dev.js --db       # solo la base de datos
node dev.js --ia       # solo el ia-service
node dev.js --stop     # detiene lo levantado
node dev.js --help
```

En `--prod` el backend va sin watch, el ia sin `--reload` y la web en `preview`.

**Dependencias que se instalan solas** si faltan: `node_modules` (backend, web) y
`.venv` (ia y los tres servicios de `ml/`). Requisitos de la máquina: **Node 20+**,
**pnpm**, **Docker** (para las BDs) y **Python 3.13** — los modelos de `ml/` fijan
versiones que exigen Python ≥3.12.

### ⚠ Portabilidad (Windows / discos / copias)

`node_modules` y `.venv` **no son portátiles entre sistemas operativos**: llevan
rutas absolutas, binarios nativos y *shims* propios (`bin/` POSIX vs
`Scripts\` + `.cmd` en Windows). Al copiar el proyecto "tal cual" a otra máquina
o disco, hay que **borrar los artefactos de compilación** en el destino:

```bat
rd /s /q "ia-service\.venv"
rd /s /q "backend\node_modules"
rd /s /q "interface web\node_modules"
```

y volver a `node dev.js` para que se reinstalen. `dev.js` **no detecta** estos
casos todavía (solo comprueba si el directorio existe). Ver pendientes §8.

## 5. Componentes

### 5.1 `interface web/` — panel React

- **Stack**: React 19 · Vite 8 · Tailwind CSS 4 · `recharts` (gráficas) ·
  `lucide-react` (iconos) · `libphonenumber-js`. Gestor **pnpm**.
- **Vistas** (2): `Dashboard` y `Campañas`. El enrutado es propio
  (`useViewFromUrl` en `src/App.tsx`), con paleta de comandos y notificaciones.
- **Tamaño**: `src/views/Campaigns.tsx` tiene **~6.700 líneas** (archivo
  gigante, mismo tratamiento que en la guía de agentes: no leerlo entero).
- **Capa de API**: `src/services/` (`auth.service.ts`, `campaigns.service.ts`,
  `catalog.service.ts`).
- **Config** (`interface web/.env`):

  ```env
  VITE_API_URL=http://localhost:3100
  VITE_SMS_API_URL=http://localhost:8015
  ```

### 5.2 `backend/` — API NestJS + Drizzle

- **Módulos** (`src/modules/`): `auth`, `campaigns`, `catalog`
  (`catalog` + `admin-catalog`), `dashboard`, `landing`, `orders`, `settings`.
- **Endpoints**:

  | Prefijo | Qué expone |
  |---|---|
  | `/auth` | Login (JWT admin/clientes) |
  | `/admin/campaigns/*` | CRUD, `generate`, `suggest-name`, `interpret-segment`, `segment-preview` (SSE), `clients/score`, `clients/filter-options`, `:id/recipients*`, `:id/audience*`, `:id/history`, `:id/relaunch` |
  | `/admin/dashboard/*` | Stats, ventas, stock, pedidos |
  | `/catalog/*` + `/admin/catalog/*` | `POST /catalog/products`, `GET /catalog/categories`, `POST /catalog/products/from-file` (import por PLU), categorías admin |
  | `/admin/orders/:id` | Detalle de pedido |
  | `/landing/general`, `/admin/settings/public-info` | Config pública (logo, info) |

- **Esquema**: Drizzle en `backend/drizzle/schema.ts` (**~4.250 líneas**, archivo
  gigante) + `relations.ts`. `backend/scripts/sync-schema.js` para sincronizar.
- **Env**: `backend/.env.development.local`, cargado con **dotenvx** por los
  scripts `dev`/`start` (los scripts `db:*` **no** lo cargan: requieren
  `DATABASE_URL` en el entorno). Variables clave: `DATABASE_URL` (→ `crm` :5437),
  `BACKEND_PORT=3100`, `CORS_ORIGIN`, `JWT_SECRET`, y las URLs de servicios
  externos: `IA_SERVICE_URL` (:8002), `CLUSTERING_API_URL` (:8010),
  `XGBOOST_API_URL` (:8011), `UPLIFT_API_URL` (:8012).

### 5.3 `ia-service/` — generación de contenido con IA

- **Stack**: FastAPI + Uvicorn + **DeepSeek function calling**.
- **Endpoints**: `POST /generate` (whatsapp/email/sms), `POST /interpret`
  (explica la segmentación), `POST /suggest-name`, `GET /health`.
- **Config** (`ia-service/.env`): `IA_SERVICE_DEEPSEEK_API_KEY` (o
  `DEEPSEEK_API_KEY`), `DEEPSEEK_MODEL`, `DEEPSEEK_API_URL`, `IA_SERVICE_PORT`.
- Nota: el `README.md` del servicio menciona copiar `.env.example`, pero **no
  existe** `.env.example` en el repo.

### 5.4 `db/` — bases de datos

Dos Postgres propios (compose `name: db-campaigns`):

| BD | Contenedor | Puerto | Contenido | Quién la usa |
|---|---|---|---|---|
| **`crm`** operativa | `crm_postgres` | 5437 | `campaigns`, `campaign_*`, `products`, `customers`, `orders`, `users`, `settings`… | El **backend** (Drizzle) |
| **`analytics`** réplica | `analytics_postgres` | 5436 | schemas `pos` (`clientes` 184k, `venta_lineas` ~10M) y `analytics` (`vw_rfm_clientes` 82k) | Los **modelos de ML** (`ml/`) |

- `db/docker-compose.yml` · `db/schema.sql` (DDL de analytics, 1.4k líneas) ·
  `db/init-operational.sql` (extensiones de `crm`) · `db/backups/` (dumps
  troceados) · `db/restore.sh` · `db/migrate-from-ecommerce.sh`.
- Detalle: [bases-de-datos.md](./bases-de-datos.md),
  [migracion-analytics.md](./migracion-analytics.md),
  [backups-analytics.md](./backups-analytics.md).

### 5.5 `ml/` — modelos de ML

Tres APIs FastAPI independientes con sus propios venvs y modelos. Antes vivían
en el repo `Astaroth`; ahora se despliegan **dentro del contenedor del CRM**.

| Servicio | Puerto | Qué hace | Modelo por defecto |
|---|---|---|---|
| `clustering-api` | 8010 | Segmentación (`/segment-clients`, `/segment-for-products`), fit/assign | `seg_rfm_v1` |
| `xgboost-api` | 8011 | Propensión de compra (`/propensity/predict`, SHAP) | `prop_activo` |
| `uplift-api` | 8012 | Persuasibilidad (`/uplift/predict`, econml) | `uplift_dr_learner` |

- `clustering-api` lee la réplica `analytics` (vista `vw_rfm_clientes`). En
  producción `docker/entrypoint.sh` le pasa `ANALYTICS_DATABASE_URL` **solo a
  ese proceso** (el `DATABASE_URL` global es la BD operativa). En local lo hace
  `dev.js`.
- `ADMIN_KEY` de los tres = `CLUSTERING_API_KEY` (el backend la envía como
  `X-Admin-Key` a clustering).
- Los modelos están en `ml/*/saved_models/` (horneados en la imagen; en prod se
  montan en volúmenes `crm_ml_*_models` para persistir re-entrenamientos).
- Detalle: [`ml/README.md`](../ml/README.md).

## 6. Dependencias externas (NO las levanta `dev.js`)

- **Servicio de SMS** (`seeds/Vassago/sms_service`): usado por "Enviar prueba".
  Se configura en `interface web/.env` (`VITE_SMS_API_URL`). Los modelos ocupan
  `8010–8012`, así que el SMS debe usar otro puerto (por defecto `8015`).

> Los modelos de ML **ya no son externos**: se movieron de Astaroth a `ml/` y los
> levanta `dev.js` / el contenedor de producción. Solo el SMS sigue fuera.

## 7. Cómo se levanta la primera vez (máquina nueva)

1. Clonar/copiar **sin** `node_modules` ni `.venv`.
2. `node dev.js` → instala dependencias, levanta Postgres y, si el volumen de
   `analytics` está vacío, **restaura desde `db/backups`** automáticamente.
3. Poblar la operativa `crm`: `node dev.js --migrate` (o
   `bash db/migrate-from-ecommerce.sh`) y luego reaplicar el esquema propio con
   `pnpm db:push` desde `backend/` (requiere `DATABASE_URL` en el entorno).

## 8. Deuda técnica y pendientes conocidos

- **Portabilidad del lanzador**: `ensureNodeDeps` sigue reutilizando un
  `node_modules` ajeno al SO (no detecta que falten los `.cmd` en Windows). Los
  `.venv` de Python sí se recrean si no corresponden al SO (`ensurePythonVenv`).
- **Archivos gigantes**: `interface web/src/views/Campaigns.tsx` (~6.7k líneas) y
  `backend/drizzle/schema.ts` (~4.25k líneas). Costosos de leer/editar enteros.
- **`backend/README.md` es el boilerplate de NestJS**, no documenta el CRM.
- **`ia-service/.env.example`** referenciado pero inexistente.
- **Fechas hardcodeadas** en la vista RFM (`analytics.vw_rfm_clientes`):
  corte `2026-05-31` y día excluido `2026-05-14`. Parametrizar si se rehace.
- **Sin importador CSV→Postgres** para `analytics` (recarga manual).
  Ver [migracion-analytics.md](./migracion-analytics.md) §6.
- **Backup de `analytics` manual**: no hay cron; solo las partes versionadas en
  `db/backups/`. Hay que copiarlas fuera de la máquina.
- **Sincronización ecommerce→crm**: no existe proceso continuo; la copia es
  puntual.
- **Re-entrenamiento de modelos**: los servicios están integrados, pero
  regenerar `analytics.cliente_segmento`/modelos requiere llamar a los endpoints
  de training de `ml/` y persistir los artefactos (volúmenes `crm_ml_*_models`).
- **Refs obsoletas** en docs y comentarios a la antigua carpeta `db-campaigns/`
  y a `db/docker/` (del ecommerce), ya corregidas parcialmente en `docs/`.

## 9. Documentación

Índice completo en [docs/README.md](./README.md).
