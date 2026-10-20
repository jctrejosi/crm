# XGBoost API

Servicio de modelos XGBoost de Astaroth (FastAPI). Incluye:

1. **Regresión de series temporales** (endpoints `/train` y `/predict`): lags, features
   de fecha, MAE/RMSE/R².
2. **Propensión de compra** (endpoints `/propensity/*`): clasificación binaria o
   multiclase para predecir probabilidad de compra por cliente/producto/categoría.

## Propensión (`/propensity/train`)

Entrena `XGBClassifier` (binario o multiclase) con early stopping, soporte de
columnas categóricas (p. ej. `segmento` del clustering) y explicabilidad SHAP.

```json
{
  "model_name": "prop_activo",
  "target_column": "activo_30d",
  "problem_type": "binary",
  "feature_columns": ["frecuencia", "monetario", "ticket_promedio", "categorias_distintas", "segmento"],
  "categorical_columns": ["segmento"],
  "data": [
    {"frecuencia": 39.5, "monetario": 3174746.0, "ticket_promedio": 126971.0, "categorias_distintas": 70, "segmento": 0, "activo_30d": 1}
  ]
}
```

Respuesta: métricas (`accuracy`, `auc`, `logloss`) + `shap_importance` (importancia
por feature; SHAP si está instalado, si no importancia por ganancia de XGBoost).

`problem_type`: `binary` (compra/no compra) o `multiclass` (qué producto/categoría).
`categorical_columns`: se codifican ordinalmente; valores desconocidos al predecir → -1.

## Predicción (`/propensity/predict`)

```json
{
  "model_name": "prop_activo",
  "data": [
    {"frecuencia": 12.0, "monetario": 500000.0, "ticket_promedio": 60000.0, "categorias_distintas": 30, "segmento": 1}
  ]
}
```

Respuesta: por cada fila, la clase predicha y las probabilidades por clase.

## Notas

- **SHAP** está en `requirements.txt`; si no puede instalarse, el servicio sigue
  funcionando y usa la importancia por ganancia de XGBoost.
- Los modelos se guardan en `saved_models/{name}/` (`model.json` + `metadata.json`);
  la metadata incluye `problem_type`, `feature_columns`, `categorical_columns`,
  `classes`, `metrics` y `shap_importance`.
- Para entrenar con el **segmento como feature** (caso Mercaldas): el pipeline de
  la plataforma de datos arma el dataset (vista RFM + `cliente_segmento`) y envía
  `segmento` en `categorical_columns`.
