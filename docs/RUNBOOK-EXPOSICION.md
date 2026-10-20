# RUNBOOK — Exponer el CRM en el VPS (Windows Server)

Guía de **cero a producción** del CRM (analytics + campañas) en el VPS Windows
(`170.254.229.68`) con dominio en **GoDaddy** (`jcti.xyz`). El despliegue es un
contenedor de aplicación (backend + ia-service + panel + Caddy) más dos Postgres
en la red interna, detrás de un **edge compartido** que es el único que publica
80/443 (proyecto hermano: `../ecommerce/docker/edge/`).

> Modelo de seguridad y riesgos: [`SECURITY.md`](./SECURITY.md).
> Atajo para el día a día: `node prod.js` (lee `prod.config.json`, sincroniza
> `docker/.env`, imprime el DNS y construye/levanta).

```mermaid
graph TD
    I["Internet"] -->| "80 / 443" | F["Firewall: proveedor + Windows"]
    F --> E["EDGE compartido (Caddy)<br/>TLS Let's Encrypt"]
    E -->| "crm.jcti.xyz" | C["Caddy del CRM (contenedor)<br/>127.0.0.1:30280"]
    E -->| "mercaldas.jcti.xyz, api…" | EC["Contenedor ecommerce<br/>127.0.0.1:30180"]
    C -->| "Host: crm…" | W["Panel /srv/web"]
    C -->| "Host: crm-api…" | B["Backend NestJS :3100 (loopback)"]
    B --> S["ia-service :8002 (loopback)"]
    B --> DB[("Postgres crm<br/>red interna")]
    B --> ML["Modelos ML (clustering/xgboost/uplift)<br/>loopback :8010-8012"]
    ML --> ADB[("Postgres analytics<br/>red interna")]
```

---

## 0. Puertos (resumen)

| Puerto | Publicado | Qué es |
|---|---|---|
| `80`, `443` | ✅ internet | **Edge compartido** (Caddy): TLS, panel y API de todos los proyectos |
| `30280`, `30281` | ⚠️ solo `127.0.0.1` | Caddy interno del CRM (puertos PROPIOS; los usa el edge) |
| `3100` | ❌ | backend (loopback dentro del contenedor) |
| `8002` | ❌ | ia-service (solo lo llama el backend) |
| `8010`, `8011`, `8012` | ❌ | clustering / xgboost / uplift (loopback; los llama el backend) |
| `5437`, `5436` | ⚠️ solo `127.0.0.1` del host | Postgres `crm` / `analytics` (herramientas y ML locales) |

Cada proyecto tiene puertos propios (nada «genérico» que pueda chocar con IIS u
otros servicios): CRM `30280/30281`, ecommerce `30180/30181`. Los publica solo
en loopback; **nadie más los usa**.

**Nunca** abras `3100`, `8002`, `8010`, `8011`, `8012`, `5436`, `5437`, `30280`
ni `30281` en el firewall.

---

## 1. Requisitos previos

En el VPS (Windows Server):

```powershell
docker --version           # Docker Desktop con WSL2 (o Docker Engine en WSL)
docker compose version     # v2 (plugin `docker compose`, no `docker-compose`)
docker info                # el daemon debe responder
node --version             # para el lanzador prod.js (opcional: puedes usar docker a mano)
```

- Copia del repo CRM en el servidor. En el VPS actual:
  `C:\Users\Desarrolo4\Documents\crm`, rama **`prod`**.
- Acceso al panel DNS de GoDaddy de `jcti.xyz`.
- Acceso al panel de red del proveedor del VPS (security group).
- **El edge compartido** (`../ecommerce/docker/edge/`): es quien publica 80/443 y
  hace TLS. Si el CRM va **solo** en un servidor, no hace falta: usa
  `mode: "direct"` y el propio contenedor publica 80/443 (§8).

---

## 2. Paso 1 — DNS en GoDaddy

Los certificados de Let's Encrypt se validan por **HTTP-01 en el puerto 80**, así
que **el DNS va primero**: si no resuelve, no habrá HTTPS.

`node prod.js --dns` imprime exactamente esto:

| Tipo | Nombre (en la zona `jcti.xyz`) | Valor | TTL |
|---|---|---|---|
| A | `crm` | `170.254.229.68` | 600 |
| A | `crm-api` | `170.254.229.68` | 600 |

En GoDaddy: **Mi dominio → DNS → Administrar DNS → Agregar registro**
(tipo `A`, nombre `crm` — GoDaddy añade `.jcti.xyz` solo).
Borra cualquier `A`/`AAAA` previa con el mismo nombre (un `AAAA` viejo rompe la
validación: el cliente prefiere IPv6).

Comprueba la propagación (desde tu PC, no desde el VPS):

```powershell
nslookup crm.jcti.xyz      # debe devolver 170.254.229.68
nslookup crm-api.jcti.xyz  # idem
```

> `node prod.js` vuelve a verificar esto al arrancar y avisa si aún no apunta.
> Caddy **reintenta solo**: si el DNS propaga más tarde, el certificado se emite
> igual sin reiniciar nada.

---

## 3. Paso 2 — Firewall

1. **Firewall del proveedor** (panel del VPS / security group):
   permitir entrada TCP **80** y **443** desde `0.0.0.0/0` (o restringido si
   usas un proxy delante).
2. **Windows Defender Firewall** (PowerShell como administrador):

```powershell
New-NetFirewallRule -DisplayName "CRM HTTP 80"  -Direction Inbound -Protocol TCP -LocalPort 80  -Action Allow
New-NetFirewallRule -DisplayName "CRM HTTPS 443" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow
```

3. **Comprueba que nadie más ocupa 80/443** (IIS / HTTP.sys es lo típico en
   Windows Server):

```powershell
netstat -ano | findstr ":80 " | findstr LISTENING
# Si el PID es 4 (SYSTEM) suele ser HTTP.sys: detén IIS si no lo usas
Stop-Service W3SVC            # y ponlo en Disabled si no hace falta
```

4. **WSL2 en Windows Server no reenvía los puertos publicados** en algunas
   versiones: el contenedor escucha pero Windows no atiende. Solución
   recomendada (red espejo):

```ini
# %UserProfile%\.wslconfig
[wsl2]
networkingMode=mirrored
```

   Luego `wsl --shutdown`, reinicia Docker Desktop y vuelve a levantar.
   Alternativa (si no puedes usar mirrored): `netsh interface portproxy`
   apuntando a la IP de WSL — OJO: esa IP **cambia al reiniciar** el WSL.

5. Abre solo 80/443; **no** abras los puertos internos.

---

## 4. Paso 3 — Configurar el proyecto

1. Dominios e IP viven en **`prod.config.json`** (ya trae los valores del VPS):

```json
{
  "baseDomain": "jcti.xyz",
  "publicIp": "170.254.229.68",
  "dnsZone": "jcti.xyz",
  "acmeEmail": "admin@jcti.xyz",
  "tls": true,
  "hosts": { "web": "crm.jcti.xyz", "api": "crm-api.jcti.xyz" },
  "smsApiUrl": "",
  "publicHttpPort": 80,
  "publicHttpsPort": 443
}
```

   Cambiar un dominio aquí **no requiere rebuild** (el Caddyfile se genera en el
   arranque del contenedor). Cambiar `hosts.api` **sí** exige rebuild (la URL va
   horneada en el panel).

   `mode` decide quién publica 80/443 y quién hace TLS:
   - `"edge"` (lo que trae el archivo): los publica el **edge compartido** y este
     contenedor escucha en `127.0.0.1:30280/30281`. Es el modo del VPS donde
     conviven ecommerce y CRM.
   - `"direct"`: este contenedor es el único del servidor → publica 80/443 y
     emite el TLS él mismo.

2. **Secretos en `docker/.env`** (el lanzador lo crea y sincroniza lo demás):

```bash
cp docker/.env.example docker/.env
chmod 600 docker/.env
```

   Obligatorios antes de arrancar (el contenedor es **fail-closed**):

| Variable | Cómo obtenerla |
|---|---|
| `JWT_SECRET` | `openssl rand -hex 32` |
| `ADMIN_PASSWORD` **o** `ADMIN_PASSWORD_HASH` | contraseña del Basic Auth del panel (`caddy hash-password --plaintext '...'` para el hash) |
| `IA_SERVICE_DEEPSEEK_API_KEY` (o `DEEPSEEK_API_KEY`) | clave de DeepSeek del ia-service |
| `CLUSTERING_API_KEY` | `ADMIN_KEY` de los servicios de `ml/` (no dejar `change-me`) |

3. Revisa el plan completo (sin tocar nada): `node prod.js --dns`

> Si el VPS ya publica 80/443 con **otro proyecto** (p. ej. el ecommerce), salta
> al **§8 Edge compartido** antes de continuar.

---

## 5. Paso 4 — Construir y levantar

```bash
node prod.js                 # sincroniza docker/.env, construye y levanta
# o a mano:
docker compose -f docker/docker-compose.yml build \
  --build-arg VITE_API_URL=https://crm-api.jcti.xyz
docker compose -f docker/docker-compose.yml up -d

# Y después el EDGE compartido (publica 80/443 y emite los certificados):
cd ../ecommerce/docker/edge && docker compose up -d
```

- La primera construcción tarda (instala dependencias de Node y Python).
- Sigue los logs: `node prod.js --logs` (o `docker compose ... logs -f app`).
- Señales de que todo va bien:
  - **edge**: `certificate obtained successfully` para los dos dominios.
  - `backend`: `✅ Database connected successfully` y `🛡️ Rate limit activo`.
  - `ia-service`: `Application startup complete`.

Si el contenedor **reinicia en bucle**, mira los logs: casi siempre es
`JWT_SECRET` o la contraseña del panel sin definir (mensaje `✘` en stderr).

---

## 6. Paso 5 — Verificación

```bash
# 1. Puertos publicados: solo el edge en 80/443; el CRM solo en loopback
docker port mercaldas_crm_app          # espera 127.0.0.1:30280->8080 (nada en 0.0.0.0)
docker port edge_caddy                 # espera 0.0.0.0:80->80 y 0.0.0.0:443->443
docker port crm_postgres               # espera 127.0.0.1:5437->5432
docker port analytics_postgres         # espera 127.0.0.1:5436->5432

# 2. Desde fuera (tu PC): los internos deben estar cerrados
curl -sS -m 3 http://170.254.229.68:3100/ || echo "OK: 3100 cerrado"
curl -sS -m 3 http://170.254.229.68:8002/health || echo "OK: 8002 cerrado"
curl -sS -m 3 http://170.254.229.68:5437/ || echo "OK: 5437 cerrado"

# 3. Panel y API (TLS)
curl -I https://crm.jcti.xyz/       # 401 (Basic Auth del panel)
curl -I https://crm-api.jcti.xyz/api-status

# 4. Rate limit del login (debe aparecer algún 429)
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18; do curl -s -o /dev/null -w "%{http_code} " \
  -X POST https://crm-api.jcti.xyz/auth/login \
  -H 'Content-Type: application/json' -d '{"identifier":"x","password":"y"}'; done; echo
```

Y en el navegador: abre `https://crm.jcti.xyz` (te pedirá la clave del
panel y luego el login del CRM) y verifica que el candado TLS es válido.

---

## 7. Paso 6 — Cargar datos (si la BD está vacía)

Los contenedores de BD conservan los nombres de dev (`crm_postgres`,
`analytics_postgres`), así que los scripts de `db/` funcionan tal cual:

```bash
# Réplica analytics (RFM/segmentación) desde crm/db/backups/
bash db/restore.sh

# BD operativa `crm`: copia desde la BD del ecommerce (destructivo en `crm`)
bash db/migrate-from-ecommerce.sh   # SRC_CONTAINER=ecommerce_postgres por defecto
```

> Alternativa puntual: `psql` desde el host contra `127.0.0.1:5437` (BD `crm`) y
> `127.0.0.1:5436` (BD `analytics`), usuario `postgres`.
> Al arrancar, el backend aplica solo las columnas que falten (`sync-schema`).
>
> **Windows/Git Bash**: los scripts exportan `MSYS_NO_PATHCONV=1` y convierten
> con `cygpath` la ruta de host del `docker cp`. Sin eso, MSYS reescribe
> `/tmp/...` como `C:/Users/...`, el contenedor no encuentra el dump y
> `pg_restore` “termina bien” sin restaurar nada. `migrate-from-ecommerce.sh`
> genera el dump en un contenedor efímero porque el stdout de `docker exec` se
> pierde en Docker Desktop para Windows.

---

## 8. Modos de despliegue: edge (por defecto) y directo

### 8.1 Modo edge — varios proyectos en el mismo servidor (recomendado)

Cada proyecto escucha en **loopback con puertos propios** y un único **edge**
publica 80/443 y hace TLS para todos los dominios.

- **CRM**: `mode: "edge"` en `prod.config.json` (prod.js escribe en `docker/.env`:
  `TLS=false`, `ALLOW_INSECURE=true`, `PUBLIC_SCHEME=https`,
  `PUBLIC_HTTP_PORT=127.0.0.1:30280`, `PUBLIC_HTTPS_PORT=127.0.0.1:30281`).
- **Ecommerce**: en su `docker/.env` → `TLS=false`, `ALLOW_INSECURE=true`,
  `PUBLIC_SCHEME=https`, `PUBLIC_HTTP_PORT=127.0.0.1:30180`,
  `PUBLIC_HTTPS_PORT=127.0.0.1:30181`.
- **Edge**: `cd ../ecommerce/docker/edge && docker compose up -d` (su Caddyfile
  ya lista los dominios de los dos proyectos; ver ese README).
- **Firewall**: solo 80 y 443.

Por qué no basta con publicar cada app en su puerto raro: Let's Encrypt valida
**siempre** en el 80 (HTTP-01) o 443 (TLS-ALPN-01). Un contenedor en
`30280`/`30281` no puede emitir certificados por sí mismo; el edge, que sí tiene
el 80/443, los emite para todos.

### 8.2 Modo directo — el proyecto es el único del servidor

Si el CRM va en su propio servidor: `mode: "direct"` → el contenedor publica
80/443 y emite el TLS él mismo (sin edge, sin red compartida).

### 8.3 Añadir dominios o proyectos

- Dominio nuevo del CRM: añádelo a `hosts` (prod.config.json) + registro DNS +
  el bloque del edge (`../ecommerce/docker/edge/Caddyfile`).
- Proyecto nuevo: levántalo con su `container_name` propio y añade su bloque al
  Caddyfile del edge apuntando a `<contenedor>:8080`.

---

## 9. Operación diaria

| Tarea | Comando |
|---|---|
| Ver estado | `node prod.js --status` |
| Ver logs | `node prod.js --logs` |
| Actualizar código | `git pull` + `node prod.js --build` |
| Parar | `node prod.js --stop` |
| Backup BD operativa | `docker exec crm_postgres pg_dump -U postgres -d crm -Fc > crm_$(date +%F).dump` |
| Backup analytics | `docker exec analytics_postgres pg_dump -U postgres -d analytics -Fc > analytics_$(date +%F).dump` |
| Rotar el JWT | cambia `JWT_SECRET` en `docker/.env` y `node prod.js --no-build` (invalida sesiones) |

---

## 10. Problemas comunes

| Síntoma | Causa probable | Arreglo |
|---|---|---|
| La web no abre desde fuera | DNS sin propagar / firewall del proveedor / WSL2 no reenvía | `nslookup`; security group; `networkingMode=mirrored` (§3) |
| El certificado no se emite | DNS no apunta ahí, o el 80 está ocupado | espera la propagación; libera 80; Caddy reintenta solo |
| El contenedor reinicia en bucle | falta `JWT_SECRET` o `ADMIN_PASSWORD` | `node prod.js --logs`; completa `docker/.env` |
| El panel carga pero el API falla | `VITE_API_URL` mal horneado o CORS | corrige `hosts.api` y `node prod.js --build` |
| `502` en el API | backend caído o BD no conecta | `docker compose logs app`; revisa `DATABASE_URL`/`DB_SSL` |
| `429` en pruebas | rate limit del login | espera 60 s (o sube el límite en el middleware) |
| El panel pide Basic Auth en bucle | contraseña mal copiada (o hash inválido) | regenera `ADMIN_PASSWORD_HASH` con `caddy hash-password` |
| Campos vacíos en el panel | falta cargar datos | §7 (restore/migrate) |
| `port is already allocated` al levantar | otro proceso usa 80/443 (IIS/HTTP.sys) o los puertos loopback ya están cogidos | libera el puerto; revisa `node prod.js --status` |
| El panel/API da `502` a través del edge | el contenedor del proyecto no está arriba, o falta ese dominio en su `.env` (`HOST_*`) | `docker ps` y `HOST_*` del proyecto |
| El rate limit bloquea a todos los clientes a la vez | el backend no resuelve la IP real | deja `TRUST_PROXY=loopback,uniquelocal` y `PUBLIC_SCHEME=https` (los pone prod.js / el compose) |
| `docker exec …` no imprime nada por SSH (Windows) | Docker Desktop no adjunta stdout/stderr de contenedores a una sesión SSH no interactiva | usa `docker logs <contenedor>`, `docker cp` de un archivo, o `cmd /v:on /c "… & echo !ERRORLEVEL!"` para el código de salida |
| `pg_dump`/`pg_restore` vía `docker exec` “termina” sin escribir nada | misma limitación de adjuntar stdio en Windows + conversión de rutas de Git Bash | ejecuta el cliente en un contenedor efímero (`docker run`) y copia el dump con `docker cp`; los scripts de `db/` ya lo hacen |
| `pg_restore` exit 0 pero la BD sigue vacía | ruta `/tmp/...` convertida por MSYS a `C:/Users/...` | confirma `MSYS_NO_PATHCONV=1` (los scripts ya lo exportan) |

---

## 11. Referencias

- `docker/README.md` — rápido del contenedor.
- `../ecommerce/docker/edge/README.md` — edge compartido: quién publica 80/443 y
  cómo añadir dominios.
- `docs/SECURITY.md` — modelo de seguridad, cabeceras, rate limit y riesgos.
- `docs/bases-de-datos.md` — las dos Postgres, backups y restauración.
- `docs/estado-actual.md` — arquitectura del proyecto y puertos de desarrollo.
