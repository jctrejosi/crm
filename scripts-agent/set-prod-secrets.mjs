#!/usr/bin/env node
/**
 * Rellena los secretos de DESPLIEGUE que el proyecto puede generar solo, en
 * `docker/.env` del CRM (el que usa `docker compose` / `prod.js`):
 *
 *   - JWT_SECRET         → aleatorio de 64 hex si está vacío/placeholder o débil.
 *   - ADMIN_PASSWORD      → aleatorio si no hay ADMIN_PASSWORD ni ADMIN_PASSWORD_HASH
 *                           (el entrypoint es fail-closed: sin ella NO arranca).
 *   - CLUSTERING_API_KEY  → aleatorio si sigue en `change-me`. Es una clave
 *                           COMPARTIDA con los servicios ML nativos: si los usas,
 *                           copia el valor generado a su configuración.
 *
 * NO toca los secretos de servicios externos (DEEPSEEK_* …): los rellena el
 * operador.
 *
 * Uso (desde la raíz del repo):
 *   node scripts-agent/set-prod-secrets.mjs
 *
 * Es idempotente: si ya hay un valor válido, lo conserva. Solo imprime los
 * valores generados (el operador los necesita); nunca imprime los existentes.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ENV_PATH = path.resolve("docker/.env");
if (!fs.existsSync(ENV_PATH)) {
  console.error(`✘ No existe ${ENV_PATH} — créalo antes:  cp docker/.env.example docker/.env`);
  process.exit(1);
}

let txt = fs.readFileSync(ENV_PATH, "utf8");

const PLACEHOLDER =
  /^(|change-?me|cambia(-esto)?|tu[_-]|your[_-]|example|placeholder|xxx+|secreto?|secret|test|demo|admin|password|<.*>)$/i;
const cur = (k) => (txt.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim() ?? "";
const isWeak = (v) => PLACEHOLDER.test(v) || (v.length > 0 && v.length < 32);

function setKey(key, value) {
  const re = new RegExp(`^${key}=.*$`, "m");
  txt = re.test(txt) ? txt.replace(re, `${key}=${value}`) : txt.trimEnd() + `\n${key}=${value}\n`;
}

const generated = [];
const notes = [];

// ── JWT_SECRET ──────────────────────────────────────────────
const jwtNow = cur("JWT_SECRET");
if (isWeak(jwtNow)) {
  setKey("JWT_SECRET", crypto.randomBytes(32).toString("hex"));
  notes.push(`  JWT_SECRET         : generado (64 hex)`);
} else {
  notes.push(`  JWT_SECRET         : se conserva el existente (${jwtNow.length} chars)`);
}

// ── ADMIN_PASSWORD (Basic Auth del panel) ───────────────────
const hasHash = !PLACEHOLDER.test(cur("ADMIN_PASSWORD_HASH"));
const hasPwd = !PLACEHOLDER.test(cur("ADMIN_PASSWORD"));
if (hasHash) {
  notes.push(`  ADMIN_PASSWORD     : se usa ADMIN_PASSWORD_HASH existente (no se toca)`);
} else if (hasPwd) {
  notes.push(`  ADMIN_PASSWORD     : se conserva el existente`);
} else {
  const pwd = crypto.randomBytes(12).toString("base64url");
  setKey("ADMIN_PASSWORD", pwd);
  generated.push(["ADMIN_PASSWORD", pwd]);
  notes.push(`  ADMIN_PASSWORD     : generado`);
}

// ── CLUSTERING_API_KEY (compartida con los ML nativos) ──────
const clusterNow = cur("CLUSTERING_API_KEY");
if (PLACEHOLDER.test(clusterNow) || clusterNow.length === 0) {
  const key = crypto.randomBytes(32).toString("hex");
  setKey("CLUSTERING_API_KEY", key);
  generated.push(["CLUSTERING_API_KEY", key]);
  notes.push(`  CLUSTERING_API_KEY : generado (¡cópialo a los servicios ML si los usas!)`);
} else {
  notes.push(`  CLUSTERING_API_KEY : se conserva el existente`);
}

fs.writeFileSync(ENV_PATH, txt);

console.log(`✔ docker/.env actualizado:`);
for (const n of notes) console.log(n);
if (generated.length) {
  console.log(`\n  🔑 Valores generados (guárdalos):`);
  for (const [k, v] of generated) console.log(`       ${k} = ${v}`);
  console.log(`     Credencial del panel (Basic Auth): usuario "admin".`);
}
console.log(
  `\n  ⚠️  Pendiente de rellenar a mano (servicios externos): ` +
    `IA_SERVICE_DEEPSEEK_API_KEY / DEEPSEEK_API_KEY (chat de IA).`,
);
