'use strict';

/**
 * Construye el instalador de Windows del panel de administración.
 *
 * Requisitos:
 *   - Node.js 22+
 *   - NSIS (`makensis`) en el PATH
 *   - ImageMagick (`convert`/`magick`) solo si falta build/icon.ico
 *
 * Uso:
 *   npm run build:win
 *   npm run build:win:clean
 *   npm run build:win:admin      (AllInOne: pide UAC, instala app + certificado)
 *   npm run build:win:unsigned   (omite la firma)
 *
 * Firma: si existe certs/Ecommerce-JCTI-CRM-CodeSigning.pfx, firma la app y el
 * instalador. Variables: SIGN_PFX, SIGN_PFX_PASSWORD, SIGN_ALIAS,
 * SIGN_TIMESTAMP_URL, SIGN_JSIGN_JAR. Con SIGN=0 o --no-sign se omite.
 *
 * Resultado: dist/EcommerceCRM-Setup-<version>.exe
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const { packager } = require('@electron/packager');
const ResEdit = require('resedit');

const root = __dirname;
const pkg = require('./package.json');

const PRODUCT_NAME = 'Ecommerce CRM';
const APP_ID = 'EcommerceCRM';
const EXECUTABLE_NAME = 'EcommerceCRM';
const allInOne = process.argv.includes('--all-in-one') || process.env.ALL_IN_ONE === '1';

const distDir = path.join(root, 'dist');
const packagedDir = path.join(distDir, 'packaged');
const workDir = path.join(distDir, 'work');
const buildDir = path.join(root, 'build');
const iconIco = path.join(buildDir, 'icon.ico');
const iconPng = path.join(buildDir, 'icon.png');
const installerTemplate = path.join(
  root,
  allInOne ? 'installer-allinone.nsi' : 'installer.nsi',
);
const configFile = path.join(root, 'config.json');
const localConfigFile = path.join(root, 'config.local.json');
const configSource = fs.existsSync(localConfigFile) ? localConfigFile : configFile;
const buildConfigFile = path.join(distDir, 'config', 'config.json');
const certFile = path.join(root, 'deployment', 'Ecommerce-JCTI-CRM-CodeSigning.cer');
const setupFile = path.join(
  distDir,
  `${APP_ID}-Setup${allInOne ? '-AllInOne' : ''}-${pkg.version}.exe`,
);

// La app solo necesita el idioma del panel, es-CO usa es-419; en-US es el
// fallback interno de Chromium. Quitar el resto ahorra ~45 MB instalados.
const KEEP_LOCALES = new Set(['en-US.pak', 'es.pak', 'es-419.pak']);

// Firma de código con certificado autofirmado (ruta gratuita GPO/Intune).
const certsDir = path.join(root, 'certs');
const defaultSignPfx = path.join(certsDir, 'Ecommerce-JCTI-CRM-CodeSigning.pfx');
const signPfx = process.env.SIGN_PFX ? path.resolve(process.env.SIGN_PFX) : defaultSignPfx;
const signPasswordFile = path.join(certsDir, '.pfx-password');
const signAlias = process.env.SIGN_ALIAS || 'Ecommerce-JCTI CRM Code Signing';
const jsignJar = process.env.SIGN_JSIGN_JAR
  ? path.resolve(process.env.SIGN_JSIGN_JAR)
  : path.join(root, 'tools', 'jsign.jar');
const JSIGN_VERSION = '7.6';
const timestampUrl = (process.env.SIGN_TIMESTAMP_URL || '').trim();
const explicitPfx = Boolean(process.env.SIGN_PFX);
const signingEnabled =
  process.env.SIGN !== '0' &&
  !process.argv.includes('--no-sign') &&
  (fs.existsSync(signPfx) || explicitPfx);

function log(message) {
  console.log(`\n▸ ${message}`);
}

function fail(message) {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

function commandExists(command, args) {
  try {
    execFileSync(command, args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function directorySize(directory) {
  let total = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    total += entry.isDirectory() ? directorySize(full) : fs.statSync(full).size;
  }
  return total;
}

function formatMb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readSigningPassword() {
  const password = process.env.SIGN_PFX_PASSWORD
    ? process.env.SIGN_PFX_PASSWORD
    : fs.existsSync(signPasswordFile)
      ? fs.readFileSync(signPasswordFile, 'utf8').trim()
      : '';

  if (!password) {
    fail(
      'Falta la contraseña del PFX. Define SIGN_PFX_PASSWORD o crea ' +
        path.relative(root, signPasswordFile) +
        '.',
    );
  }
  return password;
}

async function ensureSigningTools() {
  if (!signingEnabled) {
    log('Firma deshabilitada (SIGN=0, --no-sign o PFX ausente)');
    return null;
  }

  if (!fs.existsSync(signPfx)) {
    fail(`No existe el PFX ${signPfx}. Genera el certificado o compila con --no-sign.`);
  }

  if (process.platform === 'win32' && commandExists('signtool', ['/?'])) {
    log('Firma con signtool (Windows SDK)');
    return 'signtool';
  }

  if (!commandExists('java', ['-version'])) {
    fail(
      'Para firmar se necesita Java (jsign) o signtool del Windows SDK.\n' +
        'Instala uno de los dos, o compila con --no-sign.',
    );
  }

  if (!fs.existsSync(jsignJar)) {
    log(`Descargando jsign ${JSIGN_VERSION}`);
    const url = `https://github.com/ebourg/jsign/releases/download/${JSIGN_VERSION}/jsign-${JSIGN_VERSION}.jar`;
    const response = await fetch(url);
    if (!response.ok) {
      fail(
        `No se pudo descargar jsign (HTTP ${response.status}). ` +
          `Descárgalo manualmente en ${jsignJar}.`,
      );
    }
    fs.mkdirSync(path.dirname(jsignJar), { recursive: true });
    fs.writeFileSync(jsignJar, Buffer.from(await response.arrayBuffer()));
  }

  log(`Firma con jsign ${JSIGN_VERSION}`);
  return 'jsign';
}

function signFile(file, backend) {
  if (!signingEnabled) return;

  const password = readSigningPassword();
  log(`Firmando ${path.basename(file)}`);

  if (backend === 'signtool') {
    const args = ['sign', '/fd', 'SHA256', '/f', signPfx, '/p', password, '/d', PRODUCT_NAME];
    if (timestampUrl) args.push('/tr', timestampUrl, '/td', 'SHA256');
    args.push(file);
    execFileSync('signtool', args, { stdio: 'inherit' });
    return;
  }

  const args = [
    '-jar',
    jsignJar,
    '--keystore',
    signPfx,
    '--storepass',
    password,
    '--storetype',
    'PKCS12',
    '--alias',
    signAlias,
    '--name',
    PRODUCT_NAME,
    '--replace',
  ];
  if (timestampUrl) args.push('--tsaurl', timestampUrl);
  args.push(file);
  execFileSync('java', args, { stdio: 'inherit' });
}

/** NSIS acepta '/' en todas las plataformas; evita problemas de escape. */
function toNsisPath(value) {
  return value.replace(/\\/g, '/');
}

function ensureIcon() {
  if (fs.existsSync(iconIco)) return;

  if (!fs.existsSync(iconPng)) {
    fail(`Falta ${iconPng}. Copia ahí el logo de Ecommerce en PNG (192x192 o mayor).`);
  }

  const converter = commandExists('magick', ['-version']) ? 'magick' : 'convert';
  if (!commandExists(converter, ['-version'])) {
    fail(
      'Falta build/icon.ico y no hay ImageMagick para generarlo.\n' +
        'Instala ImageMagick o coloca manualmente un .ico en build/icon.ico.',
    );
  }

  log(`Generando ${path.relative(root, iconIco)} desde icon.png`);
  execFileSync(
    converter,
    [iconPng, '-define', 'icon:auto-resize=256,128,64,48,32,16', iconIco],
    { stdio: 'inherit' },
  );
}

function trimLocales(sourceDir) {
  const localesDir = path.join(sourceDir, 'locales');
  if (!fs.existsSync(localesDir)) return;

  let removed = 0;
  let freed = 0;
  for (const entry of fs.readdirSync(localesDir)) {
    if (KEEP_LOCALES.has(entry)) continue;
    const file = path.join(localesDir, entry);
    freed += fs.statSync(file).size;
    fs.rmSync(file, { force: true });
    removed += 1;
  }

  if (removed > 0) {
    log(`Recortando idiomas: ${removed} archivos, ${formatMb(freed)} menos`);
  }
}

function findPackagedExe() {
  const direct = path.join(packagedDir, `${APP_ID}-win32-x64`, `${EXECUTABLE_NAME}.exe`);
  if (fs.existsSync(direct)) return direct;

  const stack = [packagedDir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.name === `${EXECUTABLE_NAME}.exe`) {
        return full;
      }
    }
  }

  fail('No se encontró el ejecutable empaquetado. Revisa la salida de @electron/packager.');
}

function versionParts(version) {
  const numbers = String(version)
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map((part) => Number.parseInt(part, 10));
  return [numbers[0] || 1, numbers[1] || 0, numbers[2] || 0, 0];
}

/** Thumbprint SHA-1 del certificado DER, tal como lo muestra Windows. */
function certThumbprint(file) {
  return crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex').toUpperCase();
}

/** Aplica icono y metadatos de versión al .exe sin necesitar wine/rcedit. */
function patchExecutable(exePath) {
  log('Aplicando icono y metadatos al ejecutable');

  const exe = ResEdit.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
  const resources = ResEdit.NtExecutableResource.from(exe);

  const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(iconIco));
  const iconData = iconFile.icons.map((icon) => icon.data);

  const iconGroups = ResEdit.Resource.IconGroupEntry.fromEntries(resources.entries);
  if (iconGroups.length > 0) {
    for (const group of iconGroups) {
      ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
        resources.entries,
        group.id,
        group.lang,
        iconData,
      );
    }
  } else {
    // La API agrega el grupo si no existe.
    ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
      resources.entries,
      1,
      1033,
      iconData,
    );
  }

  const [major, minor, patch] = versionParts(pkg.version);
  const versions = ResEdit.Resource.VersionInfo.fromEntries(resources.entries);
  const versionInfo =
    versions.length > 0 ? versions[0] : ResEdit.Resource.VersionInfo.createEmpty();

  versionInfo.setFileVersion(major, minor, patch, 0);
  versionInfo.setProductVersion(major, minor, patch, 0);
  versionInfo.setStringValues(
    { lang: 1033, codepage: 1200 },
    {
      CompanyName: 'Ecommerce',
      FileDescription: PRODUCT_NAME,
      FileVersion: pkg.version,
      InternalName: EXECUTABLE_NAME,
      LegalCopyright: 'Copyright (c) Ecommerce',
      OriginalFilename: `${EXECUTABLE_NAME}.exe`,
      ProductName: PRODUCT_NAME,
      ProductVersion: pkg.version,
    },
  );
  versionInfo.outputToResourceEntries(resources.entries);

  resources.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
}

function writeInstallerScript(sourceDir) {
  const template = fs.readFileSync(installerTemplate, 'utf8');
  const estimatedKb = Math.max(1, Math.round(directorySize(sourceDir) / 1024));
  const quad = versionParts(pkg.version).join('.');

  const script = template
    .replaceAll('@@VERSION@@', pkg.version)
    .replaceAll('@@VERSION_QUAD@@', quad)
    .replaceAll('@@SOURCE_DIR@@', toNsisPath(sourceDir))
    .replaceAll('@@OUTPUT_FILE@@', toNsisPath(setupFile))
    .replaceAll('@@ICON_FILE@@', toNsisPath(iconIco))
    .replaceAll('@@CONFIG_FILE@@', toNsisPath(buildConfigFile))
    .replaceAll('@@CERT_FILE@@', toNsisPath(certFile))
    .replaceAll('@@CERT_THUMBPRINT@@', allInOne ? certThumbprint(certFile) : '')
    .replaceAll('@@ESTIMATED_SIZE@@', String(estimatedKb));

  fs.mkdirSync(workDir, { recursive: true });
  const generated = path.join(
    workDir,
    allInOne ? 'installer-allinone.generated.nsi' : 'installer.generated.nsi',
  );
  fs.writeFileSync(generated, script, 'utf8');
  return generated;
}

async function main() {
  if (!commandExists('makensis', ['-version'])) {
    fail(
      'No se encontró makensis (NSIS) en el PATH.\n' +
        '  Linux:  sudo apt install nsis\n' +
        '  Windows: choco install nsis',
    );
  }

  ensureIcon();

  if (allInOne && !fs.existsSync(certFile)) {
    fail(
      `El instalador AllInOne necesita el certificado público ${certFile}.\n` +
        'Genera el certificado antes de compilar.',
    );
  }

  const signingBackend = await ensureSigningTools();

  if (process.argv.includes('--clean')) {
    log('Limpiando builds anteriores');
    fs.rmSync(packagedDir, { recursive: true, force: true });
    fs.rmSync(workDir, { recursive: true, force: true });
    fs.rmSync(setupFile, { force: true });
  }

  fs.mkdirSync(distDir, { recursive: true });

  log(`Modo: ${allInOne ? 'AllInOne (administrador)' : 'por usuario (sin administrador)'}`);

  // La configuración del cliente vive en config.local.json (ignorado por git).
  // El build la copia como config.json para el instalador y resources/.
  fs.mkdirSync(path.dirname(buildConfigFile), { recursive: true });
  fs.copyFileSync(configSource, buildConfigFile);
  log(`Configuración: ${path.basename(configSource)}`);

  const electronVersion = require('electron/package.json').version;

  log(`Empaquetando ${PRODUCT_NAME} con Electron ${electronVersion} (win32 x64)`);
  await packager({
    dir: root,
    out: packagedDir,
    platform: 'win32',
    arch: 'x64',
    name: APP_ID,
    executableName: EXECUTABLE_NAME,
    appVersion: pkg.version,
    buildVersion: pkg.version,
    electronVersion,
    overwrite: true,
    prune: true,
    asar: true,
    extraResource: [buildDir, buildConfigFile],
    ignore: [
      /^\/dist($|\/)/,
      /^\/release($|\/)/,
      /^\/certs($|\/)/,
      /^\/deployment($|\/)/,
      /^\/scripts($|\/)/,
      /^\/tools($|\/)/,
      /^\/config\.local\.json$/,
      /^\/build-windows\.cjs$/,
      /^\/installer\.nsi$/,
      /^\/installer-allinone\.nsi$/,
      /^\/README\.md$/,
      /^\/\.gitignore$/,
      /^\/package-lock\.json$/,
      /^\/pnpm-lock\.yaml$/,
    ],
  });

  const exePath = findPackagedExe();
  patchExecutable(exePath);
  signFile(exePath, signingBackend);

  const sourceDir = path.dirname(exePath);
  trimLocales(sourceDir);
  const generatedScript = writeInstallerScript(sourceDir);

  log('Compilando instalador con NSIS');
  execFileSync('makensis', ['-V2', generatedScript], { stdio: 'inherit' });

  if (!fs.existsSync(setupFile)) {
    fail('NSIS terminó sin generar el instalador esperado.');
  }

  // La firma debe ser el último paso: cualquier modificación posterior la invalida.
  signFile(setupFile, signingBackend);

  const size = fs.statSync(setupFile).size;
  console.log(
    [
      '',
      '✔ Instalador listo',
      `  Archivo: ${path.relative(root, setupFile)}`,
      `  Tamaño:  ${formatMb(size)}`,
      `  App:     ${formatMb(directorySize(sourceDir))} instalados`,
      `  Firma:   ${signingEnabled ? 'autofirmada (confiar vía GPO/Intune)' : 'deshabilitada'}`,
      '',
    ].join('\n'),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
