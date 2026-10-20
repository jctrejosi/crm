from typing import List, Optional

from pydantic import BaseModel, Field

from app.schemas.common import Point


class AssignRequest(BaseModel):
    model_name: str = Field(..., min_length=1)

    points: List[Point] = Field(
        ...,
        min_length=1,
        description="Puntos a asignar (misma dimensionalidad con la que se entrenó)"
    )

    with_distances: bool = Field(
        True,
        description="Incluir la distancia de cada punto a cada centroide"
    )


class AssignResponse(BaseModel):
    model_name: str
    labels: List[int]
    distances: Optional[List[List[float]]] = None


class AssignFromDbRequest(BaseModel):
    """Asigna labels leyendo las features desde la réplica Postgres (sin JSON)."""

    model_name: str = Field(..., min_length=1)

    query: str = Field(
        ...,
        min_length=1,
        description=(
            "SELECT de solo lectura con las mismas columnas (y orden) con las "
            "que se entrenó el modelo"
        )
    )

    id_column: Optional[str] = Field(
        None,
        description="Columna identificadora (p. ej. cliente_cod) para devolver ids"
    )

    limit: Optional[int] = Field(
        None,
        ge=1,
        description="Máximo de filas a leer (se aplica como LIMIT sobre la consulta)"
    )

    with_distances: bool = Field(
        False,
        description="Incluir la distancia de cada punto a cada centroide"
    )

    label: Optional[int] = Field(
        None,
        ge=0,
        description="Devolver sólo los ids cuyo cluster (label) sea este valor"
    )
