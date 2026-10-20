from fastapi import APIRouter, Depends, HTTPException, status

from app.core.security import verify_admin_key
from app.schemas.assign import AssignFromDbRequest, AssignRequest
from app.services.assigner import Assigner
from app.services.db import DatabaseError, read_features
from app.services.model_store import ModelStore

router = APIRouter()


@router.post("/assign")
def assign_points(request: AssignRequest):
    try:
        return Assigner.assign(request)
    except FileNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e)
        )


@router.post(
    "/assign-from-db",
    dependencies=[Depends(verify_admin_key)]
)
def assign_points_from_db(request: AssignFromDbRequest):
    """Asigna labels leyendo las features directamente desde la réplica Postgres."""
    try:
        ids, feature_names, X = read_features(
            request.query, request.id_column, request.limit
        )

        metadata = ModelStore.load_metadata(request.model_name)
        expected = metadata.get("feature_names")
        if expected is None:
            raise ValueError(
                f"el modelo '{request.model_name}' se entrenó sin nombres de "
                "features; re-entrénalo con /fit-from-db o usa /assign con JSON"
            )
        if feature_names != expected:
            raise ValueError(
                f"las features de la consulta no coinciden con el modelo: "
                f"esperaba {expected}, recibió {feature_names}"
            )

        result = Assigner.assign_matrix(
            request.model_name, X, request.with_distances
        )
        labels = result["labels"]
        distances = result.get("distances")

        if request.label is not None:
            keep = [i for i, lab in enumerate(labels) if lab == request.label]
            ids = [ids[i] for i in keep]
            labels = [labels[i] for i in keep]
            if distances is not None:
                distances = [distances[i] for i in keep]

        return {
            "model_name": request.model_name,
            "total": len(ids),
            "ids": ids,
            "labels": labels,
            "distances": distances,
        }
    except FileNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
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
