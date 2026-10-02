#!/usr/bin/env node
"use strict";
/**
 * CRM — lanzador local del proyecto.
 *
 * Levanta las piezas del CRM (`crm/`):
 *   db        → PostgreSQL analytics (docker compose) :5436  [crm/db]
 *   backend   → NestJS propio del CRM                 :3100  [crm/backend]
 *   web       → Interface web (React + Vite)          :8444  [crm/interface web]
 *   ia        → ia-service (FastAPI + DeepSeek)       :8002  [crm/ia-service]
 *
 * Uso:
 *   node crm/dev.js                 # levanta todo (dev)
 *   node crm/dev.js --backend --web # solo los seleccionados
 *   node crm/dev.js --prod          # backend sin watch; ia sin --reload
 *   node crm/dev.js --stop [flags]  # detiene lo levantado (o solo lo seleccionado)
 *   node crm/dev.js --help
 *
 * Dependencias locales: si faltan node_modules (backend/web) o .venv (ia),
 * se instalan automáticamente antes de arrancar.
 *
 * Dependencias externas (no las levanta este script):
 *   - ML Astaroth: clustering :8010, xgboost :8011, uplift :8012 (leen crm/db).
 *   - SMS (Vassago/sms_service) para la prueba de envío.
 *
 * Bases de datos propias del CRM (crm/db, docker):
 *   crm :5437 (operativa) · analytics :5436 (réplica del legado, la leen los MLs).
 *
 * Logs: crm/logs/*.log · PIDs: crm/logs/.pids.json.
 */
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const ROOT = __dirname;
const LOGS_DIR = path.join(ROOT, "logs");
const PIDS_FILE = path.join(LOGS_DIR, ".pids.json");

// Permiten apuntar la migración a otro contenedor/BD (restore.sh usa los mismos).
const DB_CONTAINER = process.env.DB_CONTAINER || "analytics_postgres";
const DB_NAME = process.env.DB_NAME || "analytics";

const SERVICES = [
  // `db` levanta el compose de crm/db, que trae LAS DOS bases del proyecto:
  //   analytics :5436 (réplica del ML) · crm :5437 (operativa: campañas, catálogo…)
  { name: "db", port: 5436, kind: "docker", dir: "db" },
  { name: "backend", port: 3100, kind: "node", dir: "backend", install: ["npm", "install"], dev: ["npm", "run", "dev"], prod: ["npm", "run", "start:prod"] },
  { name: "web", port: 8444, kind: "node", dir: "interface web", install: ["pnpm", "install"], dev: ["pnpm", "run", "dev"], prod: ["pnpm", "run", "preview"] },
  { name: "ia", port: 8002, kind: "python", dir: "ia-service" },
];

const C = { db: "\x1b[36m", backend: "\x1b[31m", web: "\x1b[32m", ia: "\x1b[33m", reset: "\x1b[0m" };

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

function killPort(port) {
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
  if (!chosen.length) return SERVICES;
  return SERVICES.filter((s) => chosen.includes(s.name));
}

function ensureIaVenv() {
  const dir = path.join(ROOT, "ia-service");
  if (fs.existsSync(path.join(dir, ".venv", "bin", "python"))) return true;
  console.log(`${C.ia}[ia]${C.reset} 📦 creando .venv e instalando dependencias...`);
  for (const step of [
    ["python3", "-m", "venv", ".venv"],
    [".venv/bin/pip", "install", "-r", "requirements.txt"],
  ]) {
    const r = spawnSync(step[0], step.slice(1), { cwd: dir, stdio: "inherit" });
    if (r.status !== 0) {
      console.error(`${C.ia}[ia]${C.reset} ✘ falló: ${step.join(" ")}`);
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
    cwd: dir, stdio: "inherit", shell: process.platform === "win32",
  });
  if (r.status !== 0) {
    console.error(`${color}[${svc.name}]${C.reset} ✘ falló: ${svc.install.join(" ")}`);
    return false;
  }
  return true;
}

/** Si el volumen de `analytics` está vacío, restaura el dump versionado (db/backups). */
function restoreAnalyticsIfEmpty() {
  const q = spawnSync(
    "docker",
    ["exec", DB_CONTAINER, "psql", "-U", "postgres", "-d", DB_NAME, "-tAc", "SELECT count(*) FROM pos.clientes"],
    { encoding: "utf8", timeout: 20000 },
  );
  const count = (q.stdout || "").trim();
  if (q.status === 0 && count && count !== "0") return; // ya tiene datos

  console.log(`${C.db}[db]${C.reset} 📦 BD analytics vacía → restaurando desde db/backups (puede tardar)...`);
  const r = spawnSync("bash", ["restore.sh"], {
    cwd: path.join(ROOT, "db"), stdio: "inherit", timeout: 900000,
    env: { ...process.env, DB_CONTAINER, DB_NAME },
  });
  if (r.status === 0) console.log(`${C.db}[db]${C.reset} ✅ BD analytics restaurada`);
  else console.warn(`${C.db}[db]${C.reset} ⚠️  no se pudo restaurar analytics (ver db/backups/README.md)`);
}

// ── Arranque ────────────────────────────────────────────────

function startService(svc, mode) {
  const color = C[svc.name] || "";
  console.log(`${color}[${svc.name}]${C.reset} ▶ puerto ${svc.port}`);

  if (svc.kind === "docker") {
    const r = spawnSync("docker", ["compose", "up", "-d", "--wait"], {
      cwd: path.join(ROOT, svc.dir), stdio: "ignore", timeout: 180000,
    });
    if (r.status !== 0) console.warn(`${color}[${svc.name}]${C.reset} ⚠️  no se pudo levantar (¿Docker?)`);
    else if (svc.name === "db") restoreAnalyticsIfEmpty();
    return null; // docker no se registra en pids
  }

  let cmd;
  if (svc.kind === "python") {
    if (!ensureIaVenv()) return null;
    cmd = [
      path.join(ROOT, svc.dir, ".venv", "bin", "python"), "-m", "uvicorn",
      "app.main:app", "--host", "0.0.0.0", "--port", String(svc.port),
    ];
    if (mode === "dev") cmd.push("--reload");
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
    shell: process.platform === "win32",
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
      if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"]);
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
      "",
      "MODOS",
      "  --prod       backend sin watch · ia sin --reload · web en preview",
      "  --stop       detiene lo levantado (o solo lo seleccionado)",
      "  --help       esta ayuda",
      "",
      "DEPENDENCIAS LOCALES",
      "  node_modules (backend/web) y .venv (ia) se instalan solos si faltan.",
      "",
      "DEPENDENCIAS EXTERNAS",
      "  ML Astaroth (clustering :8010 · xgboost :8011 · uplift :8012) lee la BD analytics (:5436).",
      "  SMS: Vassago/sms_service (VITE_SMS_API_URL en crm/interface web/.env).",
      "",
      "BASES DE DATOS (propias del CRM, en crm/db)",
      "  crm       :5437  operativa: campañas, catálogo, pedidos, clientes, usuarios.",
      "  analytics :5436  réplica del legado; la leen los modelos de ML.",
      "  Si el volumen de analytics está vacío, --db lo restaura desde db/backups.",
      "  Migrar/refrescar la operativa desde el ecommerce:",
      "    bash crm/db/migrate-from-ecommerce.sh",
      "",
      "Logs: crm/logs/*.log · PIDs: crm/logs/.pids.json",
    ].join("\n"),
  );
}

async function main() {
  const argv = process.argv.slice(2);
  const MODE = argv.includes("--prod") || argv.includes("--live") ? "prod" : "dev";
  const STOP = argv.includes("--stop");
  const HELP = argv.includes("--help");

  const services = selectServices(argv);
  if (HELP) return printHelp();
  if (STOP) return stopAll(services);

  fs.mkdirSync(LOGS_DIR, { recursive: true });
  console.log(`🧩 CRM — modo ${MODE.toUpperCase()} · ${services.map((s) => s.name).join(" + ")}`);
  console.log("");

  const started = {};
  for (const svc of services) {
    const pid = startService(svc, MODE);
    if (pid) started[svc.name] = pid;
  }
  fs.writeFileSync(PIDS_FILE, JSON.stringify(started, null, 2));

  for (const svc of services) {
    if (svc.kind === "docker" || !started[svc.name]) continue;
    const up = await waitForPort(svc.port, 90000);
    const ok = up ? "✅ listo" : `⚠️  no respondió (ver logs/${svc.name}.log)`;
    console.log(`${C[svc.name] || ""}[${svc.name}]${C.reset} ${ok}`);
  }

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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
