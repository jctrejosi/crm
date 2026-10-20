from fastapi import APIRouter, Depends, HTTPException, status

from app.core.security import verify_admin_key
from app.schemas.fit import FitFromDbRequest, FitRequest
from app.services.clusterer import Clusterer
from app.services.db import DatabaseError, read_features

router = APIRouter()


@router.post("/fit")
def fit_model(request: FitRequest):
    try:
        return Clusterer.fit(request)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error en el entrenamiento: {e}"
        )


@router.post(
    "/fit-from-db",
    dependencies=[Depends(verify_admin_key)]
)
def fit_model_from_db(request: FitFromDbRequest):
    """Entrena leyendo las features directamente desde la réplica Postgres."""
    try:
        _ids, feature_names, X = read_features(
            request.query, request.id_column, request.limit
        )
        return Clusterer.fit_matrix(
            request,
            X,
            feature_names=feature_names,
            id_column=request.id_column,
        )
    except DatabaseError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e)
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error en el entrenamiento: {e}"
        )
