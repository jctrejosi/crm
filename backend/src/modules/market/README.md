# Módulo `market` — catálogos de la competencia

Ingesta diaria de los catálogos de **Éxito, Carulla, Olímpica y D1** para el
*Radar de Precios* (`/mercado`). Es la versión mínima del scraper de Vassago:
no descarga HTML ni imágenes, solo consulta las APIs públicas de VTEX y guarda
producto, EAN, precio, unidad y categorías en la base operativa del CRM
(`crm` :5437).

## Tablas (`drizzle/schema.ts`)

| Tabla | Contenido |
|---|---|
| `competitor_stores` | Un registro por súper (`exito`, `carulla`, `olimpica`, `d1`). |
| `competitor_categories` | Árbol de categorías con `id_path` (`/1/20/`) para `fq=C:`. |
| `competitor_products` | Producto con su **precio vigente**, EAN/PLU, unidad, URL e imagen. |
| `competitor_prices` | Histórico: solo se inserta fila cuando el precio cambia. |
| `competitor_product_categories` | N:M producto ↔ categoría. |
| `competitor_ingest_runs` | Una fila por corrida: estado, fase, progreso, errores. |
| `app_notifications` | Avisos para el banner de `/mercado` y la campana del topbar. |

Las tablas del catálogo propio (`products`, `product_variants`, `prices`…) no se
tocan.

## Cómo funciona la extracción

Todas las cadenas usan la API legacy de VTEX
(`/api/catalog_system/pub/...`); Éxito y Carulla la exponen bajo `/io`.

1. **Categorías**: `GET /category/tree/:levels` → upsert del árbol.
2. **Catálogo**: `GET /products/search?fq=P:[min TO max]&_from=&_to=`.
   - VTEX solo permite `_from <= 2500`, así que el catálogo se trocea por
     **rangos de precio** (`MARKET_PRICE_BRACKETS`).
   - Si un tramo supera 2.500 resultados, se parte a la mitad de forma
     recursiva. Si no se puede partir más (mismo precio), se reparte por
     categorías hoja.
   - Se ignoran los productos sin precio (no sirven para comparar).
3. **Upsert por lotes** de 500 productos. Se deduplica por `externalId` y se
   elige la mejor oferta (`items[].sellers[].commertialOffer`), no `items[0]`.
4. Si la corrida queda `partial`/`failed`, se crea una notificación y el
   dashboard muestra el banner con la cobertura y el error.

> Detalle importante: los `fq` se codifican con `%20` para los espacios.
> `URLSearchParams` los convierte en `+` y VTEX responde **HTTP 400**.

## Scheduler

- Cron diario **03:00 America/Bogota** (`MarketSchedulerService`).
- Una corrida secuencial por súper (no satura la red).
- Al arrancar:
  - sincroniza `competitor_stores`;
  - marca como fallidas las corridas que quedaron en `running` por un corte
    (el CRM es una sola instancia, así que ninguna corrida previa sigue viva).
- `MARKET_CATCHUP_ON_START=true` recupera una corrida perdida 90 s después de
  arrancar (desactivado por defecto).

### Variables de entorno

| Variable | Default | Uso |
|---|---|---|
| `MARKET_INGEST_ENABLED` | `true` | Apaga el cron y la ingesta. |
| `MARKET_CONCURRENCY_EXITO` | `6` | Peticiones simultáneas. |
| `MARKET_CONCURRENCY_CARULLA` | `4` | |
| `MARKET_CONCURRENCY_OLIMPICA` | `4` | |
| `MARKET_CONCURRENCY_D1` | `2` | |
| `MARKET_REQUEST_DELAY_MS` | `120` | Pausa por petición y worker. |

| `MARKET_STALE_DATA_HOURS` | `36` | Antigüedad a partir de la cual la UI avisa. |
| `MARKET_CATCHUP_ON_START` | `false` | Reintento al arrancar si quedó pendiente. |

## API (`admin/market`)

Requiere JWT (cookie httpOnly).

| Método | Ruta | Uso |
|---|---|---|
| `GET` | `/status` | Estado por súper + alertas para el banner. |
| `GET` | `/runs?store=&limit=` | Historial de corridas. |
| `GET` | `/notifications?unread=&limit=` | Campana del topbar. |
| `PATCH` | `/notifications/read-all` | Marcar todo como leído. |
| `PATCH` | `/notifications/:id/read` | Marcar una. |
| `POST` | `/ingest` | Disparar los 4 (omite los que ya corren). |
| `POST` | `/ingest/:store` | Disparar uno (`exito`, `carulla`, `olimpica`, `d1`). |

## Ingesta manual (sin esperar al cron)

```sh
curl -X POST http://localhost:3100/admin/market/ingest/d1 \
  -H 'Cookie: <jwt del admin>'
```

El progreso se consulta en `GET /admin/market/status` (campos `progressPct` y
`phase` del último run).
