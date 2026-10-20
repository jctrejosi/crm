from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class UpliftTrainRequest(BaseModel):

    model_name: str = Field(..., min_length=1, max_length=100)

    treatment_column: str = Field(
        ...,
        min_length=1,
        description="Columna binaria: recibió (1) / no recibió (0) la oferta"
    )

    outcome_column: str = Field(
        ...,
        min_length=1,
        description="Columna de resultado: compró (1/0) o continua (ventas)"
    )

    data: list[dict] = Field(
        ...,
        min_length=50,
        description="Filas de la campaña: features + tratamiento + resultado"
    )

    method: Literal["dr_learner", "x_learner", "t_learner", "causal_forest"] = Field(
        "dr_learner",
        description="Algoritmo de uplift (DR-learner es el recomendado)"
    )

    feature_columns: Optional[list[str]] = Field(
        None,
        description="Si se omite, todas las columnas menos tratamiento y resultado"
    )

    categorical_columns: list[str] = Field(
        default_factory=list,
        description="Categóricas (p. ej. ['segmento']) — codificación ordinal"
    )

    test_size: float = Field(0.2, gt=0, lt=1)
    cv: int = Field(4, ge=2, le=10)
    n_estimators: int = Field(200, ge=10, le=2000)
    max_depth: int = Field(4, ge=1, le=20)
    learning_rate: float = Field(0.05, gt=0, le=1.0)
    random_state: int = 42


class UpliftPredictRequest(BaseModel):

    model_name: str = Field(..., min_length=1)

    data: list[dict] = Field(
        ...,
        min_length=1,
        description="Clientes a puntuar (features del modelo)"
    )

    with_percentile: bool = Field(
        True,
        description="Incluir el percentil del uplift score (para seleccionar el top X%)"
    )
