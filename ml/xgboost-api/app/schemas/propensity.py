from typing import Literal, Optional

from pydantic import BaseModel, Field


class PropensityTrainRequest(BaseModel):

    model_name: str = Field(
        ...,
        min_length=1,
        max_length=100
    )

    target_column: str = Field(
        ...,
        min_length=1
    )

    problem_type: Literal["binary", "multiclass"] = Field(
        "binary",
        description="binary: compra/no compra · multiclass: qué producto/categoría"
    )

    data: list[dict] = Field(
        ...,
        min_length=2,
        description="Filas tabulares: features + columna objetivo"
    )

    feature_columns: Optional[list[str]] = Field(
        None,
        description="Si se omite, se usan todas las columnas menos el target"
    )

    categorical_columns: list[str] = Field(
        default_factory=list,
        description="Columnas categóricas (p. ej. ['segmento']) — se codifican ordinalmente"
    )

    n_estimators: int = Field(300, ge=10, le=5000)
    max_depth: int = Field(6, ge=1, le=30)
    learning_rate: float = Field(0.05, gt=0, le=1.0)
    subsample: float = Field(0.8, gt=0, le=1.0)
    colsample_bytree: float = Field(0.8, gt=0, le=1.0)
    min_child_weight: int = Field(1, ge=1)

    early_stopping_rounds: Optional[int] = Field(
        20,
        ge=1,
        description="Early stopping sobre una partición de validación"
    )

    test_size: float = Field(0.2, gt=0, lt=1)
    random_state: int = 42
    with_shap: bool = Field(
        True,
        description="Explicabilidad SHAP (si shap no está instalado, usa gain de XGBoost)"
    )


class PropensityPredictRequest(BaseModel):

    model_name: str = Field(
        ...,
        min_length=1
    )

    data: list[dict] = Field(
        ...,
        min_length=1,
        description="Filas con las features del modelo (sin el target)"
    )
