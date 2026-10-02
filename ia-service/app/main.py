"""IA Service — API de generación de contenido para campañas de Mercaldas.

POST /generate  → recomienda el contenido (whatsapp / email / sms) usando
                  DeepSeek con function calling (ver app/tools.py).
POST /interpret → explica con IA por qué se seleccionó un público (segmentación).
GET  /health    → estado del servicio.
"""
import logging

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import config, deepseek

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

app = FastAPI(
    title="Mercaldas IA Service",
    description="Recomendación de contenido de campañas con DeepSeek function calling.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Producto(BaseModel):
    nombre: str = "producto"
    precio: float | None = None
    descuento: float | None = None


class GenerateRequest(BaseModel):
    producto: Producto = Field(default_factory=Producto)
    productos: list[Producto] = Field(default_factory=list)
    prompt: str = ""
    tono: str = "cercano"
    canales: list[str] = Field(default_factory=lambda: ["whatsapp", "email", "sms"])


class InterpretRequest(BaseModel):
    """Contexto numérico de una segmentación para explicarla con IA."""

    modo: str = "multi"
    productos: list[str] = Field(default_factory=list)
    categorias: list[str] = Field(default_factory=list)
    mejor_segmento: int | None = None
    ranking: list[dict] = Field(
        default_factory=list,
        description="[{segmento, total, compradores, afinidad}] por segmento",
    )
    segmento_total: int | None = None
    total_seleccionados: int | None = None
    compradores_afinidad: int | None = None
    features: list[str] = Field(default_factory=list)
    fallback: bool = False
    nota: str = ""
    promedio_propension: float | None = None
    promedio_uplift: float | None = None


class SuggestNameRequest(BaseModel):
    """Contexto de productos para sugerir un nombre de campaña."""

    productos: list[Producto] = Field(default_factory=list)
    prompt: str = ""


@app.post("/interpret")
async def interpret(req: InterpretRequest):
    """Explica con IA por qué se seleccionó ese público objetivo."""
    if not config.DEEPSEEK_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="DEEPSEEK_API_KEY no está configurada en el servicio ia-service",
        )
    try:
        return await deepseek.interpretar_segmentacion(req.model_dump())
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(
            status_code=502,
            detail=f"Error interpretando la segmentación: {e}",
        )


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "model": config.DEEPSEEK_MODEL,
        "api_key_configured": bool(config.DEEPSEEK_API_KEY),
    }


@app.post("/generate")
async def generate(req: GenerateRequest):
    canales = [c for c in req.canales if c in ("whatsapp", "email", "sms")]
    if not canales:
        raise HTTPException(
            status_code=400,
            detail="Indica al menos un canal válido: whatsapp, email o sms",
        )
    if not config.DEEPSEEK_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="DEEPSEEK_API_KEY no está configurada en el servicio ia-service",
        )

    resultado = await deepseek.generar_contenido(
        producto=req.producto.model_dump(),
        productos=[p.model_dump() for p in req.productos],
        prompt=req.prompt,
        tono=req.tono,
        canales=canales,
    )
    return resultado


@app.post("/suggest-name")
async def suggest_name(req: SuggestNameRequest):
    """Sugiere un nombre corto de campaña a partir de los productos."""
    if not config.DEEPSEEK_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="DEEPSEEK_API_KEY no está configurada en el servicio ia-service",
        )
    try:
        return await deepseek.sugerir_nombre(
            productos=[p.model_dump() for p in req.productos],
            prompt=req.prompt,
        )
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(
            status_code=502,
            detail=f"Error sugiriendo el nombre de la campaña: {e}",
        )
