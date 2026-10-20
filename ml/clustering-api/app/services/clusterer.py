from datetime import datetime
from time import time

import numpy as np

from sklearn.cluster import KMeans, MiniBatchKMeans
from sklearn.mixture import GaussianMixture
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import StandardScaler

from app.schemas.fit import FitRequest
from app.services.model_store import ModelStore
from app.utils.validation import validate_points

# Máximo de puntos sobre los que se calcula la silueta (O(n²)); con más
# se toma una muestra aleatoria.
SILHOUETTE_MAX_SAMPLE = 10000


def _build_model(request: FitRequest, X: np.ndarray):
    if request.algorithm == "kmeans":
        return KMeans(
            n_clusters=request.k,
            n_init=10,
            max_iter=request.max_iter,
            random_state=request.random_state
        )
    if request.algorithm == "minibatch":
        return MiniBatchKMeans(
            n_clusters=request.k,
            n_init=10,
            max_iter=request.max_iter,
            batch_size=max(1024, min(4096, len(X) // 10)),
            random_state=request.random_state
        )
    return GaussianMixture(
        n_components=request.k,
        max_iter=request.max_iter,
        random_state=request.random_state
    )


def _silhouette(X: np.ndarray, labels: np.ndarray, random_state: int) -> float:
    """Silueta sobre una muestra si hay muchos puntos."""
    if len(X) > SILHOUETTE_MAX_SAMPLE:
        rng = np.random.default_rng(random_state)
        idx = rng.choice(len(X), size=SILHOUETTE_MAX_SAMPLE, replace=False)
        X, labels = X[idx], labels[idx]
    return float(silhouette_score(X, labels))


class Clusterer:

    @staticmethod
    def fit(request: FitRequest) -> dict:
        X = validate_points(request.points)
        return Clusterer.fit_matrix(request, X)

    @staticmethod
    def fit_matrix(
        request,
        X: np.ndarray,
        feature_names: list | None = None,
        id_column: str | None = None,
    ) -> dict:
        """Entrena sobre una matriz ya cargada (usada por /fit-from-db)."""
        start_time = time()

        n_samples, n_features = X.shape

        if request.k >= n_samples:
            raise ValueError(
                f"k ({request.k}) debe ser menor que el número de muestras "
                f"({n_samples})"
            )

        # Estandarización opcional (se guarda en el pipeline para reusarla)
        scaler = StandardScaler().fit(X) if request.scale else None
        Xt = scaler.transform(X) if scaler else X

        model = _build_model(request, X)
        labels = model.fit_predict(Xt)

        # Métricas
        if request.algorithm == "gmm":
            score = float(model.lower_bound_)
        else:
            score = float(model.inertia_)

        silhouette = _silhouette(Xt, labels, request.random_state)

        # Centroides en el espacio original
        centers = (
            model.means_ if request.algorithm == "gmm"
            else model.cluster_centers_
        )
        if scaler:
            centers = scaler.inverse_transform(centers)
        centroids = np.round(centers, 6).tolist()

        # Persistencia
        ModelStore.create_model_directory(request.model_name)
        ModelStore.save_model(
            request.model_name,
            {"scaler": scaler, "model": model}
        )
        ModelStore.save_centroids(request.model_name, centroids)

        metadata = {
            "model_name": request.model_name,
            "algorithm": request.algorithm,
            "k": request.k,
            "scale": request.scale,
            "random_state": request.random_state,
            "created_at": datetime.utcnow().isoformat(),
            "n_samples": n_samples,
            "n_features": n_features,
            "feature_names": feature_names,
            "id_column": id_column,
            "training_time_seconds": round(time() - start_time, 2),
            "metrics": {
                "inertia" if request.algorithm != "gmm" else "log_likelihood": score,
                "silhouette": silhouette
            }
        }
        ModelStore.save_metadata(request.model_name, metadata)

        return {
            "status": "success",
            "model_name": request.model_name,
            "algorithm": request.algorithm,
            "k": request.k,
            "n_samples": n_samples,
            "training_time_seconds": metadata["training_time_seconds"],
            "metrics": metadata["metrics"]
        }
