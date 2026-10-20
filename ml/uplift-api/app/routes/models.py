from fastapi import APIRouter, HTTPException, status

from app.services.model_registry import ModelRegistry
from app.services.model_store import ModelStore

router = APIRouter()


@router.get("/uplift/models")
def list_models():
    return {
        "status": "success",
        "models": ModelRegistry.list_models(),
    }


@router.get("/uplift/models/{model_name}")
def get_model(model_name: str):
    try:
        return ModelStore.load_metadata(model_name)
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"El modelo '{model_name}' no existe",
        )


@router.delete("/uplift/models/{model_name}")
def delete_model(model_name: str):
    if not ModelStore.delete_model(model_name):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"El modelo '{model_name}' no existe",
        )
    return {
        "status": "success",
        "message": f"Modelo '{model_name}' eliminado",
        "deleted_models": [model_name],
    }
