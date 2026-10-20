from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class SegmentForProductsRequest(BaseModel):
    """Elige el mejor segmento para una campaña según sus productos."""

    model_name: str = Field(..., min_length=1)

    products: List[str] = Field(
        ...,
        min_length=1,
        description=(
            "Identificadores de producto (articulo_cod / external_id del "
            "ecommerce) seleccionados en la campaña"
        )
    )

    auto_fit: bool = Field(
        True,
        description=(
            "Si el modelo no existe, entrenarlo con la vista RFM de la réplica "
            "(equivalente a /fit-from-db)"
        )
    )

    limit: Optional[int] = Field(
        None,
        ge=1,
        description="Máximo de ids a devolver del mejor segmento"
    )

    stream: bool = Field(
        False,
        description=(
            "Si es true, responde como SSE (text/event-stream) con eventos de "
            "progreso por etapa y el resultado final"
        )
    )

    mode: Literal["multi", "bundle"] = Field(
        "multi",
        description=(
            "multi: unión (clientes que compraron cualquiera de los productos). "
            "bundle: co-compra (clientes que compraron todos juntos en la misma factura)."
        )
    )
