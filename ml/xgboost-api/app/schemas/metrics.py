from pydantic import BaseModel


class MetricsResponse(BaseModel):
    status: str
    model_name: str
    mae: float
    rmse: float
    r2: float