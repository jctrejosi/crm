"""Limitador de tasa en memoria (ventana fija) para el ia-service del CRM.

Motivo: `/generate`, `/interpret` y `/suggest-name` consumen crédito de la API de
DeepSeek, así que un cliente abusivo puede generar coste o saturar el servicio.
No depende de servicios externos (adecuado para una sola instancia).

En el despliegue en contenedor el ia-service solo escucha en 127.0.0.1 (lo llama
el backend, no el navegador), por eso `X-Forwarded-For` es fiable aquí para
identificar al cliente real si algún día se publica detrás de Caddy.

Variables de entorno:
- ``IA_RATE_LIMIT``   peticiones por IP y ventana (def. 20)
- ``IA_RATE_WINDOW``  segundos de la ventana        (def. 60)
"""

from __future__ import annotations

import os
import time
from collections.abc import Awaitable, Callable

from fastapi import Request, Response
from fastapi.responses import JSONResponse

# Rutas que gastan crédito de DeepSeek.
_PROTECTED_PREFIXES = ("/generate", "/interpret", "/suggest-name")


def _int_env(name: str, default: int) -> int:
    try:
        value = int(os.getenv(name) or default)
    except ValueError:
        return default
    return value if value > 0 else default


LIMIT = _int_env("IA_RATE_LIMIT", 20)
WINDOW = _int_env("IA_RATE_WINDOW", 60)

# ip -> (reset_at monotónico, peticiones contadas)
_buckets: dict[str, tuple[float, int]] = {}


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _cleanup(now: float) -> None:
    if len(_buckets) < 512:
        return
    for ip, (reset_at, _) in list(_buckets.items()):
        if reset_at <= now:
            _buckets.pop(ip, None)


async def rate_limit_middleware(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    path = request.url.path
    if request.method == "OPTIONS" or not path.startswith(_PROTECTED_PREFIXES):
        return await call_next(request)

    now = time.monotonic()
    _cleanup(now)
    ip = _client_ip(request)
    reset_at, count = _buckets.get(ip, (0.0, 0))

    if reset_at <= now:
        _buckets[ip] = (now + WINDOW, 1)
        return await call_next(request)

    if count >= LIMIT:
        retry_after = max(1, int(reset_at - now))
        return JSONResponse(
            status_code=429,
            content={"detail": "Demasiadas peticiones. Espera un momento e inténtalo de nuevo."},
            headers={"Retry-After": str(retry_after)},
        )

    _buckets[ip] = (reset_at, count + 1)
    return await call_next(request)
