#!/usr/bin/env node
"use strict";
/**
 * CRM — lanzador de PRODUCCIÓN (contenedor de aplicación + bases internas).
 *
 * Es la contraparte de `crm/dev.js` para el VPS: en vez de levantar cada
 * servicio en local, construye y levanta `docker/docker-compose.yml` (backend
 * NestJS + ia-service + panel + Caddy + las dos Postgres en la red interna).
 *
 * Todo lo configurable de dominios/puertos/modo vive en `prod.config.json`; prod.js
 * lo traduce a `docker/.env` (sin pisar secretos), imprime los registros DNS a
 * crear en tu proveedor (GoDaddy) y verifica que ya resuelvan antes de arrancar.
 *
 * Modos (prod.config.json → "mode"):
 *   "edge"   (def.) — 80/443 los publica el EDGE compartido
 *              (../ecommerce/docker/edge/) y este contenedor escucha en
 *              loopback en puertos PROPIOS (30280/30281).
 *   "direct" — este contenedor es el único del servidor: publica 80/443 y
 *              emite el TLS con Let's Encrypt.
 *
 * Uso:
 *   node prod.js --init-config   → crea prod.config.json (plantilla)
 *   node prod.js --dns           → solo muestra lo que hay que configurar (DNS + firewall)
 *   node prod.js --write-caddy   → escribe deploy/Caddyfile para inspeccionarlo
 *   node prod.js                 → sincroniza docker/.env, construye y levanta
 *   node prod.js --no-build      → levanta sin reconstruir la imagen
 *   node prod.js --build         → fuerza reconstrucción y levanta
 *   node prod.js --status        → estado de los contenedores y puertos publicados
 *   node prod.js --logs          → sigue los logs del contenedor de aplicación
 *   node prod.js --stop          → detiene y elimina los contenedores (los datos quedan)
 *   node prod.js --help
 *
 * El contenedor es fail-closed: sin `JWT_SECRET` y sin la contraseña del panel
 * (ADMIN_PASSWORD o ADMIN_PASSWORD_HASH) NO arranca. prod.js lo verifica antes
 * de construir para darte el mensaje claro aquí y no en los logs de Docker.
 */
const { spawnSync } = require("node:child_process");
const dns = require("node:dns/promises");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const DOCKER_DIR = path.join(ROOT, "docker");
const COMPOSE_FILE = path.join(DOCKER_DIR, "docker-compose.yml");
const ENV_FILE = path.join(DOCKER_DIR, ".env");
const ENV_EXAMPLE = path.join(DOCKER_DIR, ".env.example");
const DEPLOY_DIR = path.join(ROOT, "deploy");
const CADDYFILE_PREVIEW = path.join(DEPLOY_DIR, "Caddyfile");

const ARGS = process.argv.slice(2);
const HELP = ARGS.includes("--help");
const INIT_CONFIG = ARGS.includes("--init-config");
const DNS_ONLY = ARGS.includes("--dns");
const WRITE_CADDY = ARGS.includes("--write-caddy");
const FORCE_BUILD = ARGS.includes("--build");
const NO_BUILD = ARGS.includes("--no-build");
const STOP = ARGS.includes("--stop");
const LOGS = ARGS.includes("--logs");
const STATUS = ARGS.includes("--status");
const CONFIG_IDX = ARGS.indexOf("--config");
const CONFIG_PATH =
  CONFIG_IDX >= 0 && ARGS[CONFIG_IDX + 1]
    ? path.resolve(ROOT, ARGS[CONFIG_IDX + 1])
    : path.join(ROOT, "prod.config.json");

const C = { ok: "\x1b[32m", warn: "\x1b[33m", err: "\x1b[31m", dim: "\x1b[2m", reset: "\x1b[0m" };

// ── Utilidades ──────────────────────────────────────────────
const rel = (p) => path.relative(ROOT, p) || p;

/** Ejecuta y espera, mostrando la salida (build/up de docker). */
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", windowsHide: true, ...opts });
  return r.status === 0;
}

/** Ejecuta y captura stdout (para inspecciones). */
function capture(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8", windowsHide: true });
  return (r.stdout || "").trim();
}

function compose(args) {
  return run("docker", ["compose", "-f", COMPOSE_FILE, ...args]);
}

function die(msg) {
  console.error(`${C.err}${msg}${C.reset}`);
  process.exit(1);
}

function printHelp() {
  console.log(
    [
      "CRM — lanzador de producción (contenedor de aplicación)",
      "",
      "  node prod.js                 sincroniza docker/.env, construye y levanta",
      "  node prod.js --no-build      levanta sin reconstruir la imagen",
      "  node prod.js --build         fuerza reconstrucción y levanta",
      "  node prod.js --dns           muestra los registros DNS y el firewall a configurar",
      "  node prod.js --write-caddy   escribe deploy/Caddyfile (vista previa del proxy)",
      "  node prod.js --status        estado de contenedores y puertos publicados",
      "  node prod.js --logs          sigue los logs del contenedor de aplicación",
      "  node prod.js --stop          detiene los contenedores (los datos quedan)",
      "  node prod.js --init-config   crea prod.config.json (plantilla)",
      "  node prod.js --config <ruta> usa otro archivo de configuración",
      "  node prod.js --help          esta ayuda",
      "",
      "Dominios/puertos: prod.config.json (mode: edge|direct) · Secretos (JWT, BD, DeepSeek, panel): docker/.env",
      "Guía completa: docs/RUNBOOK-EXPOSICION.md · Seguridad: docs/SECURITY.md",
    ].join("\n"),
  );
}

// ── Configuración (prod.config.json) ────────────────────────
function initConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    console.log(`${C.warn}ℹ️  Ya existe ${rel(CONFIG_PATH)} — edítalo o usa --config <ruta>.${C.reset}`);
    return;
  }
  const template = {
    baseDomain: "tudominio.com",
    publicIp: "",
    dnsZone: "tudominio.com",
    acmeEmail: "admin@tudominio.com",
    tls: true,
    hosts: {
      web: "crm.tudominio.com",
      api: "crm-api.tudominio.com",
    },
    smsApiUrl: "",
    publicHttpPort: 80,
    publicHttpsPort: 443,
  };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(template, null, 2) + "\n");
  console.log(`✅ Creado ${rel(CONFIG_PATH)} — edita dominios/IP y vuelve a ejecutar prod.js.`);
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    die(
      `✘ No existe ${rel(CONFIG_PATH)}.\n  Créalo con: node prod.js --init-config\n  (o pasa --config <ruta>)`,
    );
  }
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch (e) {
    die(`✘ ${rel(CONFIG_PATH)} no es JSON válido: ${e.message}`);
  }
  cfg.hosts = cfg.hosts || {};
  cfg.publicIp = (cfg.publicIp || "").trim();
  cfg.acmeEmail = (cfg.acmeEmail || "").trim();
  cfg.dnsZone = (cfg.dnsZone || "").trim();
  cfg.smsApiUrl = (cfg.smsApiUrl || "").trim();
  // Modo de despliegue:
  //   "edge"   → 80/443 los publica el edge compartido (ecommerce/docker/edge/)
  //              y el contenedor escucha en loopback (puertos propios).
  //   "direct" → este contenedor es el único del servidor y publica 80/443
  //              con TLS propio (Let's Encrypt).
  cfg.mode = String(cfg.mode || "direct").toLowerCase() === "edge" ? "edge" : "direct";
  cfg.edgePorts = cfg.edgePorts || {};
  cfg.edgeHttpPort = String(cfg.edgePorts.http || "127.0.0.1:30280");
  cfg.edgeHttpsPort = String(cfg.edgePorts.https || "127.0.0.1:30281");
  cfg.tls = cfg.tls !== false;
  cfg.publicHttpPort = cfg.publicHttpPort || 80;
  cfg.publicHttpsPort = cfg.publicHttpsPort || 443;

  const missing = [];
  if (!cfg.hosts.web) missing.push("hosts.web (panel)");
  if (!cfg.hosts.api) missing.push("hosts.api (backend)");
  if (!cfg.publicIp) missing.push("publicIp");
  if (missing.length) die(`✘ Faltan datos en ${rel(CONFIG_PATH)}: ${missing.join(", ")}`);
  return cfg;
}

const schemeOf = (cfg) => (cfg.tls ? "https" : "http");

/** Nombre del registro dentro de la zona DNS (p. ej. crm.mercaldas en jcti.xyz). */
function recordName(cfg, host) {
  if (cfg.dnsZone && host.endsWith("." + cfg.dnsZone)) {
    return host.slice(0, -(cfg.dnsZone.length + 1));
  }
  return host;
}

// ── Registros DNS + firewall ────────────────────────────────
function dnsRows(cfg) {
  return [
    { host: cfg.hosts.web, target: "panel (Caddy → /srv/web)" },
    { host: cfg.hosts.api, target: "backend NestJS (3100) · ia-service interno (8002)" },
  ];
}

function printDns(cfg) {
  const scheme = schemeOf(cfg);
  const rows = dnsRows(cfg);
  const w = Math.max(...rows.map((r) => r.host.length));

  console.log("\n━━━━━━━━━━━ DNS a configurar en tu proveedor (GoDaddy) ━━━━━━━━━━━");
  console.log(`  Dominio base : ${cfg.baseDomain || "(no definido)"}`);
  console.log(`  IP pública   : ${cfg.publicIp}`);
  console.log(`\n  1) En GoDaddy → ${cfg.dnsZone || "<tu-zona>"} → Administrar DNS → Agregar registro:`);
  console.log("     Tipo: A    TTL: 600 (o 1 hora)    Valor: " + cfg.publicIp);
  console.log("     ─────────────────────────────────────────────────────────");
  for (const r of rows) {
    console.log(`     Nombre: ${recordName(cfg, r.host).padEnd(w)}   →   ${r.host}`);
  }
  console.log("     ─────────────────────────────────────────────────────────");
  console.log("     (Borra cualquier A/AAAA previa con el mismo nombre; espera a que propague.)");

  console.log("\n  2) Abre los puertos en el servidor:");
  if (cfg.mode === "edge") {
    console.log("     • SOLO 80 y 443: los publica el EDGE compartido");
    console.log("       (../ecommerce/docker/edge/ — el CRM va en loopback 30280/30281).");
  } else {
    console.log(`     • SOLO ${cfg.publicHttpPort} y ${cfg.publicHttpsPort}: los publica este contenedor.`);
  }
  console.log("     • Firewall del PROVEEDOR del VPS (security group / panel de red).");
  console.log("     • Firewall del sistema: en Windows, reglas de entrada de esos puertos (Windows Defender Firewall).");
  console.log("       Comprueba que IIS/HTTP.sys (u otro servicio) no los estén ocupando.");
  console.log("     NO abras 3100, 8002, 5436 ni 5437 ni ningún otro puerto interno.");
  console.log("     (Los puertos loopback de los proyectos —30280/30180…— no necesitan regla.)");

  console.log("\n  3) Comprobación desde tu PC (debe devolver " + cfg.publicIp + "):");
  for (const r of rows) console.log(`     nslookup ${r.host}`);

  console.log("\n  4) Mapa dominio → servicio (lo aplica el proxy Caddy):");
  const viaEdge = cfg.mode === "edge" ? "edge Caddy → " : "";
  for (const r of rows) console.log(`     ${scheme}://${r.host}  →  ${viaEdge}${r.target}`);
  if (!cfg.acmeEmail) {
    console.log(`\n  ${C.warn}ℹ️  Define "acmeEmail" en prod.config.json para Let's Encrypt.${C.reset}`);
  }
  if (cfg.tls) {
    console.log("\n  ℹ️  El certificado (Let's Encrypt) se valida por HTTP-01 en el puerto 80:");
    console.log("     si el DNS aún no resuelve, no se emitirá hasta que apunte (Caddy reintenta solo).");
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

/** Verifica que los dominios ya resuelvan a la IP pública configurada. */
async function verifyDns(cfg) {
  console.log(`\n${C.dim}==> Verificando resolución DNS…${C.reset}`);
  let pending = 0;
  for (const r of dnsRows(cfg)) {
    try {
      const addrs = await dns.resolve4(r.host);
      if (addrs.includes(cfg.publicIp)) {
        console.log(`  ${C.ok}✔${C.reset} ${r.host} → ${addrs.join(", ")}`);
      } else {
        console.log(
          `  ${C.warn}⚠${C.reset} ${r.host} → ${addrs.join(", ")} (esperado ${cfg.publicIp}; ¿DNS aún propagando?)`,
        );
        pending++;
      }
    } catch {
      console.log(`  ${C.warn}⚠${C.reset} ${r.host} → sin registro A todavía (DNS pendiente)`);
      pending++;
    }
  }
  if (pending) {
    console.log(
      `  ${C.warn}ℹ️  ${pending} dominio(s) aún no apuntan aquí. Con TLS=true el certificado no se emitirá\n     hasta que resuelvan; Caddy reintenta solo (no hace falta reiniciar).${C.reset}`,
    );
  }
  return pending;
}

// ── docker/.env ─────────────────────────────────────────────
/** Actualiza/agrega pares KEY=valor conservando el resto del archivo. */
function setEnvKeys(text, pairs) {
  let out = text;
  const added = [];
  for (const [key, value] of Object.entries(pairs)) {
    const re = new RegExp(`^${key}=.*$`, "m");
    if (re.test(out)) {
      out = out.replace(re, `${key}=${value}`);
    } else if (new RegExp(`^#\\s*${key}=`, "m").test(out)) {
      // clave comentada (p. ej. `# VITE_SMS_API_URL=...`): se descomenta.
      out = out.replace(new RegExp(`^#\\s*${key}=.*$`, "m"), `${key}=${value}`);
    } else {
      added.push(`${key}=${value}`);
    }
  }
  if (added.length) {
    if (!out.endsWith("\n")) out += "\n";
    out += `\n# ── Sincronizado por prod.js desde prod.config.json ──\n${added.join("\n")}\n`;
  }
  return out;
}

function envValue(text, key) {
  const m = text.match(new RegExp(`^\\s*${key}=(.*)$`, "m"));
  return m ? m[1].trim() : "";
}

function syncEnvFile(cfg) {
  let text;
  if (!fs.existsSync(ENV_FILE)) {
    if (!fs.existsSync(ENV_EXAMPLE)) die(`✘ Falta ${rel(ENV_EXAMPLE)} (no puedo crear docker/.env).`);
    fs.copyFileSync(ENV_EXAMPLE, ENV_FILE);
    console.log(`✅ Creado ${rel(ENV_FILE)} a partir del ejemplo.`);
  }
  text = fs.readFileSync(ENV_FILE, "utf8");

  const scheme = schemeOf(cfg);
  const edge = cfg.mode === "edge";
  const pairs = {
    HOST_WEB: cfg.hosts.web,
    HOST_API: cfg.hosts.api,
    ACME_EMAIL: cfg.acmeEmail,
    // En modo edge el TLS lo termina el edge: el contenedor sirve HTTP en
    // loopback y el esquema público (https) se declara aparte.
    TLS: edge || !cfg.tls ? "false" : "true",
    ALLOW_INSECURE: edge || !cfg.tls ? "true" : "false",
    PUBLIC_SCHEME: scheme,
    VITE_API_URL: `${scheme}://${cfg.hosts.api}`,
    PUBLIC_HTTP_PORT: edge ? cfg.edgeHttpPort : String(cfg.publicHttpPort),
    PUBLIC_HTTPS_PORT: edge ? cfg.edgeHttpsPort : String(cfg.publicHttpsPort),
  };
  if (cfg.smsApiUrl) pairs.VITE_SMS_API_URL = cfg.smsApiUrl;

  fs.writeFileSync(ENV_FILE, setEnvKeys(text, pairs));
  // Permisos 600 donde el SO lo permita (Linux/macOS); en Windows se ignora.
  try {
    fs.chmodSync(ENV_FILE, 0o600);
  } catch {
    /* Windows */
  }
  console.log(`✅ ${rel(ENV_FILE)} sincronizado (dominios, TLS, URLs del panel y puertos).`);

  // Fail-closed del contenedor: avisamos aquí, no en los logs de Docker.
  const jwt = envValue(fs.readFileSync(ENV_FILE, "utf8"), "JWT_SECRET");
  const pass = envValue(fs.readFileSync(ENV_FILE, "utf8"), "ADMIN_PASSWORD");
  const hash = envValue(fs.readFileSync(ENV_FILE, "utf8"), "ADMIN_PASSWORD_HASH");
  const problems = [];
  if (!jwt) problems.push("JWT_SECRET vacío → genera uno con:  openssl rand -hex 32");
  if (!pass && !hash) problems.push("Falta la contraseña del panel → define ADMIN_PASSWORD o ADMIN_PASSWORD_HASH");
  if (problems.length) {
    console.error(`\n${C.err}✘ docker/.env está incompleto (el contenedor NO arrancaría):${C.reset}`);
    for (const p of problems) console.error(`   • ${p}`);
    console.error(`   Edita ${rel(ENV_FILE)} y vuelve a ejecutar node prod.js.`);
    process.exit(1);
  }
}

// ── Aviso de puertos ocupados (p. ej. el contenedor del ecommerce) ──
function warnPortConflicts(cfg) {
  const out = capture("docker", ["ps", "--format", "{{.Names}}\t{{.Ports}}"]);
  if (!out) return;
  const conflicts = [];
  for (const line of out.split("\n")) {
    const [name, ports = ""] = line.split("\t");
    if (!name) continue;
    for (const p of [cfg.publicHttpPort, cfg.publicHttpsPort]) {
      if (new RegExp(`[:.]${p}->`).test(ports)) conflicts.push(`${name} publica el puerto ${p}`);
    }
  }
  if (conflicts.length) {
    console.log(`\n${C.warn}⚠️  Puertos ya ocupados en este servidor:${C.reset}`);
    for (const c of conflicts) console.log(`   • ${c}`);
    console.log(
      "   Si ese contenedor es otro proyecto (p. ej. el ecommerce), usa el patrón de\n" +
        '   "edge compartido" (docs/RUNBOOK-EXPOSICION.md §8) o cambia PUBLIC_HTTP_PORT/\n' +
        "   PUBLIC_HTTPS_PORT en docker/.env antes de continuar.",
    );
  }
}

// ── Vista previa del Caddyfile ──────────────────────────────
function writeCaddyPreview(cfg) {
  if (!fs.existsSync(DEPLOY_DIR)) fs.mkdirSync(DEPLOY_DIR, { recursive: true });
  const env = {
    ...process.env,
    HOST_WEB: cfg.hosts.web,
    HOST_API: cfg.hosts.api,
    // En modo edge el Caddy interno sirve HTTP (el TLS lo hace el edge).
    TLS: cfg.mode === "edge" ? "false" : String(cfg.tls),
    ACME_EMAIL: cfg.acmeEmail,
    CADDYFILE_OUT: CADDYFILE_PREVIEW,
  };
  // Sin ADMIN_PASSWORD definida el generador solo avisa (no protege); es una
  // vista previa, no el Caddyfile que se ejecuta.
  const ok = run(process.execPath, [path.join(DOCKER_DIR, "gen-caddyfile.mjs")], { env });
  if (!ok) die("✘ No se pudo generar la vista previa del Caddyfile.");
  console.log(`✅ Vista previa escrita en ${rel(CADDYFILE_PREVIEW)} (no la usa el contenedor).`);
}

// ── Acciones docker ─────────────────────────────────────────
function ensureDocker() {
  const v = capture("docker", ["--version"]);
  if (!v) die("✘ Docker no está disponible en el PATH.");
  if (!capture("docker", ["info", "--format", "{{.ServerVersion}}"])) {
    die("✘ El daemon de Docker no responde. ¿Está Docker Desktop/Engine arrancado?");
  }
  console.log(`${C.dim}Docker ${v.replace(/^Docker version\s*/, "").split(",")[0]}${C.reset}`);
}

function buildImage(cfg) {
  const args = [
    "compose",
    "-f",
    COMPOSE_FILE,
    "build",
    "--build-arg",
    `VITE_API_URL=${schemeOf(cfg)}://${cfg.hosts.api}`,
  ];
  if (cfg.smsApiUrl) args.push("--build-arg", `VITE_SMS_API_URL=${cfg.smsApiUrl}`);
  console.log(`\n==> Construyendo la imagen (VITE_API_URL=${schemeOf(cfg)}://${cfg.hosts.api})…`);
  if (!run("docker", args)) die("✘ Falló la construcción de la imagen.");
}

function status() {
  compose(["ps"]);
  const port = capture("docker", ["port", "mercaldas_crm_app"]);
  if (port) {
    console.log(`\n${C.dim}Puertos publicados por el contenedor de aplicación:${C.reset}`);
    console.log(port);
  }
  console.log(
    `\n${C.dim}Recuerda: backend (3100) e ia-service (8002) NO deben aparecer publicados;\n` +
      `las Postgres solo en 127.0.0.1:5436/5437.${C.reset}`,
  );
}

// ── Flujo principal ─────────────────────────────────────────
async function main() {
  if (HELP) return printHelp();
  if (INIT_CONFIG) return initConfig();

  const cfg = loadConfig();

  if (DNS_ONLY) return printDns(cfg);

  if (WRITE_CADDY) {
    writeCaddyPreview(cfg);
    return;
  }

  ensureDocker();

  if (STOP) {
    console.log("==> Deteniendo contenedores (los volúmenes/datos se conservan)…");
    if (!compose(["down"])) die("✘ Falló `docker compose down`.");
    console.log("✅ Detenido.");
    return;
  }
  if (LOGS) return void compose(["logs", "-f", "--tail", "80", "crm-app"]);
  if (STATUS) return status();

  warnPortConflicts(cfg);
  syncEnvFile(cfg);
  printDns(cfg);

  const pend = await verifyDns(cfg);

  if (NO_BUILD) {
    console.log("\n==> Levantando (sin reconstruir)…");
    if (!compose(["up", "-d"])) die("✘ Falló `docker compose up`.");
  } else {
    buildImage(cfg);
    console.log("\n==> Levantando contenedores…");
    if (!compose(["up", "-d", "--remove-orphans"])) die("✘ Falló `docker compose up`.");
  }

  status();

  const scheme = schemeOf(cfg);
  console.log("\n━━━━━━━━━━━ Siguientes pasos ━━━━━━━━━━━");
  if (cfg.mode === "edge") {
    console.log(`  ${C.ok}1)${C.reset} Levanta el EDGE compartido (publica 80/443 y hace TLS Let's Encrypt):`);
    console.log("     cd ../ecommerce/docker/edge && docker compose up -d");
    console.log("     (los proyectos deben estar arriba: son quienes crean la red shared_edge)");
  } else {
    console.log(`  ${C.ok}1)${C.reset} Modo directo: este contenedor publica ${cfg.publicHttpPort}/${cfg.publicHttpsPort} y emite el TLS.`);
  }
  if (pend) {
    console.log(`  ${C.warn}2)${C.reset} Termina el DNS en GoDaddy (arriba) y espera la propagación.`);
    console.log("     El certificado TLS se emite solo cuando el DNS apunte aquí (Caddy reintenta solo).");
  } else {
    console.log(`  ${C.ok}2)${C.reset} DNS OK: el certificado se emite automáticamente al primer acceso.`);
  }
  console.log(`  3) Verifica en el navegador: ${scheme}://${cfg.hosts.web} (pedirá la clave del panel)`);
  console.log(`     y el API: ${scheme}://${cfg.hosts.api}/api-status`);
  console.log("  4) Comprueba desde fuera que los puertos internos están cerrados:");
  console.log(`     ${cfg.publicIp}:3100 · :8002 · :5436 · :5437 · :30280 (deben fallar o rechazar)`);
  console.log("  5) Datos: si necesitas cargar la BD, usa crm/db/restore.sh (analytics) o");
  console.log("     crm/db/migrate-from-ecommerce.sh (BD operativa) contra 127.0.0.1:5436/5437.");
  console.log(`  ${C.dim}Logs: node prod.js --logs · Estado: node prod.js --status · Parar: node prod.js --stop${C.reset}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

main().catch((e) => die(`✘ Error inesperado: ${e && e.message ? e.message : e}`));
