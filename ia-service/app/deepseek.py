"""Cliente DeepSeek con loop de function calling para ia-service.

El modelo recibe el contexto de la campaña (producto, precio, descuento, tono,
prompt y canales solicitados) y debe llamar las herramientas correspondientes
(tools.TOOLS): recomendar_whatsapp, recomendar_email, recomendar_sms.
"""
import json
import logging

import httpx

from . import config, tools

log = logging.getLogger("ia-service.deepseek")

SYSTEM_PROMPT = """Eres el redactor de campañas de marketing de Mercaldas, un supermercado en línea.

Tu trabajo: generar contenido de ALTA CONVERSIÓN en español para los canales que te indique el usuario.

REGLAS:
1. SOLO puedes entregar contenido a través de las funciones disponibles ({FUNCIONES}). Nunca inventes que realizaste una acción.
2. Para CADA canal solicitado debes llamar exactamente UNA vez a su función correspondiente.
3. El contenido debe usar los datos reales del producto (nombre, precio, descuento) que aparecen en el mensaje del usuario. NUNCA inventes precios ni descuentos.
4. Puedes usar variables de personalización: {{nombre}}, {{producto}}, {{precio}}, {{descuento}}, {{cupon}}.
5. WhatsApp: mensaje corto y cálido (máximo ~300 caracteres), con emojis y CTA claro.
6. Email: estructura profesional con bloques del diseñador (texto de encabezado, cuerpo, imagen del producto, botón CTA, divisor, redes sociales y pie). El asunto debe ser atractivo.
7. SMS: máximo 160 caracteres, directo y claro. NUNCA incluyas enlaces ni URLs (el proveedor de SMS los bloquea); invita a buscar la promo en la app o en la tienda.
8. Adapta el tono indicado (urgente, joven, profesional, emocional, exclusivo, cercano).
9. Si una llamada falla (resultado ok=false), corrige y vuelve a llamar la misma función.
10. No menciones herramientas, funciones ni términos técnicos en el contenido.
11. Si la campaña incluye VARIOS productos, menciónalos todos en el contenido (hasta 5, con sus precios); no inventes productos que no estén en la lista."""


async def _call_chat(messages: list[dict]) -> dict:
    """Una llamada a la API de DeepSeek. Devuelve el JSON de la respuesta."""
    if not config.DEEPSEEK_API_KEY:
        raise RuntimeError("DEEPSEEK_API_KEY no está configurada")

    body: dict = {
        "model": config.DEEPSEEK_MODEL,
        "messages": messages,
        "temperature": 0.7,
        "max_tokens": config.MAX_TOKENS,
        "tools": tools.TOOLS,
    }
    async with httpx.AsyncClient(
        headers={
            "Authorization": f"Bearer {config.DEEPSEEK_API_KEY}",
            "Content-Type": "application/json",
        },
        timeout=config.DEEPSEEK_TIMEOUT,
    ) as client:
        resp = await client.post(
            f"{config.DEEPSEEK_API_URL}/chat/completions",
            json=body,
        )
        resp.raise_for_status()
        return resp.json()


def _build_user_message(
    producto: dict,
    productos: list[dict],
    prompt: str,
    tono: str,
    canales: list[str],
) -> str:
    items = [
        p
        for p in (productos or [])
        if p and (p.get("nombre") or p.get("precio") is not None)
    ]
    if not items:
        items = [producto]

    partes: list[str] = []
    if len(items) == 1:
        p = items[0]
        nombre = p.get("nombre") or "producto"
        partes.append(f"Producto: {nombre}")
        precio = p.get("precio")
        descuento = p.get("descuento")
        if precio is not None:
            partes.append(
                f"Precio: ${precio:,.0f}"
                if isinstance(precio, (int, float))
                else f"Precio: {precio}"
            )
        if descuento is not None:
            partes.append(f"Descuento: {descuento}%")
    else:
        partes.append("Productos de la campaña (varios):")
        for i, p in enumerate(items, 1):
            nombre = p.get("nombre") or f"producto {i}"
            precio = p.get("precio")
            precio_str = (
                f"${precio:,.0f}"
                if isinstance(precio, (int, float))
                else (str(precio) if precio is not None else "")
            )
            partes.append(
                f"  {i}. {nombre}" + (f" — {precio_str}" if precio_str else "")
            )

    partes.append(f"Tono: {tono}")
    if prompt:
        partes.append(f"Objetivo/instrucciones del usuario: {prompt}")
    nombres = {
        "whatsapp": "recomendar_whatsapp",
        "email": "recomendar_email",
        "sms": "recomendar_sms",
    }
    partes.append(
        "Canales solicitados: "
        + ", ".join(canales)
        + ". Llama a "
        + ", ".join(nombres[c] for c in canales)
        + " (una vez por canal) para entregar el contenido."
    )
    return "\n".join(partes)


async def generar_contenido(
    producto: dict,
    productos: list[dict],
    prompt: str,
    tono: str,
    canales: list[str],
) -> dict:
    """Genera el contenido de la campaña con el loop de function calling.

    Devuelve un dict con las claves que el modelo haya llenado:
    `whatsapp` (str), `email` ({asunto, bloques, html}), `sms` (str).
    """
    ctx: dict = {"payload": {}}
    funciones_str = ", ".join(tools.FUNCTION_MAP.keys())
    messages: list[dict] = [
        {"role": "system", "content": SYSTEM_PROMPT.replace("{FUNCIONES}", funciones_str)},
        {
            "role": "user",
            "content": _build_user_message(producto, productos, prompt, tono, canales),
        },
    ]

    for _round in range(config.MAX_TOOL_ROUNDS):
        data = await _call_chat(messages)
        msg = data["choices"][0]["message"]
        tool_calls = msg.get("tool_calls") or []

        if not tool_calls:
            # El modelo terminó: devolvemos lo acumulado por las herramientas
            payload = ctx.get("payload") or {}
            if not payload:
                log.warning("ia-service: el modelo no produjo contenido")
                return {
                    "error": "El modelo no generó contenido. Reintenta o ajusta el prompt."
                }
            return payload

        messages.append(
            {
                "role": "assistant",
                "content": msg.get("content") or "",
                "tool_calls": tool_calls,
            }
        )
        for tc in tool_calls:
            fn = tc.get("function") or {}
            name = fn.get("name") or ""
            try:
                args = json.loads(fn.get("arguments") or "{}")
            except json.JSONDecodeError:
                args = {}
            handler = tools.FUNCTION_MAP.get(name)
            if handler is None:
                result = {
                    "ok": False,
                    "mensaje": f"La acción '{name}' no está disponible.",
                }
            else:
                try:
                    result = await handler(args, ctx)
                except Exception as exc:  # noqa: BLE001
                    log.exception("Error en herramienta %s", name)
                    result = {"ok": False, "mensaje": f"Error al ejecutar: {exc}"}
            log.info("tool %s -> %s", name, str(result)[:120])
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tc.get("id") or "",
                    "content": json.dumps(result, ensure_ascii=False),
                }
            )

    return {
        "error": "El modelo no terminó de generar el contenido en las rondas permitidas."
    }


# ─── Interpretación de la segmentación ────────────────────────────────

SYSTEM_PROMPT_INTERPRET = """Eres un analista de datos de marketing de Mercaldas, un supermercado en línea.

Te dan los RESULTADOS NUMÉRICOS de una segmentación de clientes y debes explicarlos en español, de forma clara y accionable, para un equipo de marketing (no técnico).

Estructura tu respuesta en 3 partes, cada una con su encabezado en negrita (sin usar tablas):
1. **Qué se evaluó** — qué datos y modelos se usaron: características RFM de cada cliente (frecuencia, monetario/gasto total, ticket promedio y categorías distintas), la afinidad de compra con los productos/categorías de la campaña, la propensión de compra (XGBoost) y la persuasibilidad (modelo de uplift).
2. **Resultados numéricos** — interpreta los números del ranking de segmentos (cuántos clientes tiene cada uno, cuántos compraron los productos/categorías y el % de afinidad) y explica por qué se eligió el segmento ganador.
3. **Por qué se seleccionaron estos clientes** — en lenguaje simple, qué caracteriza al segmento elegido y por qué es el público objetivo ideal para la campaña (productos y modo indicados).

REGLAS:
- Usa SIEMPRE los números reales que te dan. NUNCA inventes cifras ni nombres.
- Explica qué significan las métricas en lenguaje simple: la propensión promedio (probabilidad estimada de que compren si ven la campaña) y el uplift promedio (cuánto cambia esa probabilidad si reciben la campaña: si es NEGATIVO, no son persuasibles y comprarían igual; si es POSITIVO, la campaña puede inclinar su decisión).
- Si un dato falta (p. ej. propensión o uplift), no lo inventes: limítate a lo que tienes.
- Sé concreto y breve (máximo ~250 palabras). Usa viñetas cortas.
- No menciones términos internos ni claves de modelo."""


async def interpretar_segmentacion(contexto: dict) -> dict:
    """Explica con IA por qué se seleccionó un público de una segmentación.

    Recibe el contexto numérico de la segmentación y devuelve
    `{"explicacion": "..."}` en lenguaje natural.
    """
    if not config.DEEPSEEK_API_KEY:
        raise RuntimeError("DEEPSEEK_API_KEY no está configurada")

    user = json.dumps(contexto, ensure_ascii=False, indent=2)
    messages: list[dict] = [
        {"role": "system", "content": SYSTEM_PROMPT_INTERPRET},
        {"role": "user", "content": "Resultados de la segmentación:\n" + user},
    ]
    body: dict = {
        "model": config.DEEPSEEK_MODEL,
        "messages": messages,
        "temperature": 0.4,
        # El modelo razona antes de responder (reasoning_content): necesita
        # presupuesto suficiente para la respuesta final, si no queda vacía.
        "max_tokens": config.MAX_TOKENS,
    }
    try:
        async with httpx.AsyncClient(
            headers={
                "Authorization": f"Bearer {config.DEEPSEEK_API_KEY}",
                "Content-Type": "application/json",
            },
            timeout=config.DEEPSEEK_TIMEOUT,
        ) as client:
            resp = await client.post(
                f"{config.DEEPSEEK_API_URL}/chat/completions",
                json=body,
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:  # noqa: BLE001
        log.exception("interpretar_segmentacion: error llamando al modelo")
        return {"error": f"No se pudo contactar el modelo de IA: {exc}"}

    content = (data.get("choices") or [{}])[0].get("message", {}).get("content") or ""
    if not content.strip():
        return {"error": "El modelo no produjo una interpretación. Reintenta."}
    return {"explicacion": content.strip()}


# ─── Sugerencia de nombre de campaña ─────────────────────────────────

SYSTEM_PROMPT_NOMBRE = """Eres especialista en marketing de Mercaldas, un supermercado en línea.

Debes proponer UN nombre corto y atractivo para una campaña, en español, a partir de los productos (y opcionalmente la intención del usuario).

REGLAS:
- Devuelve SOLO el nombre: sin comillas, sin explicaciones, sin punto final, sin prefijos como "Nombre:".
- Máximo 60 caracteres.
- Claro y comercial (ejemplo: "Semana del café Colcafé", "Combo desayuno saludable").
- Puedes mencionar el producto principal o el beneficio de la campaña.
- No inventes marcas ni productos que no aparezcan en la lista."""


async def sugerir_nombre(productos: list[dict], prompt: str = "") -> dict:
    """Propone un nombre corto de campaña a partir de los productos.

    Devuelve `{"nombre": "..."}` o `{"error": "..."}`.
    """
    if not config.DEEPSEEK_API_KEY:
        raise RuntimeError("DEEPSEEK_API_KEY no está configurada")

    nombres = [
        str(p.get("nombre"))
        for p in (productos or [])
        if p and p.get("nombre")
    ]
    user = "Productos de la campaña: " + (", ".join(nombres) if nombres else "no especificados")
    if prompt.strip():
        user += f"\nIntención del usuario: {prompt.strip()}"
    user += "\nPropón el nombre de la campaña."

    body: dict = {
        "model": config.DEEPSEEK_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT_NOMBRE},
            {"role": "user", "content": user},
        ],
        "temperature": 0.8,
        # Igual que en /interpret: el modelo puede razonar antes de responder.
        "max_tokens": config.MAX_TOKENS,
    }
    try:
        async with httpx.AsyncClient(
            headers={
                "Authorization": f"Bearer {config.DEEPSEEK_API_KEY}",
                "Content-Type": "application/json",
            },
            timeout=config.DEEPSEEK_TIMEOUT,
        ) as client:
            resp = await client.post(
                f"{config.DEEPSEEK_API_URL}/chat/completions",
                json=body,
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:  # noqa: BLE001
        log.exception("sugerir_nombre: error llamando al modelo")
        return {"error": f"No se pudo contactar el modelo de IA: {exc}"}

    content = (data.get("choices") or [{}])[0].get("message", {}).get("content") or ""
    nombre = content.strip().strip('"').strip()
    if not nombre:
        return {"error": "El modelo no produjo un nombre. Reintenta."}
    return {"nombre": nombre[:80]}
