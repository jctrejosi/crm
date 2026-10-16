#!/usr/bin/env node
/**
 * Genera el Caddyfile del contenedor de aplicación del CRM a partir de
 * variables de entorno, de modo que los dominios/hosts NO queden horneados en
 * la imagen.
 *
 * Modo multi-host (recomendado): define `HOST_API` (backend) y `HOST_WEB`
 *   (panel). Cada uno se sirve en su propio subdominio; backend e ia-service
 *   solo escuchan en 127.0.0.1 dentro del contenedor (el ia-service no se
 *   publica: lo llama el backend).
 *
 * Si no defines ningún HOST_*, se genera un único vhost en el puerto HTTP que
 *   solo proxya al backend (útil como smoke-test del contenedor).
 *
 * Variables:
 *   HOST_API           dominio del API (backend)                  [opcional]
 *   HOST_WEB           panel web (React + Vite)  → /srv/web
 *   TLS                 "true" (def.) | "false"  (false ⇒ HTTP, pensado para ir
 *                       detrás del edge compartido que hace TLS; requiere ALLOW_INSECURE)
 *   ACME_EMAIL         email para Let's Encrypt (avisos de expiración)
 *   PROTECT_WEB        "true" (def.) ⇒ Basic Auth en el panel
 *   ADMIN_USER         usuario del Basic Auth            (def. admin)
 *   ADMIN_PASSWORD     contraseña en claro (se hashea con caddy bcrypt)
 *   ADMIN_PASSWORD_HASH hash bcrypt ya calculado (tiene prioridad)
 *   BACKEND_PORT       puerto interno del backend  (def. 3100)
 *   HTTP_PORT          puerto HTTP interno de Caddy  (def. 8080; el compose publica 80)
 *   HTTPS_PORT         puerto HTTPS interno de Caddy (def. 8443; el compose publica 443)
 *   MAX_REQUEST_BODY   tamaño máximo de cuerpo (def. 50MB; "0" ⇒ sin límite)
 *   CSP_POLICY         política CSP ("off"/"" ⇒ sin cabecera; por defecto una segura)
 *   CADDYFILE_OUT      ruta de salida (def. /config/Caddyfile.generated)
 */
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const env = process.env;
const TLS = String(env.TLS ?? "true").toLowerCase() !== "false";
const EMAIL = (env.ACME_EMAIL || "").trim();
const BACKEND = `127.0.0.1:${env.BACKEND_PORT || 3100}`;

// Caddy NO corre como root dentro del contenedor, así que escucha en puertos
// altos; el compose publica 80/443 hacia ellos.
const HTTP_PORT = String(env.HTTP_PORT || "8080").trim();
const HTTPS_PORT = String(env.HTTPS_PORT || "8443").trim();

// Límite de tamaño de cuerpo en el borde: el backend acepta subidas de
// catálogo/plantillas (multer en memoria) hasta 50 MB. "0"/vacío ⇒ sin límite.
const MAX_BODY = String(env.MAX_REQUEST_BODY ?? "50MB").trim();
const bodyLimit =
  MAX_BODY && MAX_BODY !== "0"
    ? `\trequest_body {\n\t\tmax_size ${MAX_BODY}\n\t}\n`
    : "";

// CSP por defecto del panel del CRM. A diferencia del ecommerce, el panel es un
// build de Vite SIN scripts inline (no hay next-themes ni OAuth con script
// externo), así que `script-src 'self'` es suficiente y más estricto.
// - style-src 'unsafe-inline': el editor de correos y los gráficos (recharts)
//   usan atributos style en línea.
// - img-src/connect-src https:: las imágenes y llamadas salen al API y al
//   servicio de SMS externo (VITE_SMS_API_URL).
// - frame-src 'self': la vista previa del correo usa un iframe `srcdoc`.
// - form-action https:: los flujos de login/logout pueden POSTear a otros
//   orígenes https.
const DEFAULT_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https:",
  "connect-src 'self' https: wss:",
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
  "form-action 'self' https:",
].join("; ");
const cspEnv = env.CSP_POLICY;
const CSP =
  cspEnv === undefined
    ? DEFAULT_CSP
    : /^(off|none|false|0|)$/i.test(cspEnv.trim())
      ? ""
      : cspEnv.trim();

// Interfaz → variable de entorno del host y directorio dentro de la imagen.
// `admin: true` ⇒ es el panel (candidato a Basic Auth con PROTECT_WEB).
const FRONTS = [{ envKey: "HOST_WEB", dir: "/srv/web", admin: true }];

const hostOf = (k) => (env[k] || "").trim();
const HOST_API = hostOf("HOST_API");
const frontHosts = FRONTS.map((f) => ({ ...f, host: hostOf(f.envKey) })).filter((f) => f.host);
const anyHost = Boolean(HOST_API) || frontHosts.length > 0;

// ── Basic Auth del panel ──
// Defensa en profundidad sobre el login JWT del CRM (fail-closed en entrypoint).
const PROTECT_WEB = String(env.PROTECT_WEB ?? "true").toLowerCase() !== "false";
let basicAuth = "";
if (PROTECT_WEB) {
  let hash = (env.ADMIN_PASSWORD_HASH || "").trim();
  if (!hash && env.ADMIN_PASSWORD) {
    const r = spawnSync("caddy", ["hash-password", "--plaintext", env.ADMIN_PASSWORD], {
      encoding: "utf8",
    });
    if (r.status === 0) hash = (r.stdout || "").trim();
  }
  if (hash) {
    basicAuth = `\tbasic_auth {\n\t\t${env.ADMIN_USER || "admin"} ${hash}\n\t}\n`;
  } else {
    console.warn(
      "⚠️  PROTECT_WEB activo pero falta ADMIN_PASSWORD/ADMIN_PASSWORD_HASH " +
        "(o el binario caddy); el panel NO se protege con Basic Auth.",
    );
  }
}

// ── Cabeceras de seguridad comunes a todos los vhosts ───────
const headerLines = [
  `\tX-Content-Type-Options "nosniff"`,
  `\tX-Frame-Options "SAMEORIGIN"`,
  `\tReferrer-Policy "strict-origin-when-cross-origin"`,
  `\tCross-Origin-Opener-Policy "same-origin-allow-popups"`,
  `\tPermissions-Policy "camera=(self), microphone=(self), geolocation=(self), payment=()"`,
  `\t-Server`,
];
if (CSP) headerLines.push(`\tContent-Security-Policy "${CSP}"`);
if (TLS) headerLines.unshift(`\tStrict-Transport-Security "max-age=31536000; includeSubDomains"`);
const headerBlock = `\theader {\n${headerLines.join("\n")}\n\t}\n`;

// Con TLS desactivado este Caddy va detrás de un edge que SÍ hace TLS (modo
// edge compartido): el backend debe ver el esquema público real, así que se
// fija X-Forwarded-Proto=https.
const protoUp = TLS ? "" : " {\n\t\theader_up X-Forwarded-Proto https\n\t}";

const apiBlock = `${headerBlock}${bodyLimit}\tencode zstd gzip
	handle {
		reverse_proxy ${BACKEND}${protoUp}
	}`;

const staticBlock = (dir, withAuth) => `${headerBlock}${withAuth ? basicAuth : ""}${bodyLimit}\tencode zstd gzip
	root * ${dir}
	try_files {path} /index.html
	file_server`;

let out = "";

// Con TLS desactivado hay que forzar el esquema `http://`: un hostname sin
// esquema hace que Caddy asuma HTTPS (y escucharía en :443, no en :80).
const siteAddr = (host) => (TLS ? host : `http://${host}`);

if (anyHost) {
  // Opciones globales: sin API de administración, puertos altos (no root),
  // email ACME y HTTP puro si TLS=false.
  const opts = ["\tadmin off", `\thttp_port ${HTTP_PORT}`, `\thttps_port ${HTTPS_PORT}`];
  if (EMAIL) opts.push(`\temail ${EMAIL}`);
  if (!TLS) {
    opts.push("\tauto_https off");
    // Detrás del edge compartido: el edge es un proxy de confianza (red Docker
    // privada) y envía el X-Forwarded-For del cliente; sin esto Caddy lo
    // reemplazaría por la IP del edge y el rate limit sería un único cubo.
    opts.push("\tservers {\n\t\ttrusted_proxies static private_ranges\n\t}");
  }
  out += `{\n${opts.join("\n")}\n}\n`;

  if (HOST_API) out += `\n${siteAddr(HOST_API)} {\n${apiBlock}\n}\n`;
  for (const f of frontHosts) {
    const withAuth = PROTECT_WEB && Boolean(f.admin) && Boolean(basicAuth);
    out += `\n${siteAddr(f.host)} {\n${staticBlock(f.dir, withAuth)}\n}\n`;
  }
} else {
  // Sin dominios configurados: vhost mínimo en el puerto HTTP (solo API).
  out +=
    `# ⚠️  No definiste ningún HOST_* — vhost mínimo (solo API).\n` +
    `#     Define HOST_API y HOST_WEB para publicar el API y el panel.\n` +
    `:${HTTP_PORT} {\n${apiBlock}\n}\n`;
}

const dest = env.CADDYFILE_OUT || "/config/Caddyfile.generated";
fs.writeFileSync(dest, out);
process.stdout.write(`Caddyfile generado en ${dest}:\n${out}`);
