# Clustering API

Servicio de clustering genérico de Astaroth (familia de algoritmos de
agrupamiento): entrena, asigna puntos y expone métricas. Sigue el mismo
patrón que `XGBoost-api` (FastAPI + artefactos en `saved_models/`).

## Algoritmos soportados

| `algorithm` | Implementación |
|---|---|
| `kmeans` | `sklearn.cluster.KMeans` (Lloyd, `n_init=10`) |
| `minibatch` | `sklearn.cluster.MiniBatchKMeans` (para datasets grandes) |
| `gmm` | `sklearn.mixture.GaussianMixture` (clusters elípticos, pertenencia suave) |

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Estado del servicio |
| POST | `/fit` | Entrena y guarda un modelo (puntos por JSON) |
| POST | `/assign` | Asigna puntos a un modelo entrenado (puntos por JSON) |
| POST | `/fit-from-db` | Entrena leyendo features desde la réplica Postgres (requiere `X-Admin-Key`) |
| POST | `/assign-from-db` | Asigna labels leyendo features desde Postgres (requiere `X-Admin-Key`) |
| POST | `/segment-for-products` | Mejor segmento para una campaña según sus productos (auto-fit si no existe; devuelve contactos de `pos.clientes`) |
| GET | `/models` | Lista de modelos |
| GET | `/models/{name}` | Metadata del modelo |
| DELETE | `/models/{name}` | Elimina un modelo |
| GET | `/metrics/{name}` | Métricas del modelo |
| DELETE | `/admin/clear_all_models` | Borra todo (requiere `X-Admin-Key`) |

## Ejemplo

```bash
# Entrenar
curl -X POST http://localhost:8000/fit \
  -H "Content-Type: application/json" \
  -d '{
    "model_name": "seg_v1",
    "algorithm": "kmeans",
    "k": 5,
    "points": [[1.0, 2.0], [1.1, 2.1], [10.0, 20.0], [10.5, 20.5]]
  }'

# Asignar puntos nuevos
curl -X POST http://localhost:8000/assign \
  -H "Content-Type: application/json" \
  -d '{"model_name": "seg_v1", "points": [[1.2, 2.0]]}'
```

### Segmentación por productos (creación de campañas)

Elige el segmento con más afinidad a los productos seleccionados y devuelve
sus clientes con contacto (`pos.clientes`):

```bash
curl -X POST http://localhost:8000/segment-for-products \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: change-me" \
  -d '{
    "model_name": "seg_rfm_v1",
    "products": ["101130100000100"],
    "auto_fit": true,
    "limit": 500
  }'
```

- Si el modelo no existe y `auto_fit` es `true`, se entrena con la vista RFM
  (equivale a `/fit-from-db`).
- La afinidad se mide como clientes de cada segmento que compraron las
  categorías (`tipo_producto`) de los productos en `pos.venta_lineas`.
- Respuesta: `best_segment`, `ranking` (share de compradores por segmento) y
  `recipients` (cédula, nombre, email, teléfono y consentimientos).

### Entrenar/Asignar desde Postgres (datasets grandes)

Para datasets de decenas de miles de filas, el transporte JSON es el cuello de
botella. En su lugar, el servicio puede leer las features directo de la réplica
(requiere `DATABASE_URL` y el header `X-Admin-Key`):

```bash
# Entrenar sobre la vista RFM (id_column excluye la cédula de las features)
curl -X POST http://localhost:8000/fit-from-db \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: change-me" \
  -d '{
    "model_name": "seg_rfm_v1",
    "algorithm": "minibatch",
    "k": 6,
    "query": "SELECT * FROM analytics.vw_rfm_clientes",
    "id_column": "cliente_cod"
  }'

# Asignar todos los clientes de la vista (devuelve ids + labels)
curl -X POST http://localhost:8000/assign-from-db \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: change-me" \
  -d '{
    "model_name": "seg_rfm_v1",
    "query": "SELECT * FROM analytics.vw_rfm_clientes",
    "id_column": "cliente_cod"
  }'

# Sólo los ids de un cluster (para dirigir una campaña a un segmento)
curl -X POST http://localhost:8000/assign-from-db \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: change-me" \
  -d '{
    "model_name": "seg_rfm_v1",
    "query": "SELECT * FROM analytics.vw_rfm_clientes",
    "id_column": "cliente_cod",
    "label": 2
  }'
```

## Diseño

- El servicio es **agnóstico de la BD** en sus endpoints `/fit` y `/assign`:
  recibe los puntos por la API. Los endpoints `/fit-from-db` y
  `/assign-from-db` leen directo de Postgres (réplica `pos.*` / vista
  `analytics.vw_rfm_clientes`) para evitar transportar 100K+ filas por JSON.
- Las consultas a la BD se validan (un único `SELECT`) y se ejecutan en una
  transacción de solo lectura; los endpoints están protegidos por
  `X-Admin-Key`.
- Persistencia por modelo en `saved_models/{name}/`:
  `model.joblib` (pipeline scaler+clusterer), `centroids.json`,
  `metadata.json` (métricas, parámetros y `feature_names`).
- La silueta se calcula sobre una muestra de máx. 10.000 puntos (es O(n²)).
- Los centroides se guardan en el **espacio original** (escala inversa).

## Notas de operación

- `MODELS_DIR` (default `saved_models`), `ADMIN_KEY` y `DATABASE_URL` se
  configuran por variables de entorno o `.env`.
- Para datasets grandes, preferir `minibatch` y los endpoints `/fit-from-db` /
  `/assign-from-db` (leen de Postgres en vez de transportar puntos por JSON).
