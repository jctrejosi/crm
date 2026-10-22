# Instala el certificado publico de code signing de Ecommerce en los almacenes
# de confianza del equipo (LocalMachine).
#
# Uso manual (PowerShell como administrador):
#   .\deployment\Install-EcommerceCRMCodeSigningCert.ps1
#
# GPO: tambien puedes importar Ecommerce-JCTI-CRM-CodeSigning.cer directamente en
#   Equipo > Configuracion > Directivas > Configuracion de Windows >
#   Configuracion de seguridad > Directivas de clave publica >
#   Entidades de certificacion raiz de confianza y Editores de confianza.
#
# Intune: usa Install-EcommerceCRMCodeSigningCert-Intune.ps1 (certificado incrustado).

[CmdletBinding()]
param(
    [string]$CertificatePath = (Join-Path $PSScriptRoot 'Ecommerce-JCTI-CRM-CodeSigning.cer')
)

$ErrorActionPreference = 'Stop'

$principal = New-Object Security.Principal.WindowsPrincipal(
    [Security.Principal.WindowsIdentity]::GetCurrent()
)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Este script debe ejecutarse como administrador (o como SYSTEM en Intune).'
}

if (-not (Test-Path $CertificatePath)) {
    throw "No se encontro el certificado: $CertificatePath"
}

$resolved = (Resolve-Path $CertificatePath).Path
$cert = [Security.Cryptography.X509Certificates.X509Certificate2]::new($resolved)

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

Write-Host ''
Write-Host 'Certificado de Ecommerce instalado.'
Write-Host "  Subject:    $($cert.Subject)"
Write-Host "  Thumbprint: $($cert.Thumbprint)"
Write-Host "  Valido hasta: $($cert.NotAfter.ToString('yyyy-MM-dd'))"
Write-Host ''
Write-Host 'Verifica una firma con:'
Write-Host '  Get-AuthenticodeSignature ".\EcommerceCRM-Setup-1.0.0.exe" | Format-List Status,SignerCertificate'
