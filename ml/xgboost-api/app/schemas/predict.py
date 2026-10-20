from datetime import datetime

from pydantic import BaseModel
from pydantic import Field


class PredictRecord(BaseModel):

    date: datetime

    class Config:
        extra = "allow"


class PredictRequest(BaseModel):

    model_name: str = Field(
        min_length=1,
        max_length=100
    )

    points: int = Field(
        default=1,
        ge=1,
        le=1000
    )

    data: list[PredictRecord]


class PredictionItem(BaseModel):

    step: int

    date: datetime

    value: float


class PredictResponse(BaseModel):

    status: str

    model_name: str

    points: int

    predictions: list[
        PredictionItem
    ]