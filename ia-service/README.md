# Mercaldas IA Service — recomendación de contenido de campañas

Servicio **Python (FastAPI)** que genera el contenido de las campañas de
marketing con **DeepSeek function calling**. Lo consume el backend NestJS
(`POST /admin/campaigns/generate`) para el módulo de campañas del admin.

## Funciones (function calling)

| Función | Qué recomienda |
|---|---|
| `recomendar_whatsapp` | Mensaje de WhatsApp (corto, con CTA y variables) |
| `recomendar_email` | Correo: asunto + **bloques del diseñador drag & drop** (EmailEditor del admin) + HTML final |
| `recomendar_sms` | SMS de máximo 160 caracteres |

Los bloques del correo usan el mismo esquema que el diseñador del admin:
`{ id, type: text|image|button|divider|columns|social, props: {...} }`.

## API

- `POST /generate` — cuerpo:
  ```json
  {
    "producto": { "nombre": "Leche Alquería 1.1L", "precio": 4350, "descuento": 15 },
    "prompt": "lanza un descuento por lanzamiento",
    "tono": "urgente",
    "canales": ["whatsapp", "email", "sms"]
  }
  ```
  Respuesta: `{ "whatsapp": "...", "email": { "asunto", "bloques", "html" }, "sms": "..." }`
  (solo los canales solicitados).
- `GET /health` — estado del servicio.

## Desarrollo local

```bash
cd ia-service
cp .env.example .env   # pon IA_SERVICE_DEEPSEEK_API_KEY
./dev.sh               # http://localhost:8002 (docs en /docs)
```

## Despliegue (contenedor único con backend + bot)

El servicio corre como **tercer proceso** del contenedor (puerto interno
**8002**) y Caddy lo expone bajo el prefijo `/ia-service/*`. El backend lo llama
en `http://127.0.0.1:8002` (o vía `IA_SERVICE_URL` si está en otro host).
