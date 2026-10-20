"""Curva Qini y AUUC: validación de modelos de uplift.

Sin poder ver el contrafactual de cada persona, la curva Qini mide la ganancia
incremental acumulada al dirigirse a la fracción de clientes con mayor uplift,
comparando tratados vs control (en un experimento aleatorizado).
"""

import numpy as np


def qini_curve(y, treatment, uplift, n_points: int = 101):
    """Devuelve (% targeting, ganancia incremental acumulada).

    Ganancia en el punto k (top k% por uplift):
        Σ_{i≤k} yᵢ·tᵢ / N_t  −  Σ_{i≤k} yᵢ·(1−tᵢ) / N_c
    """
    y = np.asarray(y, dtype=float)
    t = np.asarray(treatment, dtype=float)
    uplift = np.asarray(uplift, dtype=float)

    order = np.argsort(-uplift)
    y, t = y[order], t[order]

    n = len(y)
    n_t = max(t.sum(), 1)
    n_c = max((1 - t).sum(), 1)

    cum_t = np.cumsum(y * t) / n_t
    cum_c = np.cumsum(y * (1 - t)) / n_c
    curve = cum_t - cum_c

    k = np.linspace(0, n - 1, n_points).astype(int)
    return k / n * 100.0, curve[k]


def auuc(y, treatment, uplift) -> float:
    """Área bajo la curva Qini normalizada (media de la curva).

    En un experimento aleatorizado, una selección aleatoria da AUUC ≈ 0;
    un buen modelo de uplift da AUUC > 0.
    """
    y = np.asarray(y, dtype=float)
    t = np.asarray(treatment, dtype=float)
    uplift = np.asarray(uplift, dtype=float)

    order = np.argsort(-uplift)
    y, t = y[order], t[order]

    n = len(y)
    n_t = max(t.sum(), 1)
    n_c = max((1 - t).sum(), 1)

    cum_t = np.cumsum(y * t) / n_t
    cum_c = np.cumsum(y * (1 - t)) / n_c

    return float((cum_t - cum_c).mean())


def gain_at_k(y, treatment, uplift, k: float = 0.2) -> float:
    """Ganancia incremental al targetear el top k% (default 20%)."""
    _, curve = qini_curve(y, treatment, uplift, n_points=101)
    idx = int(round(k * 100))
    return float(curve[min(idx, len(curve) - 1)])
