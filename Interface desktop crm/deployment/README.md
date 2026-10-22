# Despliegue de confianza del certificado de Ecommerce

El instalador y la app se firman con un certificado **autofirmado**. Para que
Windows valide esa firma, el certificado público debe estar instalado en los
equipos en estos dos almacenes:

- `LocalMachine\Root` (Entidades de certificación raíz de confianza)
- `LocalMachine\TrustedPublisher` (Editores de confianza)

No hace falta instalar la clave privada en los equipos de los usuarios. La clave
privada (`certs/Ecommerce-JCTI-CRM-CodeSigning.pfx`) se queda solo en el equipo/CI que
compila.

## Equipos sueltos: instalador AllInOne

Si el equipo no está en el dominio y no tienes Intune, usa
`EcommerceCRM-Setup-AllInOne-<versión>.exe`: pide permisos de administrador
(UAC), instala la app para todos los usuarios y agrega este certificado en
`LocalMachine\Root` y `LocalMachine\TrustedPublisher`. Al desinstalar, también
retira el certificado.

El instalador por usuario (`EcommerceCRM-Setup-<versión>.exe`) **no** instala el
certificado; para ese caso usa GPO/Intune o el script de esta carpeta.

## Archivos

| Archivo | Uso |
|---|---|
| `Ecommerce-JCTI-CRM-CodeSigning.cer` | Certificado público. Se importa por GPO o Intune. |
| `Install-EcommerceCRMCodeSigningCert.ps1` | Instalación manual o por script (requiere admin). |
| `Install-EcommerceCRMCodeSigningCert-Intune.ps1` | Versión autocontenida para Intune (certificado en Base64). |

Thumbprint actual:

```
958EA848C6C0F9F4833A347846D228271E71F003
```

Se puede confirmar con:

```powershell
(Get-PfxCertificate .\Ecommerce-JCTI-CRM-CodeSigning.cer).Thumbprint
```

## Opción 1: GPO (equipos del dominio)

1. Copia `Ecommerce-JCTI-CRM-CodeSigning.cer` a la máquina donde administras las GPO.
2. Abre `gpmc.msc` y edita la GPO que aplica a los equipos.
3. Ve a:
   `Configuración del equipo > Directivas > Configuración de Windows >
   Configuración de seguridad > Directivas de clave pública >
   Entidades de certificación raíz de confianza`.
4. Clic derecho → **Importar** → selecciona el `.cer` → siguiente → siguiente →
   finalizar.
5. Repite la importación en
   `Directivas de clave pública > Editores de confianza`.
6. Vincula la GPO a la OU correspondiente y en los equipos ejecuta:

   ```cmd
   gpupdate /force
   ```

   Los almacenes de certificados de equipo se aplican en el arranque o en el
   refresco de directivas; puede ser necesario reiniciar.

7. Verifica en un equipo cliente:

   ```powershell
   Get-ChildItem Cert:\LocalMachine\Root, Cert:\LocalMachine\TrustedPublisher |
     Where-Object { $_.Subject -like '*Ecommerce-JCTI CRM Code Signing*' } |
     Format-List Subject, Thumbprint, NotAfter
   ```

Si prefieres un script dentro de la GPO, usa
`Install-EcommerceCRMCodeSigningCert.ps1` como script de inicio (se ejecuta como
SYSTEM y escribe en `LocalMachine`).

## Opción 2: Intune

### 2.1 Perfil de certificado de confianza (Root)

1. Intune → **Dispositivos** → **Configuración** → **Crear** →
   **Nueva directiva**.
2. Plataforma: **Windows 10 y versiones posteriores**.
3. Tipo: **Plantillas** → **Certificado de confianza**
   (`Trusted certificate`).
4. Sube `Ecommerce-JCTI-CRM-CodeSigning.cer`.
5. Asigna el perfil al grupo de dispositivos correspondiente.

Esto despliega el certificado en `LocalMachine\Root`.

### 2.2 Script de plataforma (Root + TrustedPublisher, recomendado)

Intune no tiene una plantilla integrada para `TrustedPublisher`, así que se usa
un script de plataforma:

1. Intune → **Dispositivos** → **Scripts y correcciones** →
   **Scripts de plataforma** → **Agregar** → **Windows 10 y versiones posteriores**.
2. Sube `Install-EcommerceCRMCodeSigningCert-Intune.ps1`.
3. Configuración:
   - **Ejecutar este script con las credenciales del usuario que inició sesión**:
     **No** (se ejecuta como SYSTEM).
   - **Aplicar la comprobación de firma del script**: **No**.
   - **Ejecutar el script en PowerShell de 64 bits**: **Sí**.
4. Asigna el script al grupo de dispositivos.
5. El script instala el certificado en `Root` y `TrustedPublisher` de forma
   idempotente y termina con código 0.

Si rotas el certificado, regenera el script incrustado antes de volver a subirlo:

```bash
npm run cert:intune
```

## Verificar que la firma es válida

En un equipo con el certificado desplegado:

```powershell
Get-AuthenticodeSignature .\EcommerceCRM-Setup-1.0.0.exe |
  Format-List Status, StatusMessage, SignerCertificate
```

Resultado esperado:

- `Status: Valid`
- `SignerCertificate.Subject` contiene `CN=Ecommerce-JCTI CRM Code Signing`
- `SignerCertificate.Thumbprint` coincide con el desplegado

También se puede revisar el certificado de la app instalada:

```powershell
Get-AuthenticodeSignature "$env:LOCALAPPDATA\Programs\Ecommerce CRM\EcommerceCRM.exe"
```

Si aparece `UnknownError` o el estado no es válido, el certificado no está en los
almacenes del equipo o la política no se ha aplicado todavía.

## SmartScreen

- En equipos **con** el certificado instalado y el archivo distribuido por
  Intune, GPO o un recurso interno, normalmente no aparece la advertencia de
  editor desconocido.
- En equipos **sin** el certificado (por ejemplo, alguien externo que descarga el
  instalador de internet), SmartScreen puede seguir advirtiendo. Ese es el
  límite de un certificado autofirmado: solo es confiable donde se instala.
- Para confianza pública sin desplegar nada, se necesita un certificado OV/EV o
  Azure Trusted Signing.

## Rotación del certificado

1. Genera el nuevo certificado:
   - Windows: `.\scripts\New-EcommerceCRMCodeSigningCert.ps1 -Force`
   - Linux/macOS: `FORCE=1 ./scripts/generate-signing-cert.sh`
2. Recompila: `npm run build:win`
3. Regenera el script de Intune: `npm run cert:intune`
4. Despliega el nuevo `.cer` por GPO/Intune.
5. Mantén el certificado anterior en los almacenes hasta que todos los equipos
   tengan el nuevo; las firmas antiguas siguen siendo válidas mientras el
   certificado viejo esté vigente y sea de confianza.
6. Cuando ya no queden instaladores firmados con el anterior, retíralo.

## Retirar la confianza

Con GPO/Intune, elimina el certificado de la política y del script, y fuerza el
refresco. En un equipo aislado:

```powershell
Get-ChildItem Cert:\LocalMachine\Root, Cert:\LocalMachine\TrustedPublisher |
  Where-Object { $_.Subject -like '*Ecommerce-JCTI CRM Code Signing*' } |
  Remove-Item
```

Si la GPO sigue aplicándose, el certificado volverá a instalarse.

## Seguridad

- `certs/Ecommerce-JCTI-CRM-CodeSigning.pfx`, `certs/Ecommerce-JCTI-CRM-CodeSigning.key` y
  `certs/.pfx-password` **nunca** deben subirse al repositorio. Ya están en
  `.gitignore`.
- Restringe la ACL del PFX y de la contraseña al usuario que compila.
- Guarda una copia segura del PFX: si se pierde, no podrás firmar actualizaciones
  con la misma identidad y tendrás que rotar y redistribuir el certificado.
- Si el PFX se filtra, cualquiera podría firmar software suplantando a Ecommerce:
  retira la confianza del certificado, genera uno nuevo, recompila y redistribuye.
