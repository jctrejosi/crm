'use strict';

/**
 * Genera deployment/Install-EcommerceCRMCodeSigningCert-Intune.ps1 a partir del
 * certificado publico deployment/Ecommerce-JCTI-CRM-CodeSigning.cer.
 *
 * Intune (Platform scripts) solo acepta un archivo .ps1, por eso el certificado
 * se incrusta en Base64. El script instala la confianza en LocalMachine\Root y
 * LocalMachine\TrustedPublisher, que es donde Windows valida Authenticode.
 *
 * Uso: npm run cert:intune
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
const cerPath = path.join(root, 'deployment', 'Ecommerce-JCTI-CRM-CodeSigning.cer');
const outPath = path.join(root, 'deployment', 'Install-EcommerceCRMCodeSigningCert-Intune.ps1');

if (!fs.existsSync(cerPath)) {
  console.error(`No existe ${cerPath}. Genera el certificado primero.`);
  process.exit(1);
}

const base64 = fs.readFileSync(cerPath).toString('base64');
const wrapped = base64.match(/.{1,76}/g).join('\n');

const script = `# Instala el certificado de code signing de Ecommerce en los almacenes
# LocalMachine\\Root y LocalMachine\\TrustedPublisher.
#
# Generado por scripts/build-intune-cert-script.cjs. No editar a mano:
# regeneralo con "npm run cert:intune" si rotas el certificado.
#
# Intune: Devices > Scripts and remediations > Platform scripts > Add.
#   Run this script using the logged on credentials: No (SYSTEM)
#   Enforce script signature check: No
#   Run script in 64-bit PowerShell: Yes

$ErrorActionPreference = 'Stop'
$temp = $null

try {
    $base64 = @'
${wrapped}
'@

    $bytes = [Convert]::FromBase64String(($base64 -replace '\\s', ''))
    $temp = Join-Path $env:TEMP 'Ecommerce-JCTI-CRM-CodeSigning.cer'
    [IO.File]::WriteAllBytes($temp, $bytes)

    $cert = [Security.Cryptography.X509Certificates.X509Certificate2]::new($temp)

    foreach ($storeName in @('Root', 'TrustedPublisher')) {
        $store = [Security.Cryptography.X509Certificates.X509Store]::new(
            $storeName,
            [Security.Cryptography.X509Certificates.StoreLocation]::LocalMachine
        )
        $store.Open([Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
        try {
            $found = $store.Certificates.Find(
                [Security.Cryptography.X509Certificates.X509FindType]::FindByThumbprint,
                $cert.Thumbprint,
                $false
            )
            if ($found.Count -eq 0) {
                $store.Add($cert)
                Write-Host "Certificado instalado en LocalMachine\\$storeName"
            } else {
                Write-Host "Certificado ya presente en LocalMachine\\$storeName"
            }
        } finally {
            $store.Close()
        }
    }

    Write-Host "Thumbprint: $($cert.Thumbprint)"
} catch {
    Write-Error "No se pudo instalar el certificado de Ecommerce: $_"
    exit 1
} finally {
    if ($temp -and (Test-Path $temp)) {
        Remove-Item -Path $temp -Force -ErrorAction SilentlyContinue
    }
}

exit 0
`;

fs.writeFileSync(outPath, script, 'ascii');
console.log(`Generado ${path.relative(root, outPath)}`);
console.log(`Thumbprint del certificado (SHA-1): ${certThumbprint(cerPath)}`);

// Windows muestra el thumbprint como SHA-1 del certificado DER en hexadecimal.
function certThumbprint(file) {
  return crypto
    .createHash('sha1')
    .update(fs.readFileSync(file))
    .digest('hex')
    .toUpperCase();
}
