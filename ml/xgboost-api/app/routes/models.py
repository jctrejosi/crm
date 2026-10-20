from fastapi import APIRouter, HTTPException, status

from app.schemas.model import (
    ModelDetailResponse,
    ModelInfo,
    ModelListResponse,
)
from app.services.model_registry import ModelRegistry

router = APIRouter()


def _to_model_info(model: dict) -> ModelInfo:
    """Normaliza metadatos de clasificación (created_at/metrics) y de series."""
    return ModelInfo(
        model_name=model["model_name"],
        target_column=model.get("target_column"),
        trained_at=model.get("trained_at") or model.get("created_at"),
        records=model.get("records"),
        features=model.get("features"),
        lags=model.get("lags"),
        test_size=model.get("test_size"),
        mae=model.get("mae"),
        rmse=model.get("rmse"),
        r2=model.get("r2"),
        feature_columns=model.get("feature_columns"),
        problem_type=model.get("problem_type"),
        metrics=model.get("metrics"),
    )


@router.get("/models", response_model=ModelListResponse)
def list_models():
    models = ModelRegistry.list_models()
    parsed_models = [_to_model_info(model) for model in models]

    return ModelListResponse(
        count=len(parsed_models),
        models=parsed_models
    )


@router.get("/models/{model_name}", response_model=ModelDetailResponse)
def get_model(model_name: str):
    try:
        model = ModelRegistry.get_model(model_name)
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No existe el modelo '{model_name}'"
        )

    return ModelDetailResponse(
        status="success",
        model=_to_model_info(model)
    )


@router.delete("/models/{model_name}")
def delete_model(model_name: str):
    deleted = ModelRegistry.delete_model(model_name)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No existe el modelo '{model_name}'"
        )

    return {
        "status": "success",
        "message": f"Modelo '{model_name}' eliminado correctamente"
    }
