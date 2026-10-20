# `docker/` — despliegue del CRM en un contenedor de aplicación

Imagen única con **backend NestJS + ia-service + servicios de ML + panel web +
Caddy**, más las dos bases Postgres del CRM en la red interna.

**Los puertos publicados son PROPIOS y solo en loopback** (nada «genérico» que
pueda chocar con IIS u otros servicios); el único que publica `80`/`443` es el
**edge compartido** (`../ecommerce/docker/edge/`), que termina TLS para todos los
dominios y reenvía a cada proyecto por la red `shared_edge`.

| Proceso | Escucha en | Publicado | Internet |
|---|---|---|---|
| Backend NestJS | `127.0.0.1:3100` | ❌ | ❌ |
| ia-service FastAPI | `127.0.0.1:8002` | ❌ | ❌ (lo llama el backend) |
| clustering-api | `127.0.0.1:8010` | ❌ | ❌ (lo llama el backend) |
| xgboost-api | `127.0.0.1:8011` | ❌ | ❌ (lo llama el backend) |
| uplift-api | `127.0.0.1:8012` | ❌ | ❌ (lo llama el backend) |
| Caddy interno (proxy + panel) | `:8080` / `:8443` | `127.0.0.1:30280` / `127.0.0.1:30281` | ❌ (lo alcanza el edge) |
| Postgres `crm` | red `crm_internal` | `127.0.0.1:5437` | ❌ |
| Postgres `analytics` | red `crm_internal` | `127.0.0.1:5436` | ❌ |
| **Edge compartido** (otro contenedor) | `:80` / `:443` | `80` / `443` | ✅ **único** |

📖 **Guía completa (DNS, firewall, Windows Server, edge y verificación):
[`docs/RUNBOOK-EXPOSICION.md`](../docs/RUNBOOK-EXPOSICION.md)**
🔐 **Modelo de seguridad: [`docs/SECURITY.md`](../docs/SECURITY.md)**

## Rápido

```bash
cp docker/.env.example docker/.env    # dominios, contraseña del panel, secretos
chmod 600 docker/.env

docker compose -f docker/docker-compose.yml build \
  --build-arg VITE_API_URL=https://crm-api.tudominio.com

docker compose -f docker/docker-compose.yml up -d
docker compose -f docker/docker-compose.yml logs -f crm-app

# Edge compartido (publica 80/443 y hace TLS; requiere los dominios en el DNS)
cd ../ecommerce/docker/edge && docker compose up -d
```

> Alternativa más simple: `node prod.js` (lee `prod.config.json`, sincroniza
> `docker/.env` según el modo `edge`/`direct`, imprime los registros DNS y
> construye/levanta). `node prod.js --dns` muestra solo lo que hay que
> configurar en GoDaddy.

## Archivos

| Archivo | Rol |
|---|---|
| `Dockerfile` | Multi-stage: backend + panel (Vite) + ia-service + 3 venvs de ML → runtime con Node, Python y Caddy. |
| `entrypoint.sh` | Arranca backend/ia-service/clustering/xgboost/uplift (127.0.0.1) y Caddy + genera el Caddyfile. Fail-closed sin `JWT_SECRET` ni contraseña del panel. |
| `gen-caddyfile.mjs` | Vhosts por dominio, cabeceras de seguridad, HSTS y Basic Auth del panel. En modo edge fija `X-Forwarded-Proto` y confía en el edge. |
| `docker-compose.yml` | Aplicación + 2 Postgres, redes `edge`/`internal`/`shared_edge`, volúmenes, `cap_drop`, healthchecks. |
| `.env.example` | Dominios (`HOST_*`), contraseña del panel, secretos, BD, DeepSeek y ML. |

## Seguridad (resumen)

- Solo el edge publica `80`/`443`; este contenedor publica `127.0.0.1:30280/30281` (loopback) y `3100`/`8002` escuchan en `127.0.0.1` dentro del contenedor.
- **El contenedor no corre como root** (usuario `crm`); Caddy escucha en `8080`/`8443`.
- BDs en la red `crm_internal` (`internal: true`); sus puertos se publican solo en `127.0.0.1`.
- TLS Let's Encrypt en el edge (HSTS) + cabeceras en cada contenedor: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Cross-Origin-Opener-Policy`, `Permissions-Policy`, `Content-Security-Policy`; se oculta `Server`.
- `PROTECT_WEB=true` **por defecto** (Basic Auth + fail-closed si falta la contraseña).
- **Rate limit** en `/auth/*` (backend, 15/60s por IP) y en `/generate|/interpret|/suggest-name` (ia-service, 20/60s); `TRUST_PROXY=loopback,uniquelocal` para resolver la IP real a través del edge.
- `TLS=false` exige `ALLOW_INSECURE=true`; `MAX_REQUEST_BODY` acota el cuerpo; API de admin de Caddy desactivada.
- Certificados persistentes y logs en volúmenes (`crm_caddy_data`, `crm_caddy_config`, `crm_app_logs`).
- **Modelos ML** horneados en la imagen y persistidos en volúmenes
  (`crm_ml_clustering_models`, `crm_ml_xgboost_models`, `crm_ml_uplift_models`).
- Contenedor con `no-new-privileges` y `cap_drop: ALL`, rotación de logs de Docker.

> Cambiar un dominio no requiere rebuild (edita `docker/.env` y `up -d`).
> Cambiar `VITE_API_URL` **sí** requiere rebuild (va horneado en el panel).
