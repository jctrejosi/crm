import numpy as np


def validate_points(points: list) -> np.ndarray:
    """Valida la matriz de puntos y la devuelve como ndarray float64.

    Reglas: lista no vacía, todos vectores numéricos de la misma dimensión,
    sin NaN/Inf.
    """

    if not points:
        raise ValueError("'points' no puede estar vacío")

    if not all(isinstance(p, list) for p in points):
        raise ValueError("cada punto debe ser una lista de números")

    n_cols = len(points[0])
    if n_cols == 0:
        raise ValueError("los puntos no pueden tener dimensión 0")

    for i, p in enumerate(points):
        if len(p) != n_cols:
            raise ValueError(
                f"dimensionalidad inconsistente: el punto 0 tiene {n_cols} "
                f"columnas y el punto {i} tiene {len(p)}"
            )

    try:
        X = np.asarray(points, dtype=np.float64)
    except (TypeError, ValueError):
        raise ValueError("los puntos deben ser numéricos")

    if not np.isfinite(X).all():
        raise ValueError("hay valores NaN o Inf en los puntos")

    return X
