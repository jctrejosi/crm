// Copia la clave de DeepSeek desde el .env local del ia-service a docker/.env
// del servidor, sin imprimir el valor. Elimina el archivo temporal.
const fs = require('fs');

const tmp = 'C:/Users/Desarrolo4/Documents/crm/ia-local.env';
const target = 'C:/Users/Desarrolo4/Documents/crm/docker/.env';

const src = fs.readFileSync(tmp, 'utf8');
const m =
  src.match(/^\s*IA_SERVICE_DEEPSEEK_API_KEY\s*=\s*(.+)$/m) ||
  src.match(/^\s*DEEPSEEK_API_KEY\s*=\s*(.+)$/m);

if (!m) {
  console.error('NO_KEY');
  process.exit(1);
}

const key = m[1].trim().replace(/^["']|["']$/g, '');
if (key.length < 20) {
  console.error('KEY_TOO_SHORT=' + key.length);
  process.exit(1);
}

const text = fs.readFileSync(target, 'utf8');
const EOL = text.includes('\r\n') ? '\r\n' : '\n';
const values = { IA_SERVICE_DEEPSEEK_API_KEY: key, DEEPSEEK_API_KEY: key };

const seen = new Set();
const lines = text.split(/\r?\n/).map((line) => {
  const km = line.match(/^([A-Z0-9_]+)=/);
  if (km && values[km[1]] !== undefined) {
    seen.add(km[1]);
    return `${km[1]}=${values[km[1]]}`;
  }
  return line;
});

for (const [k, v] of Object.entries(values)) {
  if (!seen.has(k)) lines.push(`${k}=${v}`);
}

fs.writeFileSync(target, lines.join(EOL), 'utf8');
fs.unlinkSync(tmp);
console.log(`KEY_APPLIED length=${key.length} updated=${[...seen].join(',')}`);
