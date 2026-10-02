# crm/ — Panel CRM (analytics + campañas) de Mercaldas

Proyecto independiente dentro del repo `ecommerce`, extraído de las piezas que
antes vivían dispersas en la raíz. Contiene el panel web, su backend, el
servicio de IA y la base de datos de analítica.

## Estructura

| Carpeta | Qué es | Puerto |
|---|---|---|
| `interface web/` | Panel React + Vite (campañas, dashboard). Gestor: **pnpm** | 8444 |
| `backend/` | API NestJS propia del CRM (recortada del backend del ecommerce) | 3100 |
| `ia-service/` | FastAPI + DeepSeek (contenido, nombre y explicación de campañas) | 8002 |
| `db/` | PostgreSQL de analítica (`analytics_postgres`, réplica del legado Advantage) | 5436 |
| `dev.js` | Lanzador del CRM (`node crm/dev.js`) | — |

## Cómo levantarlo

```bash
node crm/dev.js            # db + backend + web + ia (dev)
node crm/dev.js --stop     # detiene lo levantado (la BD docker hace compose stop)
node crm/dev.js --help
```

URLs: web <http://localhost:8444> · backend <http://localhost:3100> (docs en
`/api/docs`) · ia-service <http://localhost:8002/docs> · BD `:5436`.

Logs en `crm/logs/*.log`.

## Dependencias externas (no las levanta `crm/dev.js`)

- **ML Astaroth** (`/home/jk/Proyectos/seeds/Astaroth`): `clustering :8010`,
  `xgboost :8011`, `uplift :8012`. Son quienes **leen** `crm/db`
  (`DATABASE_URL=postgresql://postgres:postgres@localhost:5436/analytics`) y
  hacen la segmentación, la propensión y el uplift.
- **Servicio de SMS** (`seeds/Vassago/sms_service`): usado por el botón
  "Enviar prueba". Se configura en `interface web/.env` (`VITE_SMS_API_URL`).
  Ojo: si XGBoost ocupa `:8011`, hay que correr el SMS en otro puerto.
- **BD operativa**: el CRM **comparte la BD del ecommerce** (`:5432`, DB
  `ecommerce`), donde viven `campaigns`, `campaign_*`, `products`, `customers`.
  La conexión está en `backend/.env.development.local` (`DATABASE_URL`).

## Bases de datos (importante)

Hay **dos** bases y no son intercambiables:

| BD | Contenido | Quién la usa |
|---|---|---|
| `crm/db` (`:5436`, DB `analytics`) | Réplica **solo lectura** del legado: schemas `pos` (`clientes` 184k, `venta_lineas` 10M) y `analytics` (`vw_rfm_clientes` 82k, `cliente_segmento`) | Los servicios de **ML** (clustering/xgboost/uplift) |
| BD del ecommerce (`:5432`, DB `ecommerce`) | Tablas operativas: `campaigns`, `campaign_products`, `campaign_messages`, `campaign_recipients`, `campaign_history`, `products`, `customers`, `orders`… | El **backend** del CRM (Drizzle) |

> `crm/db` **no** guarda las campañas: es el insumo de la segmentación.

Restaurar la copia de datos de `crm/db`:

```bash
bash crm/db/restore.sh          # reensambla las partes del backup y restaura
node dev.js --migration-campaigns   # (launcher del ecommerce, misma operación)
```

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

`backend/.env.development.local`: `DATABASE_URL` (BD del ecommerce),
`BACKEND_PORT=3100`, `CORS_ORIGIN` (incluir `http://localhost:8444`),
`CORS_CREDENTIALS=true`, `JWT_SECRET`, y las URLs de los servicios:
`IA_SERVICE_URL` (8002), `CLUSTERING_API_URL` (8010), `XGBOOST_API_URL` (8011),
`UPLIFT_API_URL` (8012).

`ia-service/.env`: `IA_SERVICE_DEEPSEEK_API_KEY` (o `DEEPSEEK_API_KEY`).
