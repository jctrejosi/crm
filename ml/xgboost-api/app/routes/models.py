from fastapi import APIRouter, HTTPException, status

from app.schemas.model import (
    ModelDetailResponse,
    ModelInfo,
    ModelListResponse,
)
from app.services.model_registry import ModelRegistry

router = APIRouter()


@router.get("/models", response_model=ModelListResponse)
def list_models():
    models = ModelRegistry.list_models()

    parsed_models = [
        ModelInfo(
            model_name=model["model_name"],
            target_column=model["target_column"],
            trained_at=model["trained_at"],
            records=model["records"],
            features=model["features"],
            lags=model["lags"],
            test_size=model["test_size"],
            mae=model["mae"],
            rmse=model["rmse"],
            r2=model["r2"],
            feature_columns=model.get("feature_columns"),
        )
        for model in models
    ]

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
        model=ModelInfo(
            model_name=model["model_name"],
            target_column=model["target_column"],
            trained_at=model["trained_at"],
            records=model["records"],
            features=model["features"],
            lags=model["lags"],
            test_size=model["test_size"],
            mae=model["mae"],
            rmse=model["rmse"],
            r2=model["r2"],
            feature_columns=model.get("feature_columns"),
        )
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