# ml/ — servicios de modelos (clustering · xgboost · uplift)

Los tres servicios de ML que consume el backend del CRM para segmentar,
puntuar propensión y estimar persuasibilidad. **Antes vivían en el repo
`Astaroth`**; ahora forman parte de este repo y se despliegan dentro del
contenedor de aplicación del CRM (no hay contenedor externo).

| Servicio | Puerto | Stack | Qué hace |
|---|---|---|---|
| `clustering-api/` | **8010** | scikit-learn + joblib + psycopg | `fit`, `assign`, `/segment-clients`, `/segment-for-products`, métricas y filtros. Lee la vista RFM de `analytics`. |
| `xgboost-api/` | **8011** | xgboost + scikit-learn + shap | Entrenamiento y `/propensity/predict` (probabilidad de compra). |
| `uplift-api/` | **8012** | econml + xgboost | Entrenamiento y `/uplift/predict` (persuasibilidad: DR-learners, causal forest, X/T). |

Cada uno es una API **FastAPI** independiente (`app.main:app`) con su propio
`requirements.txt`, su propio venv y sus modelos en `saved_models/`.

## Cómo los llama el backend

El backend NestJS usa estas URLs (por defecto loopback):

```env
CLUSTERING_API_URL=http://127.0.0.1:8010
XGBOOST_API_URL=http://127.0.0.1:8011
UPLIFT_API_URL=http://127.0.0.1:8012
CLUSTERING_API_KEY=change-me      # = ADMIN_KEY de los tres servicios
CLUSTERING_MODEL_NAME=seg_rfm_v1
XGBOOST_PROPENSITY_MODEL=prop_activo
UPLIFT_MODEL=uplift_dr_learner
```

- `clustering` recibe `X-Admin-Key` (el resto de endpoints de `xgboost`/`uplift`
  usados por el CRM —`/propensity/predict` y `/uplift/predict`— no la requieren).
- **`clustering-api` lee `DATABASE_URL`**: en el backend esa variable apunta a la
  BD operativa `crm`, así que al proceso de clustering se le pasa **solo a él**
  la réplica `analytics`. En producción lo hace `docker/entrypoint.sh` con
  `ANALYTICS_DATABASE_URL`; en local lo hace `dev.js`.
- Los modelos se cargan de `saved_models/` (relativo al directorio del servicio).

## Local

```bash
node dev.js            # levanta también clustering + xgboost + uplift
node dev.js --ml       # solo los tres modelos
node dev.js --clustering --uplift
```

Si falta el `.venv`, `dev.js` lo crea e instala `requirements.txt` de cada
servicio. Son dependencias pesadas (xgboost, shap, econml): la primera vez tarda.

> Requiere **Python ≥3.12** (recomendado 3.13). Los pines de `requirements.txt`
> son los del entorno de Astaroth: `numpy 2.5.2` y `xgboost 3.4.1` no existen para
> Python 3.11.

## Producción

`docker/Dockerfile` construye **un venv por servicio** sobre
`python:3.13-slim-bookworm` (la misma base que el runtime y la misma versión de
Python con la que Astaroth entrenó los modelos) y los copia a la imagen junto
con el código y los `saved_models`. Node 20 se copia desde su imagen oficial al
runtime, porque el backend ya viene compilado. `docker/entrypoint.sh` arranca
los tres `uvicorn` en `127.0.0.1` (no se exponen a internet).

Los modelos están horneados en la imagen (~15 MB) y además montados en volúmenes
con nombre (`crm_ml_*_models`) para que los re-entrenamientos persistan entre
redeploys. En el primer arranque, Docker siembra cada volumen con los modelos de
la imagen.

> Los `Dockerfile` de cada subcarpeta son los originales de Astaroth para
> construir el servicio por separado. **El despliegue del CRM no los usa**:
> todo se construye con `docker/Dockerfile` desde la raíz del repo.
