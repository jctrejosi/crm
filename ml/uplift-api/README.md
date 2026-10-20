# Uplift API

Modelado de **uplift** (incrementalidad de campañas) con **econml** (Microsoft):
identifica a los clientes cuya conducta **cambia** por la oferta, no a los que
comprarían igual. Complementa a `XGBoost-api` (propensión).

## Por qué uplift y no propensión

- Propensión: `P(compra)` → quién es probable que compre.
- Uplift: `P(compra | oferta) − P(compra | sin oferta)` → quién compra **por la
  campaña** (el "persuadable"). Targetear por propensión regala descuentos a los
  que iban a comprar igual; el uplift maximiza la compra incremental.

## Algoritmos soportados (`method`)

| method | Descripción |
|---|---|
| `dr_learner` | **DR-learner (double robust)** — el recomendado; cross-fitting y ortogonalización |
| `x_learner` | X-learner — robusto cuando la oferta llega a pocos |
| `t_learner` | Dos modelos (tratados vs control) — baseline |
| `causal_forest` | Bosques causales — heterogeneidad del efecto + importancia nativa |

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/uplift/train` | Entrena un modelo de uplift |
| POST | `/uplift/predict` | Puntúa clientes (uplift_score + percentil) |
| GET | `/uplift/models` | Lista de modelos |
| GET | `/uplift/models/{name}` | Metadata |
| DELETE | `/uplift/models/{name}` | Elimina |
| GET | `/uplift/metrics/{name}` | Métricas (Qini/AUUC, ATE, CATE) |
| GET | `/health` | Estado |

## Ejemplo

```json
POST /uplift/train
{
  "model_name": "uplift_campania_1",
  "method": "dr_learner",
  "treatment_column": "recibio_oferta",
  "outcome_column": "compro",
  "categorical_columns": ["segmento"],
  "data": [
    {"frecuencia": 12, "monetario": 500000, "segmento": 1, "recibio_oferta": 1, "compro": 1}
  ]
}
```

## Métricas (en `/uplift/train` y `/uplift/metrics/{name}`)

- **`auuc`** — área bajo la curva Qini (≈0 = selección aleatoria; >0 = el modelo
  separa persuadables).
- **`gain_top_20`** — compra incremental al targetear el top 20% por uplift.
- **`ate`** — efecto promedio del tratamiento.
- **`cate_*`** — distribución del efecto individual (heterogeneidad).
- **`feature_importance`** — importancia nativa (causal forest / DR-learner) o por
  permutación sobre el CATE.

## Requisito operativo (importante)

El uplift necesita **grupo de control aleatorizado**: en cada campaña, un 10–20%
de los elegibles **no recibe** la oferta. Sin control no hay contrafactual y el
modelo no se puede entrenar. Cada campaña con control alimenta y mejora la siguiente.
