#!/usr/bin/env node
"use strict";
/**
 * Lanza un comando y anexa su stdout/stderr a un fichero de log.
 *
 * Lo usa `dev.js` en Windows para los servicios node (backend/web): allí
 * `npm`/`pnpm` son `.cmd` (necesitan shell) y, al ir el proceso `detached`, la
 * redirección por descriptor de fichero o por `cmd` NO captura la salida de
 * programas externos. Este runner va `detached` (sobrevive a `dev.js`) y usa
 * pipes, que sí capturan.
 *
 * Uso: node scripts/log-runner.js <logFile> <cwd> <shell:true|false> <cmd> [args...]
 */
const { spawn } = require("node:child_process");
const fs = require("node:fs");

const [logFile, cwd, shellFlag, cmd, ...args] = process.argv.slice(2);
const shell = shellFlag === "true";

// Con shell, el comando va como una sola cadena (evita el aviso DEP0190 de
// Node al pasar args junto a shell:true).
const command = shell
  ? [cmd, ...args].map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(" ")
  : cmd;

const out = fs.createWriteStream(logFile, { flags: "a" });
const child = spawn(command, shell ? [] : args, {
  cwd,
  shell,
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});

child.stdout.pipe(out, { end: false });
child.stderr.pipe(out, { end: false });
child.on("error", (err) => {
  out.write(`\n[log-runner] no se pudo lanzar '${cmd}': ${err.message}\n`);
  out.end(() => process.exit(1));
});
child.on("exit", (code, signal) => {
  out.write(`\n[log-runner] proceso terminado (code=${code}, signal=${signal})\n`);
  out.end(() => process.exit(code ?? 0));
});
