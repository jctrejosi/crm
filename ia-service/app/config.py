# IA Service — generación de contenido de campañas (Mercaldas)

"""Configuración desde variables de entorno."""
import os

from dotenv import load_dotenv

load_dotenv()

# API key DEDICADA para el servicio ia-service (campañas). Si no se define,
# se usa DEEPSEEK_API_KEY como respaldo.
DEEPSEEK_API_KEY = os.getenv("IA_SERVICE_DEEPSEEK_API_KEY") or os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash")
DEEPSEEK_API_URL = os.getenv("DEEPSEEK_API_URL", "https://api.deepseek.com")
DEEPSEEK_TIMEOUT = float(os.getenv("DEEPSEEK_TIMEOUT", "60"))

PORT = int(os.getenv("IA_SERVICE_PORT", "8002"))
CORS_ORIGINS = [
    o.strip()
    for o in os.getenv("CORS_ORIGIN", "http://localhost:5173").split(",")
    if o.strip()
]

MAX_TOKENS = int(os.getenv("IA_SERVICE_MAX_TOKENS", "3000"))
MAX_TOOL_ROUNDS = int(os.getenv("IA_SERVICE_MAX_TOOL_ROUNDS", "6"))
