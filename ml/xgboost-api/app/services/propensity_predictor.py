import pandas as pd
import xgboost as xgb

from app.schemas.propensity import (
    PropensityPredictRequest
)
from app.services.model_store import (
    ModelStore
)


class PropensityPredictor:

    @staticmethod
    def predict(
        request: PropensityPredictRequest
    ) -> dict:

        if not ModelStore.model_exists(
            request.model_name
        ):
            raise FileNotFoundError(
                f"No existe el modelo '{request.model_name}'"
            )

        metadata = (
            ModelStore.load_metadata(
                request.model_name
            )
        )

        feature_columns = (
            metadata["feature_columns"]
        )

        categorical_maps = (
            metadata.get(
                "categorical_columns",
                {}
            )
        )

        classes = (
            metadata["classes"]
        )

        df = pd.DataFrame(
            request.data
        )

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

        for column, categories in categorical_maps.items():

            if column not in X.columns:
                continue

            mapping = {
                categoria: indice
                for indice, categoria in enumerate(categories)
            }

            X[column] = (
                X[column]
                .astype(str)
                .map(mapping)
                .fillna(-1)
                .astype(int)
            )

        model = xgb.XGBClassifier()

        model.load_model(
            str(
                ModelStore.get_model_path(
                    request.model_name
                )
            )
        )

        proba = model.predict_proba(
            X
        )
        labels = model.predict(
            X
        )

        predictions = []

        for indice in range(len(X)):

            probabilities = {
                str(classes[clase]): float(probabilidad)
                for clase, probabilidad in enumerate(
                    proba[indice]
                )
            }

            predictions.append(
                {
                    "index": indice,
                    "label": str(
                        classes[
                            int(
                                labels[indice]
                            )
                        ]
                    ),
                    "probabilities": probabilities
                }
            )

        return {
            "status": "success",
            "model_name": request.model_name,
            "problem_type": metadata.get(
                "problem_type"
            ),
            "predictions": predictions
        }
