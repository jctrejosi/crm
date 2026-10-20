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
 *   node crm/dev.js --migrate       # levanta todo y, al final, refresca la BD `crm`
 *                                   #   desde la del ecommerce (destructivo)
 *   node crm/dev.js --stop [flags]  # detiene lo levantado (o solo lo seleccionado)
 *   node crm/dev.js --help
 *
 * Un flag desconocido no levanta nada (aborta; usa --help para ver las opciones).
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
const { spawn, spawnSync } = require("node:child_process");
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

/** Flags `--x` reconocidos. Cualquier otro aborta (no se levanta nada). */
const VALID_FLAGS = new Set([
  "--prod",
  "--live",
  "--stop",
  "--help",
  "--restore",
  "--migrate",
  "--ml",
  ...SERVICES.map((s) => `--${s.name}`),
]);

function unknownFlags(argv) {
  return argv.filter((a) => a.startsWith("--") && !VALID_FLAGS.has(a.toLowerCase()));
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

/** Libera el puerto de un proceso previo. Windows: netstat + taskkill; POSIX: fuser. */
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
  const r = spawnSync("fuser", ["-k", `${port}/tcp`], {
    stdio: ["ignore", "pipe", "ignore"], encoding: "utf8",
  });
  const out = (r.stdout || "").toString().trim();
  if (out) console.log(`  ✓ puerto ${port} liberado (PID ${out})`);
}

function openLog(name) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  const fd = fs.openSync(path.join(LOGS_DIR, `${name}.log`), "a");
  fs.writeSync(fd, `\n===== [${name}] ${new Date().toISOString()} =====\n`);
  return fd;
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
  // Si está el volcado completo, se usa ese; si no, se reensamblan las partes.
  const full = g.files.find((n) => n.endsWith(".backup"));
  const files = (full ? [full] : g.files.slice().sort()).map((n) => path.join(BACKUPS_DIR, n));
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
  if (v.status === 0 && (v.stdout || "").trim()) {
    console.log(`${tag} ${v.stdout.trim().split("\n").join(" · ")}`);
  }

  console.log(`${tag} ✅ BD analytics restaurada`);
  return true;
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

/** Instala dependencias del servicio si no están (node_modules). */
function ensureNodeDeps(svc) {
  const dir = path.join(ROOT, svc.dir);
  if (fs.existsSync(path.join(dir, "node_modules"))) return true;
  const color = C[svc.name] || "";
  console.log(`${color}[${svc.name}]${C.reset} 📦 instalando dependencias (${svc.install.join(" ")})...`);
  const r = spawnSync(svc.install[0], svc.install.slice(1), {
    cwd: dir, stdio: "inherit", shell: IS_WIN, // npm/pnpm son .cmd en Windows
  });
  if (r.status !== 0) {
    console.error(`${color}[${svc.name}]${C.reset} ✘ falló: ${svc.install.join(" ")}`);
    return false;
  }
  return true;
}

// ── Arranque ────────────────────────────────────────────────

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
  const child = spawn(cmd[0], cmd.slice(1), {
    cwd: path.join(ROOT, svc.dir),
    stdio: ["ignore", fd, fd],
    detached: true,
    env: { ...process.env, ...extraEnv },
    // npm/pnpm necesitan shell en Windows; el python del venv no (su ruta
    // puede llevar espacios y con shell se rompería).
    shell: IS_WIN && svc.kind === "node",
    windowsHide: true,
  });
  child.on("error", (err) => console.error(`${color}[${svc.name}]${C.reset} ✘ ${err.message}`));
  child.unref();
  fs.closeSync(fd);
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
      "",
      "COMPATIBILIDAD",
      "  Linux · macOS · Windows. Restaurar/migrar no requiere bash.",
      "",
      "Logs: crm/logs/*.log · PIDs: crm/logs/.pids.json",
      "Un flag desconocido no levanta nada (aborta; usa --help para ver las opciones).",
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

  const services = selectServices(argv);
  if (HELP) return printHelp();

  const unknown = unknownFlags(argv);
  if (unknown.length) {
    console.error(`✘ Flag(s) desconocido(s): ${unknown.join(", ")} — no se levanta nada.`);
    console.error("  Usa `node dev.js --help` para ver las opciones.");
    process.exit(1);
  }

  if (STOP) return stopAll(services);

  fs.mkdirSync(LOGS_DIR, { recursive: true });
  console.log(`🧩 CRM — modo ${MODE.toUpperCase()} · ${services.map((s) => s.name).join(" + ")}`);
  console.log("");

  const started = {};
  for (const svc of services) {
    const pid = startService(svc, MODE, { forceRestore: RESTORE });
    if (pid) started[svc.name] = pid;
  }
  fs.writeFileSync(PIDS_FILE, JSON.stringify(started, null, 2));

  for (const svc of services) {
    if (svc.kind === "docker" || !started[svc.name]) continue;
    const up = await waitForPort(svc.port, 90000);
    const ok = up ? "✅ listo" : `⚠️  no respondió (ver logs/${svc.name}.log)`;
    console.log(`${C[svc.name] || ""}[${svc.name}]${C.reset} ${ok}`);
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
