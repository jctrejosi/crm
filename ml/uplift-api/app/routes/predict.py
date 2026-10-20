from fastapi import APIRouter, HTTPException, status

from app.schemas.train import UpliftPredictRequest
from app.services.uplift_predictor import UpliftPredictor

router = APIRouter()


@router.post("/uplift/predict")
def predict_uplift(request: UpliftPredictRequest):
    try:
        return UpliftPredictor.predict(request)
    except FileNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(error),
        )
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(error),
        )
