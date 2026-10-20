import json
import threading
from queue import Queue

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse

from app.core.security import verify_admin_key
from app.schemas.segment import SegmentForProductsRequest
from app.services.db import DatabaseError
from app.services.segmenter import segment_for_products

router = APIRouter()


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _segment_stream(request: SegmentForProductsRequest):
    """SSE con las etapas del proceso y el resultado final."""
    q: Queue = Queue()

    def emit(stage: str, message: str, progress: int) -> None:
        q.put(("stage", {"stage": stage, "message": message, "progress": progress}))

    def worker() -> None:
        try:
            result = segment_for_products(
                request.model_name,
                request.products,
                auto_fit=request.auto_fit,
                limit=request.limit,
                progress=emit,
                mode=request.mode,
            )
            q.put(("result", result))
        except Exception as e:
            q.put(("error", {"detail": str(e)}))

    threading.Thread(target=worker, daemon=True).start()

    yield _sse({"stage": "start", "message": "Iniciando segmentación…", "progress": 2})
    while True:
        kind, payload = q.get()
        if kind == "stage":
            yield _sse(payload)
        elif kind == "result":
            yield _sse({"stage": "done", "progress": 100, "result": payload})
            break
        else:
            yield _sse({"stage": "error", "error": payload.get("detail", "error")})
            break


@router.post(
    "/segment-for-products",
    dependencies=[Depends(verify_admin_key)],
)
def get_segment_for_products(request: SegmentForProductsRequest):
    """Elige el mejor segmento para una campaña según sus productos.

    Entrena el modelo si no existe (auto_fit) y devuelve el segmento con más
    afinidad + sus clientes (ids = cédula/NIT). Con `stream: true` responde
    como SSE con el progreso por etapas y el resultado final.
    """
    if request.stream:
        return StreamingResponse(
            _segment_stream(request),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )
    try:
        return segment_for_products(
            request.model_name,
            request.products,
            auto_fit=request.auto_fit,
            limit=request.limit,
            mode=request.mode,
        )
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
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error en la segmentación: {e}"
        )
