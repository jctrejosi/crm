from fastapi import APIRouter, Depends, HTTPException, status

from app.core.security import verify_admin_key
from app.services.model_registry import ModelRegistry
from app.services.model_store import ModelStore

router = APIRouter()


@router.delete("/admin/clear_all_models", dependencies=[Depends(verify_admin_key)])
def clear_all_models():
    deleted_models = []

    for model_name in ModelStore.list_models():
        try:
            if ModelStore.delete_model(model_name):
                deleted_models.append(model_name)
        except Exception:
            continue

    return {
        "status": "success",
        "message": "Limpieza completa realizada con éxito.",
        "deleted_models": deleted_models
    }


@router.get("/admin/system_info", dependencies=[Depends(verify_admin_key)])
def system_info():
    models = ModelRegistry.list_models()

    return {
        "status": "success",
        "models_count": len(models),
        "models": [model.get("model_name") for model in models]
    }