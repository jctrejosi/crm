# crm/ — Panel CRM (analytics + campañas) de Mercaldas

Proyecto independiente, **hermano** del repo `ecommerce` (vive en
`/home/jk/Proyectos/dsi/crm`), con **backend y bases de datos propias**.
Contiene el panel web, su API, el servicio de IA y las dos bases de datos que
necesita.

## Estructura

| Carpeta | Qué es | Puerto |
|---|---|---|
| `interface web/` | Panel React + Vite (campañas, dashboard). Gestor: **pnpm** | 8444 |
| `backend/` | API NestJS propia del CRM (recortada del backend del ecommerce) | 3100 |
| `ia-service/` | FastAPI + DeepSeek (contenido, nombre y explicación de campañas) | 8002 |
| `db/` | Las **dos** bases Postgres del CRM (docker) | 5437 · 5436 |
| `dev.js` | Lanzador del CRM (`node dev.js`) | — |

## Cómo levantarlo

```bash
node dev.js            # db + backend + web + ia (dev)
node dev.js --stop     # detiene lo levantado
node dev.js --help
```

Si faltan `node_modules` (backend/web) o `.venv` (ia), se instalan solos. Al
levantar `db`, si el volumen de `analytics` está vacío se restaura desde
`db/backups` (`restore.sh`).

URLs: web <http://localhost:8444> · backend <http://localhost:3100> (docs en
`/api/docs`) · ia-service <http://localhost:8002/docs>. Logs en `logs/*.log`.

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
bash db/migrate-from-ecommerce.sh    # vuelve a copiar (sobrescribe `crm`)
```

Cuando haya que mantenerlas sincronizadas de forma continua, habrá que añadir
un proceso de sincronización (no incluido).

### Restaurar la copia de datos de `analytics`

```bash
bash db/restore.sh          # reensambla las partes del backup y restaura
```

## Dependencias externas (no las levanta `dev.js`)

- **ML Astaroth** (`/home/jk/Proyectos/seeds/Astaroth`): `clustering :8010`,
  `xgboost :8011`, `uplift :8012`. Leen la BD `analytics` (`:5436`) y hacen la
  segmentación, la propensión y el uplift.
- **Servicio de SMS** (`seeds/Vassago/sms_service`): usado por el botón
  "Enviar prueba". Se configura en `interface web/.env` (`VITE_SMS_API_URL`).
  Ojo: si XGBoost ocupa `:8011`, hay que correr el SMS en otro puerto.

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
```

`ia-service/.env`: `IA_SERVICE_DEEPSEEK_API_KEY` (o `DEEPSEEK_API_KEY`).
