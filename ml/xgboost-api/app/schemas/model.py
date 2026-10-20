from typing import Optional

from pydantic import BaseModel


class ModelInfo(BaseModel):
    model_name: str
    target_column: str
    trained_at: str
    records: int
    features: int
    lags: int
    test_size: float
    mae: float
    rmse: float
    r2: float
    feature_columns: Optional[list[str]] = None


class ModelListResponse(BaseModel):
    count: int
    models: list[ModelInfo]


class ModelDetailResponse(BaseModel):
    status: str
    model: ModelInfo