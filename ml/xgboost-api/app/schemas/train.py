from datetime import datetime
from typing import Any

from pydantic import BaseModel


class DataRecord(BaseModel):
    date: datetime

    class Config:
        extra = "allow"


class TrainRequest(BaseModel):
    model_name: str
    target_column: str
    data: list[DataRecord]


class TrainResponse(BaseModel):
    status: str
    message: str
    model_name: str