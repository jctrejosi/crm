"""Acceso a la réplica Postgres de analytics (lectura de features server-side).

Resuelve el cuello de botella del transporte JSON: en vez de enviar decenas de
miles de puntos por HTTP, el servicio lee la vista RFM (o cualquier SELECT de
solo lectura) directamente desde Postgres y sólo devuelve ids + labels.

La conexión se configura con `DATABASE_URL` y todas las consultas se ejecutan
en una transacción de solo lectura.
"""

import re
import threading
import time

import numpy as np
import psycopg

from app.core.config import settings

# Palabras prohibidas en una consulta de solo lectura. Se busca como token
# (rodeado de no-letras) para evitar falsos positivos en literales.
_FORBIDDEN = (
    "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "TRUNCATE",
    "GRANT", "REVOKE", "COPY", "VACUUM", "CALL", "DO", "MERGE",
)

# Caché en memoria de read_features: la consulta de la vista RFM tarda
# ~30-40 s contra la réplica y se repite en cada request (segment-clients,
# segment-for-products, assign-from-db...). Con un solo worker de uvicorn
# basta un módulo-global con TTL.
_CACHE_TTL = 15 * 60  # segundos (los datos de la réplica cambian lento)
_cache: dict = {}
_cache_lock = threading.Lock()


class DatabaseError(Exception):
    """La BD de analytics no está disponible o está mal configurada."""


def _validate_select(query: str) -> str:
    """Garantiza que la consulta es un único SELECT de solo lectura."""
    if not query or not query.strip():
        raise ValueError("'query' no puede estar vacía")

    sql = query.strip()

    # Se permite un único ';' final; cualquier otro ';' implica varias sentencias.
    body = sql[:-1] if sql.endswith(";") else sql
    if ";" in body:
        raise ValueError("sólo se permite una sentencia SELECT")

    if not body.lstrip().upper().startswith("SELECT"):
        raise ValueError("'query' debe ser un SELECT de solo lectura")

    upper = body.upper()
    for word in _FORBIDDEN:
        if re.search(rf"\b{word}\b", upper):
            raise ValueError(f"palabra no permitida en 'query': {word}")

    return body


def _apply_limit(query: str, limit: int | None) -> str:
    """Envuelve la consulta en una subconsulta con LIMIT si se pide."""
    if limit is None:
        return query
    return f"SELECT * FROM ({query}) AS _sub LIMIT {int(limit)}"


def execute_read(sql: str, params: list | tuple | None = None) -> list[tuple]:
    """Ejecuta un SELECT interno de solo lectura y devuelve todas las filas.

    Para consultas controladas por el propio servicio (no por el cliente),
    p. ej. el cálculo de afinidad de segmentos en pos.venta_lineas.
    """
    if not settings.DATABASE_URL:
        raise DatabaseError(
            "DATABASE_URL no está configurada en el servicio de clustering"
        )
    try:
        with psycopg.connect(settings.DATABASE_URL) as conn:
            with conn.cursor() as cur:
                cur.execute("SET TRANSACTION READ ONLY")
                cur.execute(sql, params)
                return cur.fetchall()
    except psycopg.Error as exc:
        raise DatabaseError(f"error consultando la BD de analytics: {exc}")


def _to_matrix(rows: list, idx: list[int]) -> np.ndarray:
    try:
        X = np.asarray([[r[i] for i in idx] for r in rows], dtype=np.float64)
    except (TypeError, ValueError):
        raise ValueError(
            "las columnas de features deben ser numéricas; usa 'id_column' "
            "para excluir la columna identificadora"
        )
    if not np.isfinite(X).all():
        raise ValueError("hay valores NaN o Inf en las features")
    return X


def read_features(
    query: str,
    id_column: str | None = None,
    limit: int | None = None,
) -> tuple[list, list[str], np.ndarray]:
    """Ejecuta un SELECT de solo lectura y devuelve (ids, feature_names, X).

    - `ids`: valores de la columna identificadora (None si no se pasa
      `id_column`). Se mantienen como vienen de Postgres (str/int).
    - `feature_names`: nombres de las columnas usadas como features.
    - `X`: matriz numérica float64 (n_filas, n_features).
    """
    if not settings.DATABASE_URL:
        raise DatabaseError(
            "DATABASE_URL no está configurada en el servicio de clustering"
        )

    # Caché TTL por (query, id_column, limit).
    key = (query, id_column, limit)
    now = time.monotonic()
    with _cache_lock:
        hit = _cache.get(key)
        if hit is not None and now - hit[0] < _CACHE_TTL:
            ids, feature_names, X = hit[1]
            return ids, feature_names, X.copy()

    sql = _apply_limit(_validate_select(query), limit)

    try:
        with psycopg.connect(settings.DATABASE_URL) as conn:
            with conn.cursor() as cur:
                # Primera sentencia de la transacción → la deja en solo lectura.
                cur.execute("SET TRANSACTION READ ONLY")
                cur.execute(sql)
                colnames = [d.name for d in cur.description]
                rows = cur.fetchall()
    except psycopg.Error as exc:
        raise DatabaseError(f"error consultando la BD de analytics: {exc}")

    if not rows:
        raise ValueError("la consulta no devolvió filas")

    ids = None
    if id_column:
        if id_column not in colnames:
            raise ValueError(
                f"id_column '{id_column}' no está entre las columnas devueltas: "
                f"{colnames}"
            )
        id_idx = colnames.index(id_column)
        ids = [r[id_idx] for r in rows]
        feat_idx = [i for i, n in enumerate(colnames) if n != id_column]
        feature_names = [n for n in colnames if n != id_column]
    else:
        feat_idx = list(range(len(colnames)))
        feature_names = colnames

    if not feature_names:
        raise ValueError("no quedan columnas de features tras excluir id_column")

    X = _to_matrix(rows, feat_idx)
    with _cache_lock:
        _cache[key] = (time.monotonic(), (ids, feature_names, X))
    return ids, feature_names, X
