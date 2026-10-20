import numpy as np
import pandas as pd

from app.schemas.train import UpliftPredictRequest
from app.services.model_store import ModelStore
from app.services.validation import apply_categorical_maps


class UpliftPredictor:

    @staticmethod
    def predict(request: UpliftPredictRequest) -> dict:

        if not ModelStore.model_exists(request.model_name):
            raise FileNotFoundError(
                f"No existe el modelo '{request.model_name}'"
            )

        metadata = ModelStore.load_metadata(request.model_name)
        model = ModelStore.load_model(request.model_name)

        feature_columns = metadata["feature_columns"]
        categorical_maps = metadata.get("categorical_columns", {})

        df = pd.DataFrame(request.data)

        missing = [
            column
            for column in feature_columns
            if column not in df.columns
        ]

        if missing:
            raise ValueError(
                f"Faltan columnas de features: {missing}"
            )

        X = df[feature_columns].copy()
        apply_categorical_maps(X, categorical_maps)

        # econml 0.17: causal_forest usa predict() en lugar de effect()
        method = metadata.get("method")

        if method == "causal_forest":
            effect = np.asarray(model.predict(X)).reshape(-1)
        else:
            effect = np.asarray(model.effect(X)).reshape(-1)

        scores = [float(value) for value in effect]

        predictions = []

        for indice, score in enumerate(scores):

            item = {
                "index": indice,
                "uplift_score": score,
            }

            if request.with_percentile:
                n = len(scores)
                ranks = np.argsort(np.argsort(effect))
                item["percentile"] = round(
                    float((ranks[indice] + 1) / n * 100),
                    2,
                )

            predictions.append(item)

        return {
            "status": "success",
            "model_name": request.model_name,
            "method": metadata.get("method"),
            "interpretation": (
                "uplift_score = P(compra | oferta) − P(compra | sin oferta). "
                "Mayor score → mayor impacto incremental de la oferta."
            ),
            "predictions": predictions,
        }
