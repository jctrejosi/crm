# Instala el certificado de code signing de Ecommerce en los almacenes
# LocalMachine\Root y LocalMachine\TrustedPublisher.
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
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
RRE1hKxZasvv+DFRfw==
'@

    $bytes = [Convert]::FromBase64String(($base64 -replace '\s', ''))
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
                Write-Host "Certificado instalado en LocalMachine\$storeName"
            } else {
                Write-Host "Certificado ya presente en LocalMachine\$storeName"
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
