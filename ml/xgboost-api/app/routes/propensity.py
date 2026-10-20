from fastapi import APIRouter, HTTPException, status

from app.schemas.propensity import (
    PropensityTrainRequest,
    PropensityPredictRequest
)
from app.services.propensity_trainer import (
    PropensityTrainer
)
from app.services.propensity_predictor import (
    PropensityPredictor
)

router = APIRouter()


@router.post("/propensity/train")
def train_propensity(
    request: PropensityTrainRequest
):

    try:
        return (
            PropensityTrainer.train(
                request
            )
        )
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(error)
        )
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error en el entrenamiento: {error}"
        )


@router.post("/propensity/predict")
def predict_propensity(
    request: PropensityPredictRequest
):

    try:
        return (
            PropensityPredictor.predict(
                request
            )
        )
    except FileNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(error)
        )
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(error)
        )
