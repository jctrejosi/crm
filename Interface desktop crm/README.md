# Ecommerce CRM — aplicación de escritorio

Shell de escritorio (Electron) para el panel CRM. Carga
la URL del panel definida en `config.json` (o en `config.local.json` para el
cliente actual) en una ventana propia, con sesión persistente, icono de la
aplicación y un instalador para Windows por usuario (sin permisos de
administrador).

El panel **no se empaqueta dentro del ejecutable**: se carga desde el servidor.
Eso significa que cualquier cambio publicado en el CRM llega al usuario al
abrir o recargar la app, sin reinstalar nada.

## Requisitos para compilar

- Node.js 22 o superior.
- NSIS (`makensis`) en el `PATH`:
  - Debian/Ubuntu/Kali: `sudo apt install nsis`
  - Windows: `choco install nsis`
- ImageMagick (`convert` o `magick`) **solo** si falta `build/icon.ico`.
  El repositorio ya incluye el icono generado desde el favicon del cliente.
- Para firmar: **Java 17+** (se usa `jsign`, que el build descarga solo) o el
  **Windows SDK** (`signtool`). Si no hay ninguno, compila con
  `npm run build:win:unsigned`.

## Compilar el instalador

```bash
cd "Interface desktop crm"
npm install

npm run build:win        # por usuario, sin administrador
npm run build:win:admin  # AllInOne: pide UAC, app para todos los usuarios
```

Resultado:

```
dist/EcommerceCRM-Setup-<versión>.exe            # por usuario
dist/EcommerceCRM-Setup-AllInOne-<versión>.exe   # con administrador
```

Tamaños de referencia: ~104 MB cada instalador y ~311 MB instalados (Electron
incluye Chromium; se recortan los idiomas no usados).

Para partir de cero:

```bash
npm run build:win:clean
```

El proceso:

1. Empaqueta la app con `@electron/packager` para `win32-x64`.
2. Aplica el icono y los metadatos de versión con `resedit` (no requiere wine).
3. Firma `EcommerceCRM.exe` con el certificado de `certs/` (si existe).
4. Genera y compila el instalador NSIS con la plantilla correspondiente:
   `installer.nsi` (por usuario) o `installer-allinone.nsi` (administrador).
5. Firma el `Setup.exe` como último paso.

## Firma de código (autofirmada y gratuita)

El proyecto incluye un certificado de code signing autofirmado:

- `certs/Ecommerce-JCTI-CRM-CodeSigning.pfx`: clave privada + certificado. **Ignorado por
  git**, nunca se empaqueta en la app.
- `certs/.pfx-password`: contraseña del PFX. **Ignorada por git**.
- `deployment/Ecommerce-JCTI-CRM-CodeSigning.cer`: certificado público para distribuir.

`npm run build:win` firma automáticamente la app y el instalador si el PFX está
presente. Para generar o rotar el certificado:

```powershell
# Windows
.\scripts\New-EcommerceCRMCodeSigningCert.ps1
.\scripts\New-EcommerceCRMCodeSigningCert.ps1 -Force   # rotar
```

```bash
# Linux/macOS
./scripts/generate-signing-cert.sh
FORCE=1 ./scripts/generate-signing-cert.sh          # rotar
```

Después de rotar: `npm run build:win` y `npm run cert:intune` (regenera el
script de Intune con el nuevo certificado), y redistribuye el `.cer`.

Variables de entorno del build:

| Variable | Uso |
|---|---|
| `SIGN_PFX` | Ruta al PFX (por defecto `certs/Ecommerce-JCTI-CRM-CodeSigning.pfx`) |
| `SIGN_PFX_PASSWORD` | Contraseña del PFX (si no, lee `certs/.pfx-password`) |
| `SIGN_ALIAS` | Alias del certificado (por defecto `Ecommerce-JCTI CRM Code Signing`) |
| `SIGN_TIMESTAMP_URL` | URL TSA opcional (p. ej. `http://timestamp.digicert.com`) |
| `SIGN_JSIGN_JAR` | Ruta alternativa al jar de jsign |
| `SIGN=0` | Omite la firma (equivale a `--no-sign`) |

La confianza **no se hereda automáticamente**: hay que instalar el `.cer` en los
equipos. Instrucciones completas en [`deployment/README.md`](deployment/README.md).

## Instalar en Windows

### Opción recomendada: AllInOne (pide administrador)

1. Copia `EcommerceCRM-Setup-AllInOne-<versión>.exe` al equipo.
2. Ejecútalo. Windows pedirá permisos de administrador (UAC).
   - Si aceptas, continúa la instalación.
   - Si cancelas, no se instala nada.
3. Instala la app para todos los usuarios en `%PROGRAMFILES%\Ecommerce CRM`.
4. Crea el acceso directo **Ecommerce CRM** en el escritorio y en el menú Inicio.
5. Crea el desinstalador.

### Opción sin administrador (para GPO/Intune)

1. Copia `EcommerceCRM-Setup-<versión>.exe` al equipo.
2. Ejecútalo. Se instala en `%LOCALAPPDATA%\Programs\Ecommerce CRM` **sin pedir
   permisos de administrador**.
3. Crea accesos directos en el escritorio y en el menú Inicio (`Ecommerce`).
4. El certificado debe desplegarse aparte por GPO/Intune.

Para desinstalar: Configuración → Aplicaciones, o el acceso
"Desinstalar Ecommerce CRM". Los datos de sesión
(`%APPDATA%\Ecommerce CRM`) se conservan a propósito, para no cerrar la sesión
al actualizar o reinstalar.

## Cambiar la URL del panel

La configuración vive en `config.json`, junto al ejecutable:

```json
{
  "adminUrl": "https://crm.example.com",
  "allowDevTools": false
}
```

El `config.json` del repositorio es una **plantilla genérica**. La URL real del
cliente se define en `config.local.json`, que está ignorado por git; el build lo
usa si existe y lo empaqueta como `config.json` para el instalador. Así el
código, el ejecutable, el instalador y el certificado quedan con la marca
genérica **Ecommerce** y solo la configuración local contiene el cliente.

- `adminUrl`: URL que carga la ventana. También admite un entorno de pruebas
  (`http://…`).
- `allowDevTools`: `true` habilita F12 y el menú de herramientas de desarrollo.
  En builds empaquetados el valor por defecto es `false`.

Tras editar el archivo, cierra y vuelve a abrir la app. El instalador no
sobrescribe un `config.json` existente en una actualización.

## Comportamiento

- Ventana de 1440×900 (mínimo 1060×660); recuerda tamaño, posición, maximizado y
  zoom entre sesiones.
- Instancia única: al abrir de nuevo, se enfoca la ventana existente.
- Sesión persistente en la partición `persist:ecommerce-crm` (cookies y
  `localStorage` sobreviven al reinicio).
- Los enlaces externos se abren en el navegador del sistema.
- Si no hay conexión, se muestra una pantalla local con reintento automático
  cada 12 segundos y opciones para abrir en el navegador o cerrar.
- Atajos: `F5`/`Ctrl+R` recargar, `Ctrl+Shift+R` forzar recarga, `Ctrl +/-`
  zoom, `F11` pantalla completa.

## Actualizar la app de escritorio

- **Contenido del panel**: automático; no hay que reinstalar.
- **Shell/cambios de Electron**: incrementa `version` en `package.json`, ejecuta
  `npm run build:win` y distribuye el nuevo `Setup.exe`. Se instala encima y
  conserva la configuración y la sesión.

## Probar sin interfaz gráfica (CI/servidor)

El proceso principal admite un autodiagnóstico que abre el panel, comprueba que
carga y termina:

```bash
ECOMMERCE_SMOKE_TEST=1 xvfb-run -a ./node_modules/.bin/electron . --no-sandbox
# [smoke] ok <URL_CONFIGURADA>/ · "<título del panel>"
```

## Notas

- El instalador está firmado con un certificado **autofirmado**. En equipos donde
  el certificado no esté instalado, SmartScreen puede seguir mostrando un aviso;
  en equipos del dominio, GPO/Intune elimina el "editor desconocido".
- El PFX y su contraseña son material sensible: si se filtran, cualquiera puede
  firmar software como Ecommerce. No se versionan y conviene restringir su ACL.
- Verificación de una firma en Windows:

  ```powershell
  Get-AuthenticodeSignature .\EcommerceCRM-Setup-1.0.0.exe |
    Format-List Status, StatusMessage, SignerCertificate
  ```

  Con el certificado desplegado debe dar `Status: Valid`.
- El icono y el logo del instalador salen de `build/icon.ico` y
  `build/icon.png`. Para cambiarlos, reemplaza `build/icon.png` (192×192 o
  mayor) y borra `build/icon.ico` para que se regenere en el siguiente build.
- **AllInOne** es per-machine (`RequestExecutionLevel admin`, `Program Files`);
  el instalador sin administrador es per-user (`LocalAppData`). Ambos conservan
  la sesión por usuario en `%APPDATA%\Ecommerce CRM`.
- El AllInOne puede advertir por SmartScreen mientras el certificado no esté
  desplegado en el equipo. Distribúyelo por GPO/Intune antes de instalar
  (ver deployment/README.md).

## Estructura

```
main.cjs                 proceso principal de Electron (ventana, navegación, menú)
offline.html             pantalla local cuando falla la conexión
config.json              plantilla de configuración (URL genérica)
config.local.json        URL real del cliente (ignorado por git)
installer.nsi            instalador por usuario (sin administrador)
installer-allinone.nsi   instalador con UAC (app para todos los usuarios)
build-windows.cjs        orquestador del build (packager + icono + firma + NSIS)
build/icon.ico|png       icono de la app y del instalador
certs/                   PFX, clave y contraseña (privados, ignorados por git) + .cer
scripts/                 generación/rotación del certificado y script de Intune
deployment/              .cer público y scripts de GPO/Intune
tools/                   jsign (descargado, ignorado por git)
release/                 instaladores listos para distribuir (ignorado por git)
dist/                    salida generada (ignorada por git)
```
