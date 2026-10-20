# SECURITY — Especificación de seguridad del CRM (contenedor de aplicación)

Documento de referencia del **modelo de seguridad** del despliegue del CRM en
un contenedor de aplicación (`docker/`): qué se protege, cómo, con qué valores,
cómo verificarlo y **qué NO queda cubierto**.

> Ámbito: la imagen `docker/Dockerfile` (backend NestJS + ia-service FastAPI +
> servicios ML clustering/xgboost/uplift + panel web + Caddy) y su
> `docker-compose.yml` (que además levanta las dos Postgres en la red interna).
> El despliegue local (`dev.js`) queda fuera del ámbito: no está pensado para
> internet.

---

## 1. Superficie expuesta

Principio: **un solo proceso habla con internet (Caddy); nada más se publica.**

| Proceso | Escucha en | Publicado | Notas |
|---|---|---|---|
| **Edge compartido** (Caddy, otro contenedor) | `:80` / `:443` | **Sí** → internet | único punto de entrada; TLS Let's Encrypt |
| Caddy interno (proxy + panel) | `:8080` (HTTP) / `:8443` (HTTPS) | `127.0.0.1:30280` / `127.0.0.1:30281` | solo lo alcanza el edge (red `shared_edge`) |
| Backend NestJS | `127.0.0.1:3100` | ❌ | loopback dentro del contenedor |
| ia-service FastAPI | `127.0.0.1:8002` | ❌ | solo lo llama el backend |
| clustering / xgboost / uplift | `127.0.0.1:8010-8012` | ❌ | loopback; los llama el backend |
| Postgres `crm` | red `crm_internal` (`internal: true`) | ❌ (solo `127.0.0.1:5437` del host) | herramientas/ML locales |
| Postgres `analytics` | red `crm_internal` (`internal: true`) | ❌ (solo `127.0.0.1:5436` del host) | la leen los ML nativos |

- El contenedor **no corre como root**: usuario `crm` (uid/gid 10002). Por eso
  Caddy escucha en puertos altos.
- Cada proyecto usa **puertos propios** (CRM `30280/30281`, ecommerce `30180/30181`)
  publicados **solo en `127.0.0.1`**: no compiten con 80/443 ni con servicios
  «genéricos» (8080, 8443…).
- Redes: `crm_edge` (salida a internet y puertos publicados), `crm_internal`
  (**sin** ruta a internet) para las bases, y `shared_edge` (red compartida con
  el edge; no publicada).
- Los puertos de las bases se publican **bindeando a `127.0.0.1`**: sirven a
  herramientas del host, nunca a internet.
- Modo directo (un solo proyecto en el servidor): `PUBLIC_HTTP_PORT=80` /
  `PUBLIC_HTTPS_PORT=443` y `TLS=true`; entonces este contenedor es el punto de
  entrada (`RUNBOOK-EXPOSICION.md` §8).

## 2. Transporte y TLS

- **Let's Encrypt automático**: en el **edge** (modo edge) o en este Caddy
  cuando `TLS=true` (modo directo). Requiere que 80 y 443 lleguen al servidor y
  que el DNS apunte a él (el reto HTTP-01 se valida siempre en el puerto 80).
- **Certificados persistentes** en los volúmenes `crm_caddy_data` /
  `crm_caddy_config` (no se re-emiten en cada `up`).
- **HSTS**: `Strict-Transport-Security: max-age=31536000; includeSubDomains`.
- **`TLS=false` es fail-closed**: el contenedor **no arranca** salvo que se
  acepte explícitamente con `ALLOW_INSECURE=true` (y entonces avisa por stderr).
  Solo tiene sentido detrás de un edge que ya termina TLS (ver runbook §5);
  nunca para exponer directo.
- El correo ACME se configura con `ACME_EMAIL`.

## 3. Cabeceras de seguridad

Se aplican **en todos los vhosts** (panel, API y smoke-test), y se elimina la
cabecera `Server`:

| Cabecera | Valor |
|---|---|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` (solo con TLS) |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `SAMEORIGIN` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Cross-Origin-Opener-Policy` | `same-origin-allow-popups` |
| `Permissions-Policy` | `camera=(self), microphone=(self), geolocation=(self), payment=()` |
| `Content-Security-Policy` | política por defecto (abajo) |

**CSP por defecto** (`gen-caddyfile.mjs`) — más estricta que la del ecommerce
porque el panel es un build de Vite **sin scripts inline**:

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https:;
font-src 'self' data: https:;
connect-src 'self' https: wss:;
frame-src 'self';
object-src 'none';
base-uri 'self';
frame-ancestors 'self';
form-action 'self' https:
```

Notas:

- `style-src 'unsafe-inline'`: el editor de correos y los gráficos (recharts)
  usan atributos `style` en línea.
- `connect-src https:` es necesario porque el panel llama al API y, si se usa,
  al servicio de SMS externo (`VITE_SMS_API_URL`).
- `frame-src 'self'`: la vista previa del correo usa un `<iframe srcdoc>`.
- `form-action https:`: los flujos de login/logout pueden POSTear a orígenes
  https.
- Se puede endurecer o desactivar con `CSP_POLICY` (`off` ⇒ sin cabecera). Si
  el panel cargara algún recurso externo nuevo, **antes de relajar la CSP**
  revisa si de verdad es necesario.

## 4. Autenticación y autorización

- **Panel**: login propio del CRM (`POST /auth/login`) con JWT (access +
  refresh con rotación en BD). Los tokens viajan en **cookies httpOnly** (con
  `secure` cuando `NODE_ENV=production`).
- **Swagger desactivado** en producción (`NODE_ENV=production`): no expone el
  mapa de la API.
- **Basic Auth adicional en el panel** (`PROTECT_WEB=true`, por defecto):
  defensa en profundidad sobre el login JWT. Cubre el HTML/JS del panel; el API
  no lo pide (las llamadas van a `HOST_API` desde el navegador del usuario).
  - **Despliegue actual (2026-10-20)**: `PROTECT_WEB=false`; el panel se protege
    solo con el login JWT. El HTML/JS es público (normal en una SPA), pero los
    endpoints exigen la cookie `access_token`.
  - **Fail-closed**: si `PROTECT_WEB=true` y no hay contraseña, el contenedor
    **no arranca**.
  - La contraseña se hashea con bcrypt (`caddy hash-password`); se prefiere
    `ADMIN_PASSWORD_HASH` para no dejar la clave en claro en el `.env`.
- El `ia-service` **no se publica**: el backend lo llama por loopback. Sus
  endpoints (`/generate`, `/interpret`, `/suggest-name`) **no llevan auth**
  porque no son alcanzables desde fuera del contenedor; si algún día se
  publican, habrá que ponerles autenticación.
- **Validación de entrada**: `ValidationPipe` con `whitelist` y
  `forbidNonWhitelisted` (rechaza campos no declarados en los DTO).

## 5. Control de abuso (rate limiting)

Implementación **propia, en memoria**, sin dependencias ni servicios externos
(adecuada para una sola instancia).

| Capa | Rutas | Límite | Variables |
|---|---|---|---|
| Backend | `/auth/*` que contengan `login`, `register`, `refresh`, `reset`, `forgot` o `social` | **15 peticiones / 60 s por IP** | `RATE_LIMIT_ENABLED` |
| ia-service | `/generate`, `/interpret`, `/suggest-name` | **20 peticiones / 60 s por IP** | `IA_RATE_LIMIT`, `IA_RATE_WINDOW` |

- Respuesta al exceder: **HTTP 429** con `Retry-After`.
- Detrás de Caddy es imprescindible `TRUST_PROXY=loopback,uniquelocal` (ya
  definido en el compose) para que la IP sea la del cliente vía
  `X-Forwarded-For`; **sin eso todas las peticiones comparten un solo cubo** y
  el límite se agotaría globalmente.
- En **modo edge** hay dos saltos (edge → Caddy interno → backend): el edge
  envía el `X-Forwarded-For` del cliente y el Caddy interno confía en esa red
  (`servers { trusted_proxies static private_ranges }`, lo añade el generador
  cuando `TLS=false`); así el backend resuelve la IP real. Verificado: dos IPs
  distintas no comparten cubo a través del edge.
- Los cubos viven en memoria: se reinician con el contenedor y **no** se
  comparten entre réplicas (aquí solo hay una).
- Limita el coste de DeepSeek (ia-service) y la fuerza bruta del login, pero
  **no sustituye a un WAF**.

## 6. Límites de tamaño y CORS

- **Cuerpo de petición**: `request_body { max_size 50MB }` en el borde
  (`MAX_REQUEST_BODY`; `0` lo desactiva). El backend además limita a 50 MB.
- **CORS**: lista blanca `CORS_ORIGIN`, derivada automáticamente de `HOST_WEB`
  (`https://<host>`) si no se define. **Nunca `*`**, y con credenciales
  habilitadas.
- `CORS_ALLOW_LAN` no se usa en producción (solo aplica a orígenes de red local
  en desarrollo; con dominios reales queda desactivado solo).

## 7. Endurecimiento del contenedor

- Usuario **sin privilegios** (`crm`, uid 10002); el proceso nunca es root.
- `cap_drop: ALL` y `security_opt: no-new-privileges:true`
  (no se necesita `NET_BIND_SERVICE` al escuchar en puertos altos).
- **Solo 80/443** publicados (y las Postgres solo en `127.0.0.1`).
- **Rotación de logs** de Docker (`max-size 10m`, `max-file 5`) para evitar
  llenar el disco (el backend registra cada petición con winston).
- **API de administración de Caddy desactivada** (`admin off`).
- `restart: unless-stopped` + `healthcheck` contra `http://127.0.0.1:3100/api-status`.
- El **edge** (cuando se usa) publica 80/443 con `cap_drop: ALL` +
  `cap_add: NET_BIND_SERVICE` y `no-new-privileges:true`.
- Volúmenes: `crm_caddy_data`, `crm_caddy_config` y `crm_app_logs` (logs de
  winston) para que sobrevivan a recrear el contenedor.
- `depends_on: service_healthy` en las dos Postgres: la app no arranca contra
  una BD a medio iniciar.

## 8. Secretos

- **Nunca entran en la imagen**: `.dockerignore` excluye `.env` y `.env.*`.
- **Nunca se versionan**: `.gitignore` excluye `docker/.env` (el repo solo
  versiona `docker/.env.example`).
- Viven en `docker/.env` (permisos `600`, lo aplica `prod.js`).
- Requeridos: `JWT_SECRET` (obligatorio: sin él el backend no arranca),
  `ADMIN_PASSWORD`/`ADMIN_PASSWORD_HASH` (fail-closed del panel), la clave de
  DeepSeek del ia-service (`IA_SERVICE_DEEPSEEK_API_KEY` o `DEEPSEEK_API_KEY`)
  y, si se usa, la clave de la API de clustering (`CLUSTERING_API_KEY`).
- `ADMIN_PASSWORD_HASH` es preferible a `ADMIN_PASSWORD` (esta última se hashea
  al arrancar, pero viaja en claro en el `.env`).
- **El `.env` generado por el repo trae `postgres/postgres` como credenciales de
  BD**: cámbialas (`CRM_DB_PASSWORD` + `DATABASE_URL` **en la misma edición**) o
  acéptalas sabiendo que la BD no está publicada a internet.
- Recomendaciones: rotación periódica y rotar de inmediato cualquier secreto
  que haya pasado por un chat, un log o un repositorio.

## 9. Base de datos

- **Nunca publicada a internet**: en el compose vive en `crm_internal`
  (`internal: true`); sus puertos se exponen **solo en `127.0.0.1`**.
- En el compose de desarrollo (`crm/db/docker-compose.yml`) los puertos están
  bindeados a **`127.0.0.1`** (no a `0.0.0.0`), igual que en producción.
- Los volúmenes se llaman igual en ambos compose (`crm_postgres_data`,
  `analytics_postgres_data`): **los datos no se duplican** si se alterna entre
  ellos. No levantes los dos compose a la vez (chocarían en los puertos).
- **Backups** periódicos y **probados** (ver `docs/bases-de-datos.md`).
- El `sync-schema.js` que corre al iniciar solo agrega columnas que falten
  (`ADD COLUMN IF NOT EXISTS`) y **no aborta** el arranque si falla.

## 10. Verificación (checklist operativo)

```bash
# 1. Solo el EDGE publica 80/443; el CRM solo en loopback
docker compose -f docker/docker-compose.yml ps
docker port mercaldas_crm_app     # espera 127.0.0.1:30280->8080 y 127.0.0.1:30281->8443
docker port crm_postgres          # espera 127.0.0.1:5437->5432
docker port edge_caddy            # espera 0.0.0.0:80->80 y 0.0.0.0:443->443

# 2. Desde fuera, los puertos internos NO responden
curl -sS -m 3 http://<IP>:3100/ || echo "OK: 3100 cerrado"
curl -sS -m 3 http://<IP>:8002/health || echo "OK: 8002 cerrado"
curl -sS -m 3 http://<IP>:5436/ || echo "OK: 5436 cerrado"
curl -sS -m 3 http://<IP>:5437/ || echo "OK: 5437 cerrado"

# 3. Cabeceras y TLS
curl -I https://<HOST_API>/api-status
curl -I https://<HOST_WEB>/

# 4. Panel exige credenciales (401 sin ellas)
curl -I https://<HOST_WEB>/            # espera 401
curl -I https://<HOST_WEB>/ -u admin:clave   # espera 200

# 5. Rate limit activo (ráfaga de logins → 429)
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18; do curl -s -o /dev/null -w "%{http_code} " \
  -X POST https://<HOST_API>/auth/login -H 'Content-Type: application/json' \
  -d '{"identifier":"x","password":"y"}'; done; echo

# 6. Config del proxy válida (antes de arrancar)
node prod.js --write-caddy
docker run --rm -v "$PWD/deploy/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2.11.7 \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

Se espera: en (4) `401` sin credenciales y `200` con ellas; en (5) que aparezca
algún `429`.

## 11. Riesgos residuales (NO cubierto por este despliegue)

| # | Riesgo | Mitigación recomendada |
|---|---|---|
| 1 | **Sin WAF ni anti-DDoS**: el origen queda expuesto con su IP real | Poner un proxy/CDN delante y restringir 80/443 a sus IPs |
| 2 | **Sin 2FA** en las cuentas del panel | Añadirlo en la app o restringir el panel por VPN |
| 3 | **Host (Windows Server)**: RDP suele estar expuesto | Restringir RDP por IP, cambiar puerto, 2FA; parchear el SO |
| 4 | **Basic Auth con contraseña única compartida** (solo si `PROTECT_WEB=true`) | Un solo secreto para todo el equipo; rotarlo si sale alguien |
| 5 | **Rate limit en memoria**: no sobrevive reinicios ni se comparte entre réplicas | Un WAF o un almacén compartido si algún día se escala |
| 6 | **`/api-status` es público** | Es necesario para el healthcheck; expone solo estado |
| 7 | **ia-service sin auth** (no publicado) | Si se publica algún día, ponerle autenticación y CORS estricto |
| 8 | **Servicios ML** (clustering/xgboost/uplift) dentro del contenedor con `ADMIN_KEY` por defecto `change-me` | Definir `CLUSTERING_API_KEY` real; escuchan en loopback y no se publican |
| 9 | **Servicio de SMS externo** llamado desde el navegador | Debe ser HTTPS y con CORS restringido al `HOST_WEB` |
| 10 | **Sin alertas ni monitorización** | Alertas de caída y de picos de 401/429/5xx |
| 11 | **Secretos sin rotación automática** | Rotación programada y tras cualquier incidente |
| 12 | **Sistema de ficheros escribible** dentro del contenedor (logs) | `read_only: true` + `tmpfs` si algún día se mueven los logs a stdout |
| 13 | **El Caddy interno confía en la red privada** (`trusted_proxies private_ranges`) para leer el `X-Forwarded-For` del edge | Su puerto escucha solo en `127.0.0.1`: no hay clientes externos que puedan falsificarlo |

## 12. Variables de seguridad (referencia rápida)

| Variable | Def. | Efecto |
|---|---|---|
| `TLS` | `true` | `false` exige `ALLOW_INSECURE=true` y desactiva HTTPS |
| `ALLOW_INSECURE` | `false` | Acepta explícitamente servir en HTTP (no usar para exponer) |
| `ACME_EMAIL` | — | Correo para Let's Encrypt |
| `PROTECT_WEB` | `true` | Basic Auth en el panel; **fail-closed** sin contraseña |
| `ADMIN_USER` | `admin` | Usuario del Basic Auth |
| `ADMIN_PASSWORD` / `ADMIN_PASSWORD_HASH` | — | Credencial (se prefiere el hash bcrypt) |
| `CSP_POLICY` | (política por defecto) | CSP a medida; `off` la desactiva |
| `MAX_REQUEST_BODY` | `50MB` | Tamaño máximo de cuerpo en el borde (`0` = sin límite) |
| `RATE_LIMIT_ENABLED` | `false` | Activa el límite de `/auth/*` en el backend (el compose lo pone `true`) |
| `TRUST_PROXY` | — | Debe ser `loopback,uniquelocal` detrás del edge/Caddy para el rate limit por IP |
| `IA_RATE_LIMIT` / `IA_RATE_WINDOW` | `20` / `60` | Límite del ia-service por IP y ventana |
| `PUBLIC_HTTP_PORT` / `PUBLIC_HTTPS_PORT` | `127.0.0.1:30280` / `127.0.0.1:30281` | Puertos publicados en el host (loopback en modo edge) |
| `PUBLIC_SCHEME` | `https` | Esquema público real (CORS derivado detrás del edge) |
| `HOST_WEB`, `HOST_API`, `VITE_API_URL` | — | Dominios publicados y URL pública del API |
| `JWT_SECRET` | — | Firma de los JWT del panel (**obligatorio**) |
| `DATABASE_URL` / `DB_SSL` | — / `false` | Conexión a la BD del CRM (local ⇒ `DB_SSL=false`) |

## 13. Respuesta ante incidentes (mínimo)

1. **Contener**: `node prod.js --stop` (o `docker compose -f docker/docker-compose.yml down`).
2. **Rotar** todos los secretos de `docker/.env` (JWT, contraseña del panel, BD,
   DeepSeek, clustering) y las credenciales de los usuarios del CRM.
3. **Revisar** `docker compose logs crm-app` y los logs del host (accesos, 401/429).
4. **Restaurar** desde el último backup verificado si hubo manipulación de datos.
5. **Parchear** la causa (imagen, dependencias, configuración) y volver a
   desplegar; dejar constancia en este documento si cambia el modelo.
