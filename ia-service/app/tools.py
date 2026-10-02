"""Herramientas (function calling) del servicio ia-service.

Tres funciones de recomendación de contenido de campañas:
  1. recomendar_whatsapp → mensaje de WhatsApp
  2. recomendar_email   → asunto + bloques del diseñador drag & drop (EmailEditor)
                          + HTML final listo para enviar
  3. recomendar_sms     → SMS (≤160 caracteres)

Los handlers validan lo que escribe el modelo y lo guardan en ctx["payload"]
para que /generate lo devuelva al backend.
"""
import re
import time

TIPOS_BLOQUE_VALIDOS = {"text", "image", "button", "divider", "columns", "social"}

# Los SMS con enlaces/URLs son rechazados por el proveedor (filtro anti-spam):
# se detecta el patrón para que el modelo reescriba el mensaje sin el enlace.
_URL_RE = re.compile(
    r"(https?://|www\.|\b[a-z0-9-]+\.(?:com|co|net|org|shop|edu|gov|io|app)\b)",
    re.IGNORECASE,
)


async def _payload(ctx: dict) -> dict:
    return ctx.setdefault("payload", {})


# ─── 1. WhatsApp ────────────────────────────────────────────────

async def recomendar_whatsapp(args: dict, ctx: dict) -> dict:
    """Recomienda el mensaje de WhatsApp de la campaña."""
    mensaje = str(args.get("mensaje") or "").strip()
    if not mensaje:
        return {
            "ok": False,
            "mensaje": "Escribe el mensaje completo de WhatsApp en el campo 'mensaje'.",
        }
    if len(mensaje) > 1500:
        mensaje = mensaje[:1500]
    (await _payload(ctx)).setdefault("whatsapp", mensaje)
    return {
        "ok": True,
        "whatsapp": mensaje,
        "caracteres": len(mensaje),
        "mensaje": "Mensaje de WhatsApp listo. No vuelvas a llamar esta función.",
    }


# ─── 2. Email (bloques del diseñador drag & drop) ────────────────

def _normalizar_bloque(b: dict, i: int) -> dict | None:
    """Valida/normaliza un bloque del diseñador de correos."""
    if not isinstance(b, dict):
        return None
    tipo = str(b.get("tipo") or b.get("type") or "").lower()
    if tipo not in TIPOS_BLOQUE_VALIDOS:
        return None
    props = b.get("props") if isinstance(b.get("props"), dict) else {}
    bid = str(b.get("id") or "").strip() or f"b{i}-{int(time.time() * 1000)}"
    return {"id": bid, "type": tipo, "props": props}


def _esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def blocks_to_html(bloques: list[dict]) -> str:
    """Genera HTML compatible con clientes de correo a partir de los bloques."""
    rows: list[str] = []
    for b in bloques:
        p = b.get("props") or {}
        t = b.get("type")
        if t == "text":
            html = str(p.get("text") or "").replace("\n", "<br/>")
            rows.append(
                f'<tr><td style="padding:12px 24px;"><div style="font-size:{p.get("fontSize", 15)}px;'
                f'color:{p.get("color", "#1F2937")};text-align:{p.get("align", "left")};'
                f'font-weight:{700 if p.get("bold") else 400};line-height:1.6;">{html}</div></td></tr>'
            )
        elif t == "image":
            src = str(p.get("src") or "")
            if src:
                rows.append(
                    f'<tr><td style="padding:12px 24px;text-align:center;"><img src="{_esc(src)}" '
                    f'style="max-width:100%;border-radius:{p.get("borderRadius", 8)}px;" /></td></tr>'
                )
        elif t == "button":
            rows.append(
                f'<tr><td style="padding:12px 24px;text-align:{p.get("align", "center")};">'
                f'<a href="{_esc(str(p.get("link") or "#"))}" style="display:inline-block;'
                f'background:{p.get("bg", "#FBBF24")};color:{p.get("color", "#78350F")};'
                f'font-size:14px;font-weight:700;padding:12px 28px;border-radius:{p.get("radius", 10)}px;'
                f'text-decoration:none;">{_esc(str(p.get("text") or ""))}</a></td></tr>'
            )
        elif t == "divider":
            rows.append(
                f'<tr><td style="padding:12px 24px;"><div style="border-top:{p.get("thickness", 2)}px '
                f'{p.get("dividerStyle", "solid")} {p.get("dividerColor", "#E5E7EB")};"></div></td></tr>'
            )
        elif t == "columns":
            items = (p.get("items") or [])[: p.get("columns", 2)]
            cols = "".join(
                f'<td valign="top" style="padding:8px;text-align:center;">'
                f'<div style="font-size:13px;color:#374151;line-height:1.5;">{_esc(str(c.get("text") or "")).replace(chr(10), "<br/>")}</div></td>'
                for c in items
            )
            rows.append(
                f'<tr><td style="padding:12px 24px;"><table role="presentation" width="100%" '
                f'cellpadding="0" cellspacing="0"><tr>{cols}</tr></table></td></tr>'
            )
        elif t == "social":
            nets = [(k, v) for k, v in (p.get("networks") or {}).items() if v]
            glyphs = {"facebook": "f", "instagram": "IG", "whatsapp": "WA", "youtube": "YT"}
            links = "".join(
                f'<a href="{_esc(str(v))}" style="display:inline-block;width:34px;height:34px;'
                f'line-height:34px;margin:0 4px;border-radius:50%;background:#F3F4F6;'
                f'color:{p.get("iconColor", "#6B7280")};font-weight:700;text-decoration:none;">'
                f'{glyphs.get(k, k)}</a>'
                for k, v in nets
            )
            rows.append(f'<tr><td style="padding:12px 24px;text-align:{p.get("align", "center")};">{links}</td></tr>')
    inner = "".join(rows)
    return (
        '<!DOCTYPE html><html><body style="margin:0;background:#F3F4F6;padding:24px 0;font-family:Arial,sans-serif;">'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">'
        f'<table role="presentation" width="600" cellpadding="0" cellspacing="0" '
        f'style="background:#ffffff;border-radius:12px;overflow:hidden;">{inner}</table>'
        "</td></tr></table></body></html>"
    )


async def recomendar_email(args: dict, ctx: dict) -> dict:
    """Recomienda el correo: asunto + bloques del diseñador + HTML."""
    asunto = str(args.get("asunto") or "").strip()
    bloques_raw = args.get("bloques") or []
    if not isinstance(bloques_raw, list):
        bloques_raw = []

    bloques: list[dict] = []
    for i, b in enumerate(bloques_raw):
        nb = _normalizar_bloque(b, i)
        if nb:
            bloques.append(nb)

    if not bloques:
        return {
            "ok": False,
            "mensaje": (
                "Debes escribir los 'bloques' del correo como arreglo JSON "
                "con los tipos text/image/button/divider/columns/social y sus props."
            ),
        }

    html = blocks_to_html(bloques)
    email = {"asunto": asunto or "Oferta especial Mercaldas", "bloques": bloques, "html": html}
    (await _payload(ctx))["email"] = email
    return {
        "ok": True,
        "asunto": email["asunto"],
        "bloques": len(bloques),
        "mensaje": "Correo listo (bloques validados y HTML generado). No vuelvas a llamar esta función.",
    }


# ─── 3. SMS ─────────────────────────────────────────────────────

async def recomendar_sms(args: dict, ctx: dict) -> dict:
    """Recomienda el SMS de la campaña (≤160 caracteres)."""
    mensaje = str(args.get("mensaje") or "").strip()
    if not mensaje:
        return {
            "ok": False,
            "mensaje": "Escribe el SMS en el campo 'mensaje' (máximo 160 caracteres).",
        }
    if len(mensaje) > 160:
        return {
            "ok": False,
            "caracteres": len(mensaje),
            "mensaje": (
                f"El SMS tiene {len(mensaje)} caracteres (límite 160). "
                "Acórtalo y vuelve a llamar la función."
            ),
        }
    if _URL_RE.search(mensaje):
        return {
            "ok": False,
            "mensaje": (
                "Los SMS con enlaces/URLs son bloqueados por el proveedor. "
                "Reescribe el mensaje SIN enlaces (p. ej. invita a buscar la "
                "promo en la app o en la tienda) y vuelve a llamar la función."
            ),
        }
    (await _payload(ctx)).setdefault("sms", mensaje)
    return {
        "ok": True,
        "sms": mensaje,
        "caracteres": len(mensaje),
        "mensaje": "SMS listo. No vuelvas a llamar esta función.",
    }


# ─── Definiciones para DeepSeek ─────────────────────────────────

SCHEMA_BLOQUES = (
    'Estructura de cada bloque del correo: {"id": "b1", "type": "<tipo>", "props": {...}}. '
    "Tipos disponibles y sus props:\n"
    '- "text": {"text": "texto (puede incluir {{nombre}}, {{producto}}, {{precio}}, {{descuento}}, {{cupon}})", "fontSize": 15, "color": "#1F2937", "align": "left|center|right", "bold": false}\n'
    '- "image": {"src": "https://...", "width": 100, "borderRadius": 12, "shadow": true, "link": ""}\n'
    '- "button": {"text": "CTA", "link": "https://...", "bg": "#FBBF24", "color": "#78350F", "radius": 10, "align": "center"}\n'
    '- "divider": {"thickness": 2, "dividerColor": "#E5E7EB", "dividerStyle": "solid"}\n'
    '- "columns": {"columns": 2, "items": [{"text": "...", "src": "https://..."}, ...]} (2 o 3 columnas)\n'
    '- "social": {"networks": {"facebook": "https://...", "instagram": "https://...", "whatsapp": "https://...", "youtube": ""}, "iconColor": "#6B7280", "align": "center"}'
)

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "recomendar_whatsapp",
            "description": (
                "Genera la recomendación del MENSAJE DE WHATSAPP de la campaña. "
                "Escribe un mensaje corto, cálido y con CTA, en español, usando el "
                "nombre del producto, el precio y el descuento. Puedes incluir "
                "emojis y las variables {{nombre}}, {{producto}}, {{precio}}, "
                "{{descuento}} y {{cupon}}."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "mensaje": {
                        "type": "string",
                        "description": "El mensaje completo de WhatsApp listo para enviar.",
                    },
                },
                "required": ["mensaje"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "recomendar_email",
            "description": (
                "Genera la recomendación del CORREO de la campaña con el módulo de "
                "diseño drag & drop del admin: escribe el asunto y los bloques del "
                "correo (texto, imagen, botón, divisor, columnas, social). "
                "Usa una estructura profesional: encabezado (texto), cuerpo (texto), "
                "imagen del producto, botón CTA, divisor, redes y pie. "
                + SCHEMA_BLOQUES
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "asunto": {
                        "type": "string",
                        "description": "Asunto del correo (atractivo, máximo 60 caracteres).",
                    },
                    "bloques": {
                        "type": "array",
                        "description": "Bloques del correo en el esquema del diseñador.",
                        "items": {"type": "object"},
                    },
                },
                "required": ["asunto", "bloques"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "recomendar_sms",
            "description": (
                "Genera la recomendación del SMS de la campaña: máximo 160 caracteres, "
                "directo, con el producto y el precio/descuento. SIN enlaces ni URLs "
                "(el proveedor los bloquea)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "mensaje": {
                        "type": "string",
                        "description": "El SMS completo (máximo 160 caracteres).",
                    },
                },
                "required": ["mensaje"],
            },
        },
    },
]

FUNCTION_MAP = {
    "recomendar_whatsapp": recomendar_whatsapp,
    "recomendar_email": recomendar_email,
    "recomendar_sms": recomendar_sms,
}
