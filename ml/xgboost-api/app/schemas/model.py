from typing import Any, Optional

from pydantic import BaseModel


class ModelInfo(BaseModel):
    model_name: str
    target_column: Optional[str] = None
    trained_at: Optional[str] = None
    records: Optional[int] = None
    features: Optional[int] = None
    lags: Optional[int] = None
    test_size: Optional[float] = None
    mae: Optional[float] = None
    rmse: Optional[float] = None
    r2: Optional[float] = None
    feature_columns: Optional[list[str]] = None
    # Modelos de clasificación (p. ej. prop_activo) usan estas claves.
    problem_type: Optional[str] = None
    metrics: Optional[dict[str, Any]] = None


class ModelListResponse(BaseModel):
    count: int
    models: list[ModelInfo]


class ModelDetailResponse(BaseModel):
    status: str
    model: ModelInfo
