import numpy as np

from app.schemas.assign import AssignRequest
from app.services.model_store import ModelStore
from app.utils.validation import validate_points


class Assigner:

    @staticmethod
    def assign(request: AssignRequest) -> dict:
        X = validate_points(request.points)
        return Assigner.assign_matrix(
            request.model_name, X, request.with_distances
        )

    @staticmethod
    def assign_matrix(
        model_name: str,
        X: np.ndarray,
        with_distances: bool = False,
    ) -> dict:
        """Asigna una matriz ya cargada (usada por /assign-from-db)."""
        pipeline = ModelStore.load_model(model_name)
        metadata = ModelStore.load_metadata(model_name)

        if X.shape[1] != metadata["n_features"]:
            raise ValueError(
                f"dimensionalidad incorrecta: el modelo '{model_name}' "
                f"espera {metadata['n_features']} features y los puntos tienen "
                f"{X.shape[1]}"
            )

        scaler = pipeline.get("scaler")
        model = pipeline.get("model")
        if model is None:
            raise ValueError("pipeline corrupto: falta el modelo")

        Xt = scaler.transform(X) if scaler else X
        labels = model.predict(Xt).tolist()

        distances = None
        if with_distances and hasattr(model, "transform"):
            distances = np.round(model.transform(Xt), 6).tolist()

        return {
            "model_name": model_name,
            "labels": labels,
            "distances": distances
        }
