from fastapi import APIRouter, HTTPException, status

from app.schemas.train import UpliftTrainRequest
from app.services.uplift_trainer import UpliftTrainer

router = APIRouter()


@router.post("/uplift/train")
def train_uplift(request: UpliftTrainRequest):
    try:
        return UpliftTrainer.train(request)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(error),
        )
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error en el entrenamiento: {error}",
        )
