from fastapi import APIRouter

from app.schemas.predict import (
    PredictRequest
)

from app.services.predictor import (
    Predictor
)

from app.services.data import (
    DataService
)

router = APIRouter()


@router.post("/predict")
def predict(
    request: PredictRequest
):

    df = DataService.records_to_dataframe(
        request.data
    )

    predictions = (
        Predictor.predict_future(
            model_name=request.model_name,
            df=df,
            points=request.points
        )
    )

    return {
        "status": "success",
        "model_name": request.model_name,
        "predictions": predictions
    }