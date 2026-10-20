from fastapi import APIRouter

from app.schemas.train import (
    TrainRequest
)

from app.services.trainer import (
    Trainer
)

router = APIRouter()


@router.post("/train")
def train_model(
    request: TrainRequest
):

    return Trainer.train(
        request
    )