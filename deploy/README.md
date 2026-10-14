# Despliegue del CRM — un único contenedor global

Todo el CRM vive en **un solo contenedor** y **solo se publica la interface web**.
El resto (bases de datos, backend y ia-service) queda **interno**, y el backend se
alcanza a través de un **proxy reverso Caddy**.

```
┌─────────────────────── crm-app (un contenedor) ───────────────────────┐
│                                                                       │
│   navegador ──HTTP(:80)──▶ Caddy                                       │
│                              ├─ /api/*  ─(quita /api)─▶ backend :3100   │
│                              └─ /*       ─▶ SPA estática                │
│                                                                       │
│   backend :3100 ──┐                                                    │
│                   ├─▶ Postgres+PostGIS :5432  (bases `crm`,`analytics`)│
│   ia-service :8002                                                    │
│        ▲                                                              │
│        └── IA_SERVICE_URL (interno, no expuesto)                      │
└───────────────────────────────────────────────────────────────────────┘
        ▲
        └── ÚNICO puerto publicado: ${WEB_PORT:-8080} → :80
```

## Qué se expone

| Componente | Escucha en | ¿Publicado al host? |
|---|---|---|
| **web (Caddy, SPA + proxy)** | `:80` | ✅ `http://localhost:${WEB_PORT:-8080}` |
| backend (NestJS) | `127.0.0.1:3100` | ❌ No |
| ia-service (FastAPI) | `127.0.0.1:8002` | ❌ No |
| Postgres+PostGIS (`crm`, `analytics`) | `127.0.0.1:5432` | ❌ No |

La web se compila con `VITE_API_URL=/api`: todas las llamadas van al **mismo
origen** y Caddy las reenvía al backend local (`handle_path /api/*`).

## Archivos

- `Dockerfile` — imagen multi-stage: compila la web (Vite) y el backend (Nest),
  y en el runtime parte de `postgres:16-bookworm` + `postgis` e instala
  Python (ia) y los binarios de Node y Caddy.
- `Caddyfile` — sirve la SPA y hace de proxy reverso `handle_path /api/*`.
- `entrypoint.sh` — inicializa Postgres, crea `crm` y `analytics`, aplica las
  extensiones (`init-operational.sql`) y el DDL de analytics (`schema.sql`), y
  arranca backend + ia + Caddy.
- `../docker-compose.deploy.yml` — un único servicio `app` (DBs incluidas).

## Uso

```bash
# 1. Libera el entorno de desarrollo (BDs/puertos) si está arriba
node dev.js --stop

# 2. Construye y levanta (la primera vez tarda: build + initdb)
docker compose -f docker-compose.deploy.yml up -d --build

# → web: http://localhost:8080
```

Variables de entorno (opcionales, con default):

| Variable | Default | Para qué |
|---|---|---|
| `WEB_PORT` | `8080` | Puerto del host que publica la web |
| `JWT_SECRET` | `cambia-este-secreto` | **Cámbialo** en producción |
| `PUBLIC_ORIGIN` | `http://localhost:8080` | `CORS_ORIGIN` del backend |
| `IA_SERVICE_DEEPSEEK_API_KEY` | *(vacío)* | Para `/generate` y `/interpret` |
| `RESTORE_ANALYTICS` | `0` | `1` → restaura la réplica desde `./db/backups` en el **primer** arranque |
| `SEED_ADMIN_EMAIL` + `SEED_ADMIN_PASSWORD` | *(vacio)* | Crea un usuario admin en el primer arranque (login listo) |
| `SEED_ADMIN_USERNAME` | `admin` | Username del admin sembrado |

Ejemplo:

```bash
WEB_PORT=80 JWT_SECRET=... PUBLIC_ORIGIN=http://crm.example.com \
  docker compose -f docker-compose.deploy.yml up -d --build
```

## Bases de datos (dentro del contenedor)

- Un único servidor Postgres+PostGIS con **dos bases**: `crm` (operativa, con las
  extensiones) y `analytics` (réplica; se crea con el DDL vacío).
- Los datos persisten en el volumen **`crm_pgdata`**.
- El backend solo usa `crm` (la `analytics` la consume el ML externo, que hoy no
  está en este contenedor).
- Para cargar la **réplica real** de `analytics` en el primer arranque: deja
  `db/backups/` con las partes y pon `RESTORE_ANALYTICS=1`. Si no, `analytics`
  queda con el esquema vacío hasta que cargues datos.
- El **esquema de `crm`** se crea **automáticamente** en el primer arranque
  (SQL de drizzle generado en el build y aplicado por el entrypoint).
- Para cargar **datos** de `crm`: un `pg_dump` de una `crm` ya poblada, o
  `node dev.js --migrate` (+ `pnpm db:push`) en el repo (ver `../README.md`).
- Con `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` se crea un admin para entrar.
- La `analytics` (réplica) la consume el ML externo; el backend no la usa.

## Notas

- Se publica **un solo** puerto (la web). Nada más sale del contenedor.
- TLS: el contenedor sirve **HTTP**; pon TLS en el borde (o activa HTTPS en el
  `Caddyfile` con un dominio).
- Parar / borrar: `docker compose -f docker-compose.deploy.yml down`
  (los datos **no** se borran salvo `-v`).
- La imagen es grande (Postgres+PostGIS + Node + Python + Caddy); es el precio de
  tenerlo todo en un contenedor.
