#!/usr/bin/env node
"use strict";
/**
 * CRM — lanzador local del proyecto. Multiplataforma (Linux/macOS/Windows).
 *
 * Levanta las piezas del CRM (`crm/`):
 *   db        → PostgreSQL del CRM (docker compose) :5436/:5437  [crm/db]
 *   backend   → NestJS propio del CRM                 :3100  [crm/backend]
 *   web       → Interface web (React + Vite)          :8444  [crm/interface web]
 *   ia        → ia-service (FastAPI + DeepSeek)       :8002  [crm/ia-service]
 *   clustering→ clustering-api (scikit-learn)          :8010  [crm/ml/clustering-api]
 *   xgboost   → xgboost-api (propensión, SHAP)         :8011  [crm/ml/xgboost-api]
 *   uplift    → uplift-api (econml)                    :8012  [crm/ml/uplift-api]
 *
 * Uso:
 *   node crm/dev.js                 # levanta todo (dev)
 *   node crm/dev.js --backend --web # solo los seleccionados
 *   node crm/dev.js --prod          # backend sin watch; ia/ml sin --reload
 *   node crm/dev.js --ml            # solo clustering + xgboost + uplift
 *   node crm/dev.js --restore       # al montar la BD, la restaura desde db/backups
 *   node crm/dev.js --backup-db     # vuelca la BD operativa `crm` a backups/crm_<fecha>.dump
 *   node crm/dev.js --restore-db    # deja la BD `crm` como el respaldo (pg_restore --clean) y sale
 *   node crm/dev.js --init          # primer arranque desde cero (dependencias + BD + respaldo)
 *   node crm/dev.js --migrate       # levanta todo y, al final, refresca la BD `crm`
 *                                   #   desde la del ecommerce (destructivo)
 *   node crm/dev.js --stop [flags]  # detiene lo levantado (o solo lo seleccionado)
 *   node crm/dev.js --help
 *
 * Un argumento desconocido no levanta nada (aborta; usa --help para ver las opciones).
 *
 * Dependencias locales: si faltan node_modules (backend/web) o .venv (ia/ml),
 * se instalan automáticamente antes de arrancar.
 *
 * Dependencias externas (no las levanta este script):
 *   - SMS (Vassago/sms_service) para la prueba de envío.
 *
 * Bases de datos propias del CRM (crm/db, docker):
 *   crm :5437 (operativa) · analytics :5436 (réplica del legado, la leen los MLs).
 *
 * Restaurar/migrar NO depende de bash: está implementado en Node para que
 * funcione igual en Windows (los .sh de db/ quedan para uso manual).
 *
 * Logs: crm/logs/*.log · PIDs: crm/logs/.pids.json.
 */
const cp = require("node:child_process");
// En Windows, un proceso con `detached` y sin `windowsHide` abre una terminal
// nueva por servicio. Se envuelven spawn/spawnSync para ocultarla siempre (en
// otros SO la opción se ignora).
const spawn = (cmd, args, opts = {}) => cp.spawn(cmd, args, { windowsHide: true, ...opts });
const spawnSync = (cmd, args, opts = {}) => cp.spawnSync(cmd, args, { windowsHide: true, ...opts });
const crypto = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const IS_WIN = process.platform === "win32";

const ROOT = __dirname;
const LOGS_DIR = path.join(ROOT, "logs");
const PIDS_FILE = path.join(LOGS_DIR, ".pids.json");
const BACKUPS_DIR = path.join(ROOT, "db", "backups");
// Respaldos propios de la BD operativa `crm` (--backup-db / --restore-db):
// solo datos (campañas, catálogo, pedidos, clientes, usuarios). La réplica
// analytics (:5436) y las imágenes no entran en el volcado.
const CRM_BACKUPS_DIR = path.join(ROOT, "backups");

// Contenedor/BD de la réplica analytics (restore desde db/backups).
const DB_CONTAINER = process.env.DB_CONTAINER || "analytics_postgres";
const DB_NAME = process.env.DB_NAME || "analytics";
// BD operativa del CRM (destino de --migrate) y origen en el ecommerce.
const DST_CONTAINER = process.env.DST_CONTAINER || "crm_postgres";
const DST_DB = process.env.DST_DB || "crm";
const SRC_CONTAINER = process.env.SRC_CONTAINER || "ecommerce_postgres";
const SRC_DB = process.env.SRC_DB || "ecommerce";

const SERVICES = [
  // `db` levanta el compose de crm/db, que trae LAS DOS bases del proyecto:
  //   analytics :5436 (réplica del ML) · crm :5437 (operativa: campañas, catálogo…)
  { name: "db", port: 5436, kind: "docker", dir: "db" },
  { name: "backend", port: 3100, kind: "node", dir: "backend", install: ["npm", "install"], dev: ["npm", "run", "dev"], prod: ["npm", "run", "start:prod"] },
  { name: "web", port: 8444, kind: "node", dir: "interface web", install: ["pnpm", "install"], dev: ["pnpm", "run", "dev"], prod: ["pnpm", "run", "preview"] },
  { name: "ia", port: 8002, kind: "python", dir: "ia-service" },
  { name: "clustering", port: 8010, kind: "python", dir: "ml/clustering-api" },
  { name: "xgboost", port: 8011, kind: "python", dir: "ml/xgboost-api" },
  { name: "uplift", port: 8012, kind: "python", dir: "ml/uplift-api" },
];

/** Servicios de ML que comparten ADMIN_KEY y (clustering) la BD analytics. */
const ML_SERVICES = new Set(["clustering", "xgboost", "uplift"]);

const C = { db: "\x1b[36m", backend: "\x1b[31m", web: "\x1b[32m", ia: "\x1b[33m", clustering: "\x1b[35m", xgboost: "\x1b[34m", uplift: "\x1b[95m", reset: "\x1b[0m" };

/** `--init`: revisa que las dependencias estén completas (no solo que exista
 *  `node_modules`). Evita reinstalar siempre, que reescribiría los lockfiles. */
let FORCE_INSTALL = false;

/** Binarios que deben existir para dar por instaladas las dependencias. */
const NODE_REQUIRED_BINS = { backend: ["nest", "dotenvx"], web: ["vite"] };

/** ¿Están las dependencias del servicio (node_modules + binarios clave)? */
function nodeDepsComplete(svc) {
  const dir = path.join(ROOT, svc.dir);
  if (!fs.existsSync(path.join(dir, "node_modules"))) return false;
  const bins = NODE_REQUIRED_BINS[svc.name];
  if (!bins) return true;
  return bins.every((bin) => {
    const base = path.join(dir, "node_modules", ".bin", bin);
    return fs.existsSync(base) || fs.existsSync(`${base}.cmd`);
  });
}

/** Flags `--x` reconocidos. Cualquier otro aborta (no se levanta nada). */
const VALID_FLAGS = new Set([
  "--prod",
  "--live",
  "--stop",
  "--help",
  "--restore",
  "--migrate",
  "--backup-db",
  "--restore-db",
  "--init",
  "--ml",
  ...SERVICES.map((s) => `--${s.name}`),
]);

/** Argumentos no reconocidos: flags `--x` fuera de VALID_FLAGS o cualquier posicional. */
function unknownFlags(argv) {
  return argv.filter((a) => {
    const lower = a.toLowerCase();
    if (VALID_FLAGS.has(lower)) return false;
    // `--restore-db=<ruta>` restaura un respaldo concreto de `backups/`.
    if (lower.startsWith("--restore-db=")) return false;
    return true;
  });
}

// ── Utilidades ──────────────────────────────────────────────

function waitForPort(port, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const attempt = () => {
      const sock = net.connect({ host: "127.0.0.1", port });
      const done = (ok) => {
        try { sock.destroy(); } catch { /* noop */ }
        resolve(ok);
      };
      sock.once("connect", () => done(true));
      sock.once("error", () => {
        try { sock.destroy(); } catch { /* noop */ }
        if (Date.now() > deadline) done(false);
        else setTimeout(attempt, 1000);
      });
    };
    attempt();
  });
}

function sleepSync(ms) {
  const sab = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(sab), 0, 0, ms);
}

/** Libera el puerto de un proceso previo. Windows: netstat + taskkill; Linux: fuser; macOS: lsof. */
function killPort(port) {
  if (IS_WIN) {
    try {
      const out = spawnSync("netstat", ["-ano"], { encoding: "utf8" }).stdout || "";
      const pids = new Set();
      for (const line of out.split("\n")) {
        const m = line.trim().match(new RegExp(`:${port}\\s+.*?LISTENING\\s+(\\d+)\\s*$`));
        if (m) pids.add(m[1]);
      }
      pids.forEach((pid) => {
        try { spawnSync("taskkill", ["/PID", pid, "/T", "/F"], { stdio: "ignore" }); } catch { /* ya terminó */ }
      });
      if (pids.size) console.log(`  ✓ puerto ${port} liberado (PID ${[...pids].join(", ")})`);
    } catch {
      /* sin procesos */
    }
    return;
  }
  // POSIX: `fuser` (Linux). macOS no trae `fuser` → fallback a `lsof`.
  const fuser = spawnSync("fuser", ["-k", `${port}/tcp`], {
    stdio: ["ignore", "pipe", "ignore"], encoding: "utf8",
  });
  let out = (fuser.stdout || "").toString().trim();
  if (fuser.error || fuser.status === null) {
    const lsof = spawnSync("lsof", ["-ti", `tcp:${port}`], { encoding: "utf8" });
    out = (lsof.stdout || "").trim();
    for (const pid of out.split("\n").filter(Boolean)) {
      try { process.kill(Number(pid), "SIGKILL"); } catch { /* ya terminó */ }
    }
  }
  if (out) console.log(`  ✓ puerto ${port} liberado (PID ${out.split("\n").join(", ")})`);
}

/** Anexa la cabecera de arranque al log del servicio. */
function writeLogHeader(name) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  fs.appendFileSync(
    path.join(LOGS_DIR, `${name}.log`),
    `\n===== [${name}] ${new Date().toISOString()} =====\n`,
  );
}

/** Abre el log del servicio en modo append y devuelve el file descriptor. */
function openLog(name) {
  writeLogHeader(name);
  return fs.openSync(path.join(LOGS_DIR, `${name}.log`), "a");
}

/** Últimas líneas no vacías del log de un servicio, para diagnosticar un
 * arranque fallido sin abrir el archivo (en el servidor es la única pista). */
function tailLog(name, lines = 25) {
  try {
    const text = fs.readFileSync(path.join(LOGS_DIR, `${name}.log`), "utf8");
    return text.split(/\r?\n/).filter((l) => l.trim()).slice(-lines);
  } catch {
    return null;
  }
}

/** Servicios elegidos por flags (sin flags de selección ⇒ todos). */
function selectServices(argv) {
  const flags = argv.filter((a) => a.startsWith("--")).map((a) => a.slice(2).toLowerCase());
  const known = new Set(SERVICES.map((s) => s.name));
  const chosen = flags.filter((f) => known.has(f));
  // `--ml` agrupa los tres servicios de modelos.
  if (flags.includes("ml")) chosen.push("clustering", "xgboost", "uplift");
  if (!chosen.length) return SERVICES;
  return SERVICES.filter((s) => chosen.includes(s.name));
}

// ── Docker ──────────────────────────────────────────────────

/** Ejecuta `docker …`. Por defecto devuelve stdout/stderr como texto. */
function docker(args, opts = {}) {
  return spawnSync("docker", args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: 120000,
    ...opts,
  });
}

function containerRunning(name) {
  const r = docker(["inspect", "-f", "{{.State.Running}}", name], { timeout: 20000 });
  return r.status === 0 && (r.stdout || "").trim() === "true";
}

// ── Docker: CLI correcto y motor disponible ────────────────
// En Windows el motor puede estar en Docker Desktop (una instancia por usuario)
// o en un WSL antiguo con la API en loopback. Un `DOCKER_HOST` heredado que ya
// no responde es la causa mas comun de "Docker no esta disponible", asi que se
// descarta antes de rendirse: `node dev.js` debe funcionar sin lanzadores
// externos.

const DOCKER_DESKTOP_BIN = "C:\\Program Files\\Docker\\Docker\\resources\\bin";
const DOCKER_DESKTOP_EXE = "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe";

const fileExists = (p) => {
  try {
    return Boolean(p) && fs.existsSync(p);
  } catch {
    return false;
  }
};

/** Carpetas con `docker.exe`, en orden de preferencia. */
function dockerCliDirs() {
  if (process.platform !== "win32") return [];
  const dirs = [DOCKER_DESKTOP_BIN];
  if (process.env.LOCALAPPDATA) {
    dirs.push(path.join(process.env.LOCALAPPDATA, "Docker", "Docker", "resources", "bin"));
  }
  dirs.push("C:\\DockerCLI");
  return dirs.filter((dir) => fileExists(path.join(dir, "docker.exe")));
}

/** Ejecutable de Docker Desktop, si esta instalado. */
function dockerDesktopExe() {
  if (process.platform !== "win32") return null;
  const candidates = [DOCKER_DESKTOP_EXE];
  if (process.env.LOCALAPPDATA) {
    candidates.push(path.join(process.env.LOCALAPPDATA, "Docker", "Docker Desktop.exe"));
  }
  return candidates.find((exe) => fileExists(exe)) || null;
}

function dockerAnswers() {
  const r = spawnSync("docker", ["info"], {
    stdio: "ignore",
    timeout: 25000,
  });
  return r.status === 0;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let dockerReady = null;

/**
 * Deja `docker` utilizable en este proceso: prioriza el CLI de Docker Desktop,
 * descarta un DOCKER_HOST que no responde y, en Windows, arranca Docker
 * Desktop si hace falta. Devuelve true si el motor responde.
 * `MERCALDAS_NO_DOCKER_AUTOSTART=1` evita arrancarlo automaticamente.
 */
async function ensureDocker({ timeoutMs = 120000 } = {}) {
  if (dockerReady !== null) return dockerReady;
  const note = (msg) => console.log(`${C.db}[docker]${C.reset} ${msg}`);

  const dirs = dockerCliDirs();
  if (dirs.length) {
    const current = (process.env.PATH || "").split(";").map((dir) => dir.trim().toLowerCase());
    const missing = dirs.filter((dir) => !current.includes(dir.toLowerCase()));
    if (missing.length) process.env.PATH = `${missing.join(";")};${process.env.PATH || ""}`;
  }

  if (dockerAnswers()) {
    dockerReady = true;
    return true;
  }

  if (process.env.DOCKER_HOST) {
    const broken = process.env.DOCKER_HOST;
    delete process.env.DOCKER_HOST;
    if (dockerAnswers()) {
      note(`se descarto DOCKER_HOST=${broken} (no responde); se usa el motor local.`);
      dockerReady = true;
      return true;
    }
  }

  const exe = process.env.MERCALDAS_NO_DOCKER_AUTOSTART ? null : dockerDesktopExe();
  if (exe) {
    note("Docker Desktop no responde; iniciandolo (puede tardar un minuto)...");
    try {
      cp.spawn(exe, [], { detached: true, stdio: "ignore", windowsHide: true }).unref();
    } catch {
      /* si no se puede lanzar, se informa abajo */
    }
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await sleep(3000);
      if (dockerAnswers()) {
        note("✅ Docker Desktop listo");
        dockerReady = true;
        return true;
      }
    }
    note("⚠️  Docker Desktop no respondio a tiempo; revise su ventana (licencia/login).");
  }

  dockerReady = false;
  return false;
}

// ── Restaurar analytics desde db/backups (multiplataforma) ──

/** Elige el backup a restaurar: el volcado completo más reciente o, si solo
 *  están las partes versionadas (clon nuevo), el conjunto de partes más
 *  reciente. Devuelve `{ files, shaFile }` con rutas absolutas. */
function pickBackup() {
  let entries = [];
  try { entries = fs.readdirSync(BACKUPS_DIR); } catch { return null; }

  const groups = new Map(); // base -> { base, files, mtime }
  for (const name of entries) {
    let base = null;
    if (name.endsWith(".backup")) base = name;
    else if (/\.backup\.part-\d+$/.test(name)) base = name.replace(/\.part-\d+$/, "");
    else continue;
    let mtime = 0;
    try { mtime = fs.statSync(path.join(BACKUPS_DIR, name)).mtimeMs; } catch { continue; }
    const g = groups.get(base) ?? { base, files: [], mtime: 0 };
    g.files.push(name);
    g.mtime = Math.max(g.mtime, mtime);
    groups.set(base, g);
  }

  const list = [...groups.values()];
  if (!list.length) return null;
  // Más reciente: por la fecha del nombre (analytics_YYYY-MM-DD.backup) cuando
  // ambos la traen —en un clon/copia recién hecha los mtimes no son de fiar—;
  // si no, por mtime; a igualdad, por nombre.
  const dateOf = (base) => {
    const m = base.match(/(\d{4}-\d{2}-\d{2})/);
    return m ? Date.parse(`${m[1]}T00:00:00Z`) : null;
  };
  list.sort((a, b) => {
    const da = dateOf(a.base);
    const db = dateOf(b.base);
    if (da && db && da !== db) return db - da;
    return (b.mtime - a.mtime) || b.base.localeCompare(a.base);
  });

  const g = list[0];
  // Si está el volcado completo, se usa ese; si no, se reensamblan las partes
  // en orden NUMÉRICO (lexicográfico rompería con partes sin zero-padding).
  const full = g.files.find((n) => n.endsWith(".backup"));
  const partNum = (n) => {
    const m = n.match(/\.part-(\d+)$/);
    return m ? Number(m[1]) : 0;
  };
  const ordered = g.files.slice().sort((a, b) => partNum(a) - partNum(b));
  const files = (full ? [full] : ordered).map((n) => path.join(BACKUPS_DIR, n));
  return { files, shaFile: path.join(BACKUPS_DIR, `${g.base}.sha256`) };
}

function sha256File(file) {
  const h = crypto.createHash("sha256");
  const fd = fs.openSync(file, "r");
  const buf = Buffer.alloc(1024 * 1024);
  try {
    let n;
    while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n));
  } finally {
    fs.closeSync(fd);
  }
  return h.digest("hex");
}

/** Concatena `files` en `dest` y devuelve el sha256 del volcado resultante. */
function assembleAndHash(files, dest) {
  const h = crypto.createHash("sha256");
  const buf = Buffer.alloc(1024 * 1024);
  const out = fs.openSync(dest, "w");
  try {
    for (const f of files) {
      const fd = fs.openSync(f, "r");
      try {
        let n;
        while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
          h.update(buf.subarray(0, n));
          fs.writeSync(out, buf, 0, n);
        }
      } finally {
        fs.closeSync(fd);
      }
    }
  } finally {
    fs.closeSync(out);
  }
  return h.digest("hex");
}

function readSha256(file) {
  try {
    const first = fs.readFileSync(file, "utf8").trim().split(/\s+/)[0];
    return /^[0-9a-f]{64}$/i.test(first) ? first.toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * Restaura la réplica `analytics` desde db/backups (equivalente a
 * db/restore.sh, pero sin bash: funciona en Windows). Verifica el sha256,
 * reensambla las partes si hace falta y comprueba los conteos.
 * Sin `force`, solo restaura si la BD está vacía.
 */
function restoreAnalytics({ force = false } = {}) {
  const tag = `${C.db}[db]${C.reset}`;

  if (!containerRunning(DB_CONTAINER)) {
    console.warn(`${tag} ⚠️  el contenedor ${DB_CONTAINER} no está corriendo; no se puede restaurar analytics`);
    return false;
  }

  if (!force) {
    const q = docker(
      ["exec", DB_CONTAINER, "psql", "-U", "postgres", "-d", DB_NAME, "-tAc", "SELECT count(*) FROM pos.clientes"],
      { timeout: 20000 },
    );
    const count = (q.stdout || "").trim();
    if (q.status === 0 && count && count !== "0") return true; // ya tiene datos
    console.log(`${tag} 📦 BD analytics vacía → restaurando desde db/backups (puede tardar)...`);
  } else {
    console.log(`${tag} 📦 Restaurando analytics desde db/backups (forzado; sobrescribe la BD)...`);
  }

  const bk = pickBackup();
  if (!bk) {
    console.warn(`${tag} ⚠️  no encontré backups en db/backups (ver docs/backups-analytics.md)`);
    return false;
  }

  // Volcado completo → se usa tal cual; solo partes → se reensamblan.
  let dump = bk.files[0];
  let tmp = null;
  let actual = null;
  if (bk.files.length > 1 || !bk.files[0].endsWith(".backup")) {
    tmp = path.join(os.tmpdir(), "analytics_restore.dump");
    actual = assembleAndHash(bk.files, tmp);
    dump = tmp;
  } else if (fs.existsSync(bk.shaFile)) {
    actual = sha256File(dump);
  }

  if (actual) {
    const expected = readSha256(bk.shaFile);
    if (expected && expected !== actual) {
      console.warn(`${tag} ✘ el volcado NO coincide con su sha256 (${path.basename(bk.shaFile)}); no se restaura`);
      if (tmp) fs.rmSync(tmp, { force: true });
      return false;
    }
    if (expected) console.log(`${tag} ✓ sha256 OK`);
  }

  const cp = docker(["cp", dump, `${DB_CONTAINER}:/tmp/analytics_restore.dump`], { stdio: "inherit", timeout: 600000 });
  if (tmp) fs.rmSync(tmp, { force: true });
  if (cp.status !== 0) {
    console.warn(`${tag} ⚠️  no se pudo copiar el volcado al contenedor`);
    return false;
  }

  console.log(`${tag} ♻️  pg_restore en ${DB_NAME}...`);
  const pr = docker(
    ["exec", DB_CONTAINER, "pg_restore", "-U", "postgres", "-d", DB_NAME, "-j", "4",
      "--clean", "--if-exists", "--no-owner", "--no-privileges", "/tmp/analytics_restore.dump"],
    { stdio: "inherit", timeout: 1800000 },
  );
  docker(["exec", DB_CONTAINER, "rm", "-f", "/tmp/analytics_restore.dump"], { stdio: "ignore" });
  if (pr.status !== 0) {
    console.log(`${tag}    pg_restore exit=${pr.status} (los avisos benignos no impiden la restauración)`);
  }

  const v = docker(
    ["exec", DB_CONTAINER, "psql", "-U", "postgres", "-d", DB_NAME, "-tAc",
      "SELECT 'vw_rfm_clientes=' || count(*) FROM analytics.vw_rfm_clientes " +
      "UNION ALL SELECT 'cliente_segmento=' || count(*) FROM analytics.cliente_segmento " +
      "UNION ALL SELECT 'pos.clientes=' || count(*) FROM pos.clientes " +
      "UNION ALL SELECT 'pos.venta_lineas=' || count(*) FROM pos.venta_lineas"],
    { timeout: 120000 },
  );
  const verified = v.status === 0 && !!(v.stdout || "").trim();
  if (verified) console.log(`${tag} ${v.stdout.trim().split("\n").join(" · ")}`);

  if (verified) {
    console.log(`${tag} ✅ BD analytics restaurada`);
    return true;
  }
  console.warn(`${tag} ⚠️  pg_restore exit=${pr.status} y no se pudieron verificar los conteos`);
  return false;
}

// ── Migrar la operativa desde el ecommerce (multiplataforma) ──

/**
 * Restaura la BD operativa `crm` (:5437) desde la del ecommerce (`--migrate`).
 * Equivalente a db/migrate-from-ecommerce.sh, sin bash. Corre DESPUÉS de
 * levantar el proyecto y sobrescribe el contenido de `crm`.
 */
function migrateOperationalDb() {
  const tag = `${C.db}[db]${C.reset}`;
  console.log(`\n${tag} ♻️  Migrando la BD operativa (${DST_DB} :5437) desde el ecommerce (${SRC_DB} :5432)...`);
  console.log(`${tag}    ⚠️  Sobrescribe campañas, catálogo, pedidos, clientes y usuarios locales.`);

  for (const c of [SRC_CONTAINER, DST_CONTAINER]) {
    if (!containerRunning(c)) {
      console.warn(`${tag} ⚠️  el contenedor '${c}' no está corriendo; no se migra nada`);
      return false;
    }
  }

  const dump = path.join(os.tmpdir(), `crm_migrate_${new Date().toISOString().slice(0, 10)}.dump`);
  console.log(`${tag} 📦 Volcando ${SRC_DB}...`);
  const fd = fs.openSync(dump, "w");
  const d = spawnSync(
    "docker",
    ["exec", SRC_CONTAINER, "pg_dump", "-U", "postgres", "-d", SRC_DB, "-Fc", "--no-owner", "--no-privileges"],
    { stdio: ["ignore", fd, "inherit"], timeout: 1800000 },
  );
  fs.closeSync(fd);
  if (d.status !== 0) {
    fs.rmSync(dump, { force: true });
    console.warn(`${tag} ⚠️  falló pg_dump sobre ${SRC_CONTAINER}/${SRC_DB}`);
    return false;
  }

  const cp = docker(["cp", dump, `${DST_CONTAINER}:/tmp/crm_migrate.dump`], { stdio: "inherit", timeout: 900000 });
  fs.rmSync(dump, { force: true });
  if (cp.status !== 0) {
    console.warn(`${tag} ⚠️  no se pudo copiar el dump a ${DST_CONTAINER}`);
    return false;
  }

  console.log(`${tag} ♻️  Restaurando en ${DST_DB} (--clean --if-exists)...`);
  const r = docker(
    ["exec", DST_CONTAINER, "pg_restore", "-U", "postgres", "-d", DST_DB, "--no-owner", "--no-privileges",
      "--clean", "--if-exists", "--jobs", "4", "/tmp/crm_migrate.dump"],
    { timeout: 1800000 },
  );
  const out = `${r.stdout || ""}${r.stderr || ""}`
    .split("\n")
    .filter((l) => l.trim() && !/does not exist, skipping/.test(l))
    .join("\n");
  if (out) console.log(out);
  docker(["exec", DST_CONTAINER, "rm", "-f", "/tmp/crm_migrate.dump"], { stdio: "ignore" });

  const v = docker(
    ["exec", DST_CONTAINER, "psql", "-U", "postgres", "-d", DST_DB, "-tAc",
      "SELECT 'campaigns=' || (SELECT count(*) FROM campaigns)" +
      " || ' products=' || (SELECT count(*) FROM products)" +
      " || ' customers=' || (SELECT count(*) FROM customers)" +
      " || ' orders=' || (SELECT count(*) FROM orders)" +
      " || ' users=' || (SELECT count(*) FROM users)" +
      " || ' campaign_recipients=' || (SELECT count(*) FROM campaign_recipients)"],
    { timeout: 120000 },
  );
  if (v.status === 0 && (v.stdout || "").trim()) console.log(`${tag} 🔎 ${v.stdout.trim()}`);
  else console.warn(`${tag} ⚠️  no se pudieron verificar los conteos`);

  console.log(`${tag} ✅ BD operativa migrada. Si el backend ya estaba arriba, reinícialo (node dev.js --backend).`);
  return true;
}

// ── Respaldo / restauración de la BD operativa `crm` ──────────
// `--backup-db` vuelca solo la base operativa (campañas, catálogo, pedidos,
// clientes, usuarios) a `backups/crm_<fecha>.dump` (+ .sha256). La réplica
// `analytics` (:5436) y las imágenes no entran: analytics ya tiene sus propios
// respaldos en db/backups y la operativa se reconstruye con esto o con --migrate.

/** Corre psql en el contenedor de la operativa y devuelve { status, stdout, stderr }. */
function psqlOperational(sql, { database = DST_DB, tuples = false, timeout = 30000 } = {}) {
  const args = [
    "exec", DST_CONTAINER,
    "psql", "-U", "postgres", "-d", database,
    "-v", "ON_ERROR_STOP=1",
  ];
  if (tuples) args.push("-tAc", sql);
  else args.push("-c", sql);
  return docker(args, { timeout });
}

/** Ejecuta `docker …` volcando stdout+stderr al log y devuelve tambien el texto,
 *  para poder explicar el fallo en pantalla sin abrir el archivo. */
function dockerLogged(args, fd, { timeout = 900000 } = {}) {
  const r = spawnSync("docker", args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout,
  });
  const text = `${r.stdout || ""}${r.stderr || ""}`;
  if (text.trim()) {
    try {
      fs.writeSync(fd, text.endsWith("\n") ? text : `${text}\n`);
    } catch {
      /* el log ya se cerro */
    }
  }
  return { status: r.status, signal: r.signal, text };
}

/** Espera a que PostgreSQL acepte conexiones de verdad, no solo a que el puerto
 *  este publicado: en un arranque en frio docker-proxy abre :5437 antes de que
 *  el servidor termine de inicializar, y un `psql`/`pg_restore` lanzado en esa
 *  ventana muere (codigo 137) dejando la base a medias. */
async function waitForPg(database = "postgres", timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  for (;;) {
    const r = docker(
      ["exec", DST_CONTAINER, "pg_isready", "-U", "postgres", "-d", database],
      { timeout: 20000 },
    );
    if (r.status === 0) return true;
    last = `${r.stdout || ""}${r.stderr || ""}`.trim().split("\n").filter(Boolean).pop() || "";
    if (Date.now() > deadline) {
      if (last) console.warn(`${C.db}[db]${C.reset} ⚠️  ${last}`);
      return false;
    }
    // Si el contenedor se cayo o se reinicio, se intenta levantar de nuevo.
    if (!containerRunning(DST_CONTAINER)) docker(["start", DST_CONTAINER], { timeout: 120000 });
    await sleep(2000);
  }
}

/** Deja lista la base operativa SIN recrearla: la crea solo si falta.
 *  Reemplazar la base (drop + create) era el paso fragil en Windows, donde el
 *  contenedor puede reiniciarse o ser matado (137) justo despues del DROP.
 *  Devuelve el motivo del fallo, o null si la base existe y responde. */
async function ensureDatabaseExists() {
  const exists = () =>
    psqlOperational(
      `SELECT 1 FROM pg_database WHERE datname = '${DST_DB.replace(/'/g, "''")}'`,
      { database: "postgres", tuples: true, timeout: 20000 },
    );

  let failure = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const check = exists();
    if (check.status === 0) {
      if ((check.stdout || "").trim() === "1") return null;
      const create = psqlOperational(`CREATE DATABASE "${DST_DB}"`, {
        database: "postgres",
        timeout: 60000,
      });
      if (create.status === 0) return null;
      const err = `${create.stderr || ""}${create.stdout || ""}`.trim();
      // Dos procesos creando a la vez: si ya existe, sirve igual.
      if (/already exists/i.test(err)) return null;
      failure = `no se pudo crear la base "${DST_DB}" (codigo ${create.status})` +
        (err ? `: ${err.split("\n").filter(Boolean).pop()}` : "");
    } else {
      const err = `${check.stderr || ""}${check.stdout || ""}`.trim();
      failure = `PostgreSQL no acepto la consulta (codigo ${check.status})` +
        (err ? `: ${err.split("\n").filter(Boolean).pop()}` : "");
    }
    if (attempt === 4) break;
    console.warn(`${C.db}[db]${C.reset} ⚠️  ${failure} — reintento ${attempt}/3...`);
    await sleep(3000 * attempt);
    await waitForPg("postgres", 30000);
  }
  return failure;
}

/** Fecha local `YYYY-MM-DD_HHmm`, para nombrar los respaldos. */
function backupStamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}_${p(date.getHours())}${p(date.getMinutes())}`;
}

/** ¿La BD operativa `crm` tiene esquema? (tabla clave `campaigns`). */
function dbIsInitialized() {
  const r = psqlOperational("SELECT to_regclass('public.campaigns') IS NOT NULL", { tuples: true });
  if (r.status !== 0) return null;
  return (r.stdout || "").trim() === "t";
}

/** Conteos de las tablas clave de la operativa, para verificar el respaldo. */
function dbCounts() {
  const r = psqlOperational(
    "SELECT 'campaigns=' || (SELECT count(*) FROM campaigns)" +
      " || ' products=' || (SELECT count(*) FROM products)" +
      " || ' customers=' || (SELECT count(*) FROM customers)" +
      " || ' orders=' || (SELECT count(*) FROM orders)" +
      " || ' users=' || (SELECT count(*) FROM users)",
    { tuples: true },
  );
  const out = (r.stdout || "").trim();
  return out || "(no se pudieron contar las tablas)";
}

/** Respaldos propios en `backups/`, del más reciente al más antiguo.
 *  Cada respaldo puede ser un único `crm_<fecha>.dump` o un grupo de partes
 *  `crm_<fecha>.dump.part-NNN` (troceado para git). Devuelve `{label,dir,files}`. */
function listLocalBackups() {
  if (!fs.existsSync(CRM_BACKUPS_DIR)) return [];
  const groups = new Map();
  for (const e of fs.readdirSync(CRM_BACKUPS_DIR, { withFileTypes: true })) {
    if (!e.isFile()) continue;
    const match = e.name.match(/^(crm_.+?\.dump)(?:\.part-\d+)?$/i);
    if (!match) continue;
    const base = match[1];
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base).push(e.name);
  }
  return [...groups.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([base, names]) => {
      const single = names.find((n) => n.toLowerCase() === base.toLowerCase());
      const files = single
        ? [single]
        : names.filter((n) => /\.dump\.part-\d+$/i.test(n)).sort();
      return {
        label: path.relative(ROOT, path.join(CRM_BACKUPS_DIR, base)),
        dir: CRM_BACKUPS_DIR,
        files: files.map((n) => path.join(CRM_BACKUPS_DIR, n)),
      };
    });
}

/** Respaldo a restaurar. `explicit` es una ruta (--restore-db=<ruta>). */
function resolveBackupSource(explicit = null) {
  if (explicit) {
    const file = path.isAbsolute(explicit) ? explicit : path.join(ROOT, explicit);
    if (!fs.existsSync(file)) return { error: `No existe el archivo ${explicit}.` };
    return { label: path.relative(ROOT, file), dir: path.dirname(file), files: [file] };
  }
  const local = listLocalBackups();
  if (!local.length) {
    return {
      error: `No hay respaldos en ${path.relative(ROOT, CRM_BACKUPS_DIR)}/ (usa node dev.js --backup-db).`,
    };
  }
  return local[0];
}

/** Lee el respaldo (reensamblando partes) y valida su sha256. */
function loadBackup(source) {
  const buffer = Buffer.concat(source.files.map((f) => fs.readFileSync(f)));
  // El hash se llama `crm_<fecha>.dump.sha256` (versionado) o `<archivo>.sha256`
  // (lo que escribe --backup-db sobre un dump único).
  const base = source.files[0].replace(/\.part-\d+$/i, "");
  const candidates = [`${base}.sha256`, ...source.files.map((f) => `${f}.sha256`)];
  const shaFile = candidates.find((p) => fs.existsSync(p));
  if (shaFile) {
    const expected = fs.readFileSync(shaFile, "utf8").trim().split(/\s+/)[0];
    const actual = crypto.createHash("sha256").update(buffer).digest("hex");
    if (expected && expected !== actual) {
      return {
        error: `El respaldo no coincide con su hash (esperado ${expected.slice(0, 12)}…, obtenido ${actual.slice(0, 12)}…).`,
      };
    }
  }
  return { ...source, buffer };
}

/** Copia el respaldo al contenedor y lo aplica con `pg_restore --clean
 *  --if-exists` sobre la base existente (sin DROP/CREATE DATABASE). */
async function restoreBackup(backup) {
  const hostTmp = path.join(LOGS_DIR, "crm_restore.dump");
  const relTmp = path.relative(ROOT, hostTmp).split(path.sep).join("/");
  const containerTmp = "/tmp/crm_restore.dump";
  const fd = openLog("db");
  let status = 1;
  let failure = null;
  try {
    fs.writeFileSync(hostTmp, backup.buffer);

    failure = await ensureDatabaseExists();

    if (!failure && !(await waitForPg(DST_DB, 120000))) {
      failure = `PostgreSQL no acepta conexiones en la base "${DST_DB}"`;
    }

    if (!failure) {
      const cp = dockerLogged(["cp", relTmp, `${DST_CONTAINER}:${containerTmp}`], fd, { timeout: 120000 });
      if (cp.status !== 0) {
        failure = `no se pudo copiar el volcado al contenedor (codigo ${cp.status})`;
      }
    }

    if (!failure) {
      console.log(`${C.db}[db]${C.reset} ♻️  Aplicando pg_restore sobre "${DST_DB}" (--clean --if-exists)...`);
      const args = [
        "exec", DST_CONTAINER,
        "pg_restore", "-U", "postgres", "-d", DST_DB,
        "--no-owner", "--no-privileges", "--clean", "--if-exists",
        containerTmp,
      ];
      // Hasta 3 pasadas: si el contenedor se reinicia o el proceso muere (137),
      // --clean deja la base consistente y la siguiente pasada la completa.
      for (let attempt = 1; attempt <= 3; attempt++) {
        const r = dockerLogged(args, fd, { timeout: 1800000 });
        status = r.status === null ? 1 : r.status;
        if (status === 0) break;
        const interrupted = status === 137 || status === 143 || Boolean(r.signal);
        if (!interrupted || attempt === 3) break;
        console.warn(
          `${C.db}[db]${C.reset} ⚠️  pg_restore se interrumpio (codigo ${status}); reintento ${attempt}/2...`,
        );
        await sleep(5000);
        await waitForPg(DST_DB, 60000);
      }
    }
  } finally {
    docker(["exec", DST_CONTAINER, "rm", "-f", containerTmp], { stdio: "ignore", timeout: 30000 });
    fs.closeSync(fd);
    fs.rmSync(hostTmp, { force: true });
  }

  // La verdad la da la base, no el codigo de salida: pg_restore devuelve 1 si
  // alguna sentencia aviso aunque los datos hayan quedado completos.
  let initialized = dbIsInitialized();
  if (initialized !== true && !failure) {
    await waitForPg(DST_DB, 30000);
    initialized = dbIsInitialized();
  }
  if (failure || initialized !== true) {
    console.warn(
      `${C.db}[db]${C.reset} ⚠️  La restauracion fallo (codigo ${status}; detalle en logs/db.log).` +
        (failure ? ` ${failure}` : ""),
    );
    if (status === 137 || status === 143) {
      console.warn(
        `${C.db}[db]${C.reset} 💡 El proceso fue matado dentro del contenedor (137 = SIGKILL).` +
          " Si se repite, sube la memoria de Docker Desktop (Settings › Resources) a 6-8 GB y reintenta.",
      );
    }
    const tail = tailLog("db", 20);
    if (tail && tail.length) {
      console.warn(`${C.db}[db]${C.reset} ── ultimas lineas de logs/db.log ──`);
      tail.forEach((line) => console.warn(`   ${line}`));
      console.warn(`${C.db}[db]${C.reset} ─────────────────────────────────────────`);
    }
    return false;
  }

  if (status !== 0) {
    console.warn(
      `${C.db}[db]${C.reset} ⚠️  pg_restore reporto avisos (codigo ${status}); la base quedo con datos (ver logs/db.log).`,
    );
  }
  console.log(`${C.db}[db]${C.reset} ✅ Respaldo restaurado — ${dbCounts()}`);
  return true;
}

/** Asegura Docker y el contenedor `crm_postgres` (puerto :5437). */
async function ensureOperationalDb() {
  await ensureDocker();
  if (!containerRunning(DST_CONTAINER)) {
    console.log(`${C.db}[db]${C.reset} 🐘 PostgreSQL del CRM (docker compose up -d)...`);
    const r = spawnSync("docker", ["compose", "up", "-d", "--wait"], {
      cwd: path.join(ROOT, "db"), stdio: "ignore", timeout: 180000,
    });
    if (r.status !== 0) {
      console.warn(`${C.db}[db]${C.reset} ⚠️  no se pudo levantar la BD (docker compose).`);
      return false;
    }
  }
  if (!(await waitForPort(5437, 90000))) {
    console.error(`${C.db}[db]${C.reset} ✘ PostgreSQL no responde en :5437.`);
    return false;
  }
  if (!(await waitForPg("postgres", 120000))) {
    console.error(`${C.db}[db]${C.reset} ✘ PostgreSQL no acepta conexiones en :5437 (ver logs/db.log).`);
    return false;
  }
  return true;
}

/** `node dev.js --restore-db[=<archivo>]`: deja la BD `crm` como el respaldo. */
async function runRestoreDb(file = null) {
  const source = resolveBackupSource(file);
  if (source.error) {
    console.error(`${C.db}[db]${C.reset} ✘ ${source.error}`);
    console.error(`${C.db}[db]${C.reset} 💡 Crea un respaldo con: node dev.js --backup-db`);
    return 1;
  }

  console.log(`${C.db}[db]${C.reset} 📦 Restaurando la BD operativa desde ${source.label}`);
  console.log(`${C.db}[db]${C.reset} ⚠️  El contenido de la base "${DST_DB}" se reemplaza (pg_restore --clean); la base no se recrea.`);
  console.log(`${C.db}[db]${C.reset} ℹ️  La réplica analytics (:5436) no se toca.`);

  if (!(await ensureOperationalDb())) return 1;

  const backup = loadBackup(source);
  if (backup.error) {
    console.error(`${C.db}[db]${C.reset} ✘ ${backup.error}`);
    return 1;
  }

  const mb = (backup.buffer.length / (1024 * 1024)).toFixed(1);
  console.log(`${C.db}[db]${C.reset} 📥 Aplicando ${backup.files.length} archivo(s), ${mb} MB...`);
  return (await restoreBackup(backup)) ? 0 : 1;
}

/** `--init`: deja la BD operativa lista desde cero. Si ya tiene datos no la
toca; si esta vacia restaura el respaldo versionado de `backups/`. */
async function initOperationalDb() {
  if (!(await ensureOperationalDb())) return false;

  if (dbIsInitialized() === true) {
    console.log(`${C.db}[db]${C.reset} ℹ️  La BD ya tiene datos (${dbCounts()}); no se restaura nada.`);
    return true;
  }

  const source = resolveBackupSource(null);
  if (source.error) {
    console.warn(`${C.db}[db]${C.reset} ⚠️  ${source.error}`);
    console.warn(`${C.db}[db]${C.reset} ℹ️  Se levanta con la BD vacia; migra luego con: node dev.js --migrate`);
    return true;
  }

  const backup = loadBackup(source);
  if (backup.error) {
    console.error(`${C.db}[db]${C.reset} ✘ ${backup.error}`);
    return false;
  }

  console.log(`${C.db}[db]${C.reset} 📥 BD vacia: restaurando el respaldo versionado ${source.label}...`);
  return restoreBackup(backup);
}

/** `node dev.js --backup-db`: vuelca la BD operativa `crm` a backups/. */
async function runBackupDb() {
  if (!(await ensureOperationalDb())) return 1;

  if (dbIsInitialized() !== true) {
    console.error(
      `${C.db}[db]${C.reset} ✘ La BD no tiene datos (falta la tabla campaigns): no hay nada que respaldar.`,
    );
    console.error(`${C.db}[db]${C.reset} 💡 Migra primero desde el ecommerce: node dev.js --migrate`);
    return 1;
  }

  fs.mkdirSync(CRM_BACKUPS_DIR, { recursive: true });
  const name = `crm_${backupStamp()}.dump`;
  const hostFile = path.join(CRM_BACKUPS_DIR, name);
  const relFile = path.relative(ROOT, hostFile).split(path.sep).join("/");
  const containerTmp = `/tmp/${name}`;

  console.log(`${C.db}[db]${C.reset} 💾 Volcando la base "${DST_DB}" (solo datos; la réplica analytics no entra)...`);

  const fd = openLog("db");
  try {
    const dump = spawnSync(
      "docker",
      ["exec", DST_CONTAINER, "pg_dump", "-U", "postgres", "-d", DST_DB, "-Fc", "-f", containerTmp],
      { stdio: ["ignore", fd, fd], timeout: 900000 },
    );
    if (dump.status !== 0) {
      console.warn(`${C.db}[db]${C.reset} ⚠️  pg_dump falló (código ${dump.status}; detalle en logs/db.log).`);
      return 1;
    }
    const cp = spawnSync("docker", ["cp", `${DST_CONTAINER}:${containerTmp}`, relFile], {
      cwd: ROOT,
      stdio: ["ignore", fd, fd],
      timeout: 300000,
    });
    if (cp.status !== 0) {
      console.warn(`${C.db}[db]${C.reset} ⚠️  No se pudo copiar el volcado al host (detalle en logs/db.log).`);
      return 1;
    }
  } finally {
    fs.closeSync(fd);
    spawnSync("docker", ["exec", DST_CONTAINER, "rm", "-f", containerTmp], { stdio: "ignore" });
  }

  const buffer = fs.readFileSync(hostFile);
  const hash = crypto.createHash("sha256").update(buffer).digest("hex");
  fs.writeFileSync(`${hostFile}.sha256`, `${hash}\n`);

  const mb = (buffer.length / (1024 * 1024)).toFixed(1);
  console.log(`${C.db}[db]${C.reset} ✅ ${relFile} (${mb} MB)`);
  console.log(`${C.db}[db]${C.reset}    ${dbCounts()}`);
  console.log(`${C.db}[db]${C.reset} 💡 Restaurar: node dev.js --restore-db`);
  return 0;
}

// ── Dependencias ────────────────────────────────────────────

// En Windows los venv viven en .venv\Scripts y el intérprete es python.exe;
// en Linux/macOS en .venv/bin y es `python`.
const VENV_BIN = IS_WIN ? "Scripts" : "bin";

function venvPython(dir) {
  return path.join(dir, ".venv", VENV_BIN, IS_WIN ? "python.exe" : "python");
}

/** Localiza un Python del sistema para crear el venv (Windows: `py -3`). */
function findSystemPython() {
  const candidates = IS_WIN
    ? [["py", ["-3.13"]], ["py", ["-3.12"]], ["py", ["-3"]], ["python", []], ["python3", []]]
    : [["python3.13", []], ["python3.12", []], ["python3", []], ["python", []]];
  for (const [cmd, base] of candidates) {
    try {
      const r = spawnSync(cmd, [...base, "--version"], { stdio: "ignore" });
      if (r.status === 0) return { cmd, base };
    } catch {
      /* no existe: probar el siguiente */
    }
  }
  return null;
}

function ensurePythonVenv(svc) {
  const dir = path.join(ROOT, svc.dir);
  const color = C[svc.name] || "";
  const tag = `${color}[${svc.name}]${C.reset}`;
  if (fs.existsSync(venvPython(dir))) return true;

  // Un .venv no es portable entre sistemas operativos/máquinas. Si el
  // directorio existe pero no el intérprete esperado (p. ej. copiado de Linux a
  // Windows), lo borramos para recrearlo limpio en vez de mezclar estructuras.
  const venvDir = path.join(dir, ".venv");
  if (fs.existsSync(venvDir)) {
    console.log(`${tag} 🧹 .venv existente no válido en este SO; lo recreo.`);
    fs.rmSync(venvDir, { recursive: true, force: true });
  }

  const sysPy = findSystemPython();
  if (!sysPy) {
    console.error(
      `${tag} ✘ no encontré Python 3 en el sistema ` +
        (IS_WIN ? "(instala Python y marca 'Add python.exe to PATH', o usa `py -3`)." : "(instala python3)."),
    );
    return false;
  }

  console.log(`${tag} 📦 creando .venv e instalando dependencias...`);
  const steps = [
    [sysPy.cmd, [...sysPy.base, "-m", "venv", ".venv"]],
    // `python -m pip` es más robusto que invocar el script pip del venv.
    [venvPython(dir), ["-m", "pip", "install", "-r", "requirements.txt"]],
  ];
  for (const [cmd, args] of steps) {
    const r = spawnSync(cmd, args, { cwd: dir, stdio: "inherit", shell: false });
    if (r.status !== 0) {
      console.error(`${tag} ✘ falló: ${[cmd, ...args].join(" ")}`);
      return false;
    }
  }
  return true;
}

/** Comando + args como una sola cadena, para usar `shell` en Windows sin
 *  gatillar el aviso DEP0190 (pasar args junto a shell:true). */
function shellCmd(cmd, args) {
  return [cmd, ...args].map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(" ");
}

/** ¿Está `cmd` en el PATH? (Windows: where · POSIX: which) */
function commandExists(cmd) {
  const probe = spawnSync(IS_WIN ? "where" : "which", [cmd], { stdio: "ignore" });
  return probe.status === 0;
}

/** Instala pnpm global si falta (lo usa el servicio web). */
function ensurePnpm(color = "") {
  const tag = `${color}[web]${C.reset}`;
  if (commandExists("pnpm")) return true;
  console.log(`${tag} 📦 'pnpm' no está instalado → instalándolo globalmente (npm i -g pnpm)...`);
  const r = spawnSync(
    IS_WIN ? "npm install -g pnpm" : "npm",
    IS_WIN ? [] : ["install", "-g", "pnpm"],
    { stdio: "inherit", shell: IS_WIN },
  );
  if (r.status === 0 && commandExists("pnpm")) return true;
  console.error(`${tag} ✘ no se pudo instalar 'pnpm'. Instálalo a mano (npm i -g pnpm) y reintenta.`);
  return false;
}

/** Instala dependencias del servicio si no están (node_modules). */
function ensureNodeDeps(svc) {
  const dir = path.join(ROOT, svc.dir);
  const complete = nodeDepsComplete(svc);
  if (complete && !FORCE_INSTALL) return true;
  if (complete) {
    console.log(`${C[svc.name] || ""}[${svc.name}]${C.reset} ✅ dependencias completas (--init)`);
    return true;
  }
  const color = C[svc.name] || "";
  if (svc.install[0] === "pnpm" && !ensurePnpm(color)) return false;
  console.log(`${color}[${svc.name}]${C.reset} 📦 instalando dependencias (${svc.install.join(" ")})...`);
  const r = spawnSync(
    IS_WIN ? shellCmd(svc.install[0], svc.install.slice(1)) : svc.install[0],
    IS_WIN ? [] : svc.install.slice(1),
    { cwd: dir, stdio: "inherit", shell: IS_WIN }, // npm/pnpm son .cmd en Windows
  );
  if (r.status !== 0) {
    console.error(`${color}[${svc.name}]${C.reset} ✘ falló: ${svc.install.join(" ")}`);
    return false;
  }
  return true;
}

// ── Arranque ────────────────────────────────────────────────

/** Comando de arranque para un servicio. En Windows `npm.cmd` es un batch: si
 *  se interrumpe, cmd.exe queda en "¿Desea terminar el trabajo por lotes
 *  (S/N)?" y el siguiente arranque se queda mudo (log vacío, puerto cerrado).
 *  Lanzar `npm-cli.js` con este mismo node evita el batch por completo y
 *  garantiza que se usa el npm de este node, no el de otro perfil del PATH. */
function nodeLaunchCommand(svc, cmd) {
  if (IS_WIN && svc.kind === "node" && svc.install[0] === "npm") {
    const cli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
    if (fs.existsSync(cli)) return { file: process.execPath, args: [cli, ...cmd.slice(1)], shell: false };
  }
  return { file: cmd[0], args: cmd.slice(1), shell: IS_WIN && svc.kind === "node" };
}

function startService(svc, mode, opts = {}) {
  const color = C[svc.name] || "";
  console.log(`${color}[${svc.name}]${C.reset} ▶ puerto ${svc.port}`);

  if (svc.kind === "docker") {
    const r = spawnSync("docker", ["compose", "up", "-d", "--wait"], {
      cwd: path.join(ROOT, svc.dir), stdio: "ignore", timeout: 180000,
    });
    if (r.status !== 0) console.warn(`${color}[${svc.name}]${C.reset} ⚠️  no se pudo levantar (¿Docker?)`);
    else if (svc.name === "db") restoreAnalytics({ force: !!opts.forceRestore });
    return null; // docker no se registra en pids
  }

  let cmd;
  const extraEnv = {};
  if (svc.kind === "python") {
    if (!ensurePythonVenv(svc)) return null;
    cmd = [
      venvPython(path.join(ROOT, svc.dir)), "-m", "uvicorn",
      "app.main:app", "--host", "0.0.0.0", "--port", String(svc.port),
    ];
    if (mode === "dev") cmd.push("--reload");
    // Los servicios ML comparten ADMIN_KEY (protege sus /admin/*).
    if (ML_SERVICES.has(svc.name)) {
      extraEnv.ADMIN_KEY =
        process.env.CLUSTERING_API_KEY ?? "change-me";
    }
    // clustering-api lee `DATABASE_URL`; en el backend esa variable es la BD
    // operativa, así que aquí le pasamos la réplica `analytics` (vista RFM).
    if (svc.name === "clustering") {
      extraEnv.DATABASE_URL =
        process.env.ANALYTICS_DATABASE_URL ??
        "postgres://postgres:postgres@localhost:5436/analytics";
    }
  } else {
    if (!ensureNodeDeps(svc)) return null;
    cmd = svc[mode === "prod" ? "prod" : "dev"];
    if (!cmd) { console.warn(`${color}[${svc.name}]${C.reset} ⚠️  sin comando para modo ${mode}`); return null; }
  }

  killPort(svc.port);
  sleepSync(500);

  const fd = openLog(svc.name);
  const launch = nodeLaunchCommand(svc, cmd);
  // Deja constancia en el log de qué se lanzó y desde dónde: si el proceso muere
  // sin escribir nada (p. ej. npm bloqueado en Windows), esta línea lo delata.
  try {
    fs.writeSync(fd, `[dev.js] ejecutando: ${[launch.file, ...launch.args].join(" ")}  (cwd: ${svc.dir})\n`);
  } catch {
    /* sin log */
  }
  const env = { ...process.env, ...extraEnv };
  if (IS_WIN && svc.kind === "node") {
    // El PATH del equipo puede traer el npm/pnpm de otro usuario; anteponer la
    // carpeta del node que ejecuta el lanzador garantiza usar este node.
    env.PATH = `${path.dirname(process.execPath)};${env.PATH || ""}`;
  }
  const child = spawn(launch.file, launch.args, {
    cwd: path.join(ROOT, svc.dir),
    stdio: ["ignore", fd, fd],
    detached: true,
    env,
    shell: launch.shell,
    windowsHide: true,
  });
  child.on("error", (err) => {
    console.error(`${color}[${svc.name}]${C.reset} ✘ ${err.message}`);
    try { fs.writeSync(fd, `[dev.js] error al lanzar: ${err.message}\n`); } catch { /* sin log */ }
  });
  child.on("exit", (code, signal) => {
    try { fs.writeSync(fd, `[dev.js] proceso terminó: code=${code} signal=${signal}\n`); } catch { /* sin log */ }
    if (code !== 0 && code !== null) {
      console.warn(`${color}[${svc.name}]${C.reset} ⚠️  el proceso terminó (código ${code}); ver logs/${svc.name}.log`);
    }
  });
  child.unref();
  return child.pid;
}

function stopAll(targets) {
  let pids = {};
  try { pids = JSON.parse(fs.readFileSync(PIDS_FILE, "utf8")); } catch { /* sin archivo */ }

  const names = new Set(targets.map((s) => s.name));
  const remaining = {};
  for (const [name, pid] of Object.entries(pids)) {
    if (!names.has(name)) { remaining[name] = pid; continue; }
    try {
      if (IS_WIN) spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true });
      else process.kill(-pid, "SIGTERM");
      console.log(`⏹  ${name} (pid ${pid})`);
    } catch {
      console.log(`   ${name} ya no estaba corriendo`);
    }
  }
  for (const svc of targets) if (svc.kind !== "docker") killPort(svc.port);

  if (Object.keys(remaining).length) fs.writeFileSync(PIDS_FILE, JSON.stringify(remaining, null, 2));
  else { try { fs.unlinkSync(PIDS_FILE); } catch { /* noop */ } }

  if (names.has("db")) {
    const r = spawnSync("docker", ["compose", "stop"], { cwd: path.join(ROOT, "db"), stdio: "ignore", timeout: 120000 });
    if (r.status === 0) console.log("⏹  db (docker compose stop)");
  }
}

function printHelp() {
  console.log(
    [
      "CRM — lanzador",
      "",
      "USO",
      "  node crm/dev.js [flags]",
      "",
      "SELECCIÓN (sin flags = todo)",
      "  --db         PostgreSQL del CRM (docker): analytics :5436 + crm :5437",
      "  --backend    NestJS del CRM                 :3100",
      "  --web        Interface web (Vite)           :8444",
      "  --ia         ia-service (FastAPI)           :8002",
      "  --ml         los 3 modelos ML (clustering+xgboost+uplift)",
      "  --clustering clustering-api (scikit-learn)  :8010",
      "  --xgboost    xgboost-api (propensión)       :8011",
      "  --uplift     uplift-api (econml)            :8012",
      "",
      "MODOS",
      "  --prod       backend sin watch · ia/ml sin --reload · web en preview",
      "  --restore    al montar la BD, restaura analytics desde db/backups",
      "               (forzado: sobrescribe la BD aunque ya tenga datos)",
      "  --backup-db  vuelca la BD operativa `crm` a backups/crm_<fecha>.dump (+ .sha256)",
      "  --restore-db deja la BD `crm` como el respaldo (pg_restore --clean) y sale",
      "               (--restore-db=<ruta> para un respaldo concreto)",
      "  --init       primer arranque desde cero: instala dependencias, crea la base",
      "               y, si esta vacia, la restaura desde backups/; luego arranca todo",
      "  --migrate    al terminar de levantar, restaura la BD operativa `crm` (:5437)",
      "               desde la del ecommerce (`ecommerce_postgres` :5432).",
      "               Destructivo: sobrescribe los datos locales del CRM.",
      "  --stop       detiene lo levantado (o solo lo seleccionado)",
      "  --help       esta ayuda",
      "",
      "DEPENDENCIAS LOCALES",
      "  node_modules (backend/web) y .venv (ia y ml) se instalan solos si faltan.",
      "",
      "DEPENDENCIAS EXTERNAS",
      "  SMS: Vassago/sms_service (VITE_SMS_API_URL en crm/interface web/.env).",,
      "",
      "BASES DE DATOS (propias del CRM, en crm/db)",
      "  crm       :5437  operativa: campañas, catálogo, pedidos, clientes, usuarios.",
      "  analytics :5436  réplica del legado; la leen los modelos de ML.",
      "  Si el volumen de analytics está vacío, --db lo restaura desde db/backups.",
      "  Restaurar: node crm/dev.js --db --restore   (o: bash crm/db/restore.sh)",
      "  Migrar/refrescar la operativa desde el ecommerce:",
      "    node crm/dev.js --migrate    (o: bash crm/db/migrate-from-ecommerce.sh)",
      "  Respaldo propio de la operativa: node crm/dev.js --backup-db",
      "    y restaurar exacto: node crm/dev.js --restore-db",
      "",
      "COMPATIBILIDAD",
      "  Linux · macOS · Windows. Restaurar/migrar no requiere bash.",
      "",
      "Logs: crm/logs/*.log · PIDs: crm/logs/.pids.json",
      "Un argumento desconocido no levanta nada (aborta; usa --help para ver las opciones).",
    ].join("\n"),
  );
}

async function main() {
  const argv = process.argv.slice(2);
  const MODE = argv.includes("--prod") || argv.includes("--live") ? "prod" : "dev";
  const STOP = argv.includes("--stop");
  const HELP = argv.includes("--help");
  const RESTORE = argv.includes("--restore");
  const MIGRATE = argv.includes("--migrate");
  const BACKUP_DB = argv.includes("--backup-db");
  const RESTORE_DB_ARG = argv.find((a) => a === "--restore-db" || a.startsWith("--restore-db="));
  const RESTORE_DB = Boolean(RESTORE_DB_ARG);
  const INIT = argv.includes("--init");
  const RESTORE_DB_FILE =
    RESTORE_DB_ARG && RESTORE_DB_ARG.includes("=")
      ? RESTORE_DB_ARG.slice(RESTORE_DB_ARG.indexOf("=") + 1) || null
      : null;

  const services = selectServices(argv);
  if (HELP) return printHelp();

  const unknown = unknownFlags(argv);
  if (unknown.length) {
    console.error(`✘ Argumento(s) no reconocido(s): ${unknown.join(", ")} — no se levanta nada.`);
    console.error("  Usa `node crm/dev.js --help` para ver las opciones.");
    process.exit(1);
  }

  if (STOP) return stopAll(services);

  FORCE_INSTALL = INIT;

  // Tareas puntuales sobre la BD operativa: ejecutan y terminan (no levantan servicios).
  if (BACKUP_DB) process.exit(await runBackupDb());
  if (RESTORE_DB) process.exit(await runRestoreDb(RESTORE_DB_FILE));

  const dbSelected = services.some((s) => s.name === "db");
  if ((RESTORE || MIGRATE) && !dbSelected) {
    console.warn("⚠️  --restore/--migrate actúan sobre la BD: sin --db no harán nada.");
  }

  // `--init` (primer arranque desde cero): deja la BD lista antes de montar los
  // servicios, para que el backend no arranque contra una base sin esquema.
  if (INIT && dbSelected) {
    if (!(await initOperationalDb())) process.exit(1);
  }

  fs.mkdirSync(LOGS_DIR, { recursive: true });
  console.log(`🧩 CRM — modo ${MODE.toUpperCase()} · ${services.map((s) => s.name).join(" + ")}`);
  console.log("");

  const started = {};
  if (dbSelected) {
    await ensureDocker();
  }
  for (const svc of services) {
    const pid = startService(svc, MODE, { forceRestore: RESTORE });
    if (pid) started[svc.name] = pid;
  }
  fs.writeFileSync(PIDS_FILE, JSON.stringify(started, null, 2));

  for (const svc of services) {
    if (svc.kind === "docker" || !started[svc.name]) continue;
    // NestJS compila en el primer arranque; en un VPS con antivirus puede tardar
    // varios minutos, así que el backend tiene más margen que las webs.
    const timeout = svc.name === "backend" ? 420000 : 240000;
    const up = await waitForPort(svc.port, timeout);
    if (up) {
      console.log(`${C[svc.name] || ""}[${svc.name}]${C.reset} ✅ listo`);
      continue;
    }
    console.warn(
      `${C[svc.name] || ""}[${svc.name}]${C.reset} ⚠️  no respondió aún (ver logs/${svc.name}.log)`,
    );
    const tail = tailLog(svc.name, 30);
    if (tail && tail.length) {
      console.warn(`${C[svc.name] || ""}[${svc.name}]${C.reset} ── últimas líneas de logs/${svc.name}.log ──`);
      for (const line of tail) console.warn(`   ${line}`);
      console.warn(`${C[svc.name] || ""}[${svc.name}]${C.reset} ─────────────────────────`);
    } else {
      console.warn(`${C[svc.name] || ""}[${svc.name}]${C.reset} (logs/${svc.name}.log no tiene contenido todavía)`);
    }
  }

  // El proyecto ya está arriba: recién ahora se migra la operativa (--migrate).
  if (MIGRATE) migrateOperationalDb();

  console.log("\n━━━━━━━━━━━ CRM — URLs ━━━━━━━━━━━");
  console.log("  WEB      → http://localhost:8444");
  console.log("  BACKEND  → http://localhost:3100  (docs: /api/docs)");
  console.log("  IA       → http://localhost:8002/docs");
  console.log("  DB CRM   → PostgreSQL localhost:5437 (docker, operativa)");
  console.log("  DB ML    → PostgreSQL localhost:5436 (docker, réplica analytics)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Logs: crm/logs/*.log");
  console.log("Detener: node crm/dev.js --stop\n");
  process.exit(0);
}

// Solo ejecuta el launcher cuando se invoca directamente (permite requerirlo
// desde scripts de verificación sin levantar nada).
if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

// Helpers puros exportados para pruebas (restore de db/backups).
module.exports = { pickBackup, sha256File, assembleAndHash, readSha256, restoreAnalytics };
