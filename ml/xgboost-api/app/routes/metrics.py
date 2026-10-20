from fastapi import APIRouter, HTTPException, status

from app.schemas.metrics import MetricsResponse
from app.services.metrics import MetricsService

router = APIRouter()


@router.get("/metrics/{model_name}", response_model=MetricsResponse)
def get_metrics(model_name: str):
    try:
        return MetricsService.get_metrics(model_name)
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No existe el modelo '{model_name}'"
        )