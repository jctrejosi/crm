from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field

from app.schemas.common import Point


class FitRequest(BaseModel):
    model_name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Nombre único del modelo (queda guardado en saved_models/)"
    )

    algorithm: Literal["kmeans", "minibatch", "gmm"] = Field(
        "kmeans",
        description="Algoritmo de clustering"
    )

    k: int = Field(
        5,
        ge=2,
        le=200,
        description="Número de clusters"
    )

    points: List[Point] = Field(
        ...,
        min_length=2,
        description="Matriz de puntos: lista de vectores numéricos de igual dimensión"
    )

    scale: bool = Field(
        True,
        description="Estandarizar las features (StandardScaler) antes de clusterizar"
    )

    random_state: int = 42
    max_iter: int = Field(300, ge=10, le=2000)


class FitResponse(BaseModel):
    status: str
    model_name: str
    algorithm: str
    k: int
    n_samples: int
    metrics: Dict[str, Optional[float]]


class FitFromDbRequest(BaseModel):
    """Entrena leyendo las features desde la réplica Postgres (sin JSON)."""

    model_name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Nombre único del modelo (queda guardado en saved_models/)"
    )

    algorithm: Literal["kmeans", "minibatch", "gmm"] = Field(
        "kmeans",
        description="Algoritmo de clustering"
    )

    k: int = Field(
        5,
        ge=2,
        le=200,
        description="Número de clusters"
    )

    scale: bool = Field(
        True,
        description="Estandarizar las features (StandardScaler) antes de clusterizar"
    )

    random_state: int = 42
    max_iter: int = Field(300, ge=10, le=2000)

    query: str = Field(
        ...,
        min_length=1,
        description=(
            "SELECT de solo lectura con las columnas de features (p. ej. "
            "SELECT * FROM analytics.vw_rfm_clientes)"
        )
    )

    id_column: Optional[str] = Field(
        None,
        description="Columna identificadora (p. ej. cliente_cod) que se excluye de las features"
    )

    limit: Optional[int] = Field(
        None,
        ge=1,
        description="Máximo de filas a leer (se aplica como LIMIT sobre la consulta)"
    )
