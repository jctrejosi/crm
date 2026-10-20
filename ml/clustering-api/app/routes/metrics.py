from fastapi import APIRouter, HTTPException, status

from app.services.model_store import ModelStore

router = APIRouter()


@router.get("/metrics/{model_name}")
def get_metrics(model_name: str):
    try:
        metadata = ModelStore.load_metadata(model_name)
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"El modelo '{model_name}' no existe"
        )
    return {
        "model_name": model_name,
        "metrics": metadata.get("metrics", {})
    }
