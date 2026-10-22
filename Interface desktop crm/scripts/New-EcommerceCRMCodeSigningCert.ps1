# Genera el certificado autofirmado de code signing de Ecommerce (Windows).
#
# Uso recomendado (PowerShell como usuario normal):
#   .\scripts\New-EcommerceCRMCodeSigningCert.ps1
#
# Rotacion (sobrescribe el certificado actual):
#   .\scripts\New-EcommerceCRMCodeSigningCert.ps1 -Force
#
# Despues de generarlo:
#   1. Compila:  npm run build:win
#   2. Distribuye deployment\Ecommerce-JCTI-CRM-CodeSigning.cer por GPO/Intune
#      (ver deployment\README.md).

[CmdletBinding()]
param(
    [string]$Subject = 'CN=Ecommerce-JCTI CRM Code Signing, O=Ecommerce-JCTI, OU=Tecnologia, C=CO',
    [int]$Years = 10,
    [string]$OutputDirectory = (Join-Path (Split-Path -Parent $PSScriptRoot) 'certs'),
    [SecureString]$PfxPassword,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

$pfxPath = Join-Path $OutputDirectory 'Ecommerce-JCTI-CRM-CodeSigning.pfx'
$cerPath = Join-Path $OutputDirectory 'Ecommerce-JCTI-CRM-CodeSigning.cer'
$crtPath = Join-Path $OutputDirectory 'Ecommerce-JCTI-CRM-CodeSigning.crt'
$passwordFile = Join-Path $OutputDirectory '.pfx-password'

if ((Test-Path $pfxPath) -and -not $Force) {
    throw "Ya existe $pfxPath. Usa -Force para rotar el certificado (esto invalida la confianza hasta redistribuir el .cer)."
}

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

if ($PfxPassword) {
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($PfxPassword)
    try {
        $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
} else {
    $bytes = New-Object byte[] 24
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($bytes)
    } finally {
        $rng.Dispose()
    }
    $plainPassword = [Convert]::ToBase64String($bytes)
}

Write-Host 'Creando certificado de code signing...'
$cert = New-SelfSignedCertificate `
    -Type CodeSigningCert `
    -Subject $Subject `
    -KeyAlgorithm RSA `
    -KeyLength 4096 `
    -HashAlgorithm SHA256 `
    -KeyExportPolicy Exportable `
    -KeySpec Signature `
    -KeyUsage DigitalSignature `
    -NotAfter (Get-Date).AddYears($Years) `
    -CertStoreLocation 'Cert:\CurrentUser\My'

try {
    $securePassword = ConvertTo-SecureString -String $plainPassword -AsPlainText -Force
    Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $securePassword | Out-Null
    Export-Certificate -Cert $cert -FilePath $cerPath -Type CERT | Out-Null

    $pem = "-----BEGIN CERTIFICATE-----`r`n" +
        [Convert]::ToBase64String($cert.RawData, 'InsertLineBreaks') +
        "`r`n-----END CERTIFICATE-----`r`n"
    [IO.File]::WriteAllText($crtPath, $pem, [Text.ASCIIEncoding]::new())
    [IO.File]::WriteAllText($passwordFile, $plainPassword, [Text.UTF8Encoding]::new($false))

    $deploymentDir = Join-Path (Split-Path -Parent $OutputDirectory) 'deployment'
    New-Item -ItemType Directory -Force -Path $deploymentDir | Out-Null
    Copy-Item -Path $cerPath -Destination (Join-Path $deploymentDir 'Ecommerce-JCTI-CRM-CodeSigning.cer') -Force

    # Restringir el PFX y la contrasena al usuario actual.
    & icacls.exe $pfxPath /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null
    & icacls.exe $passwordFile /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null

    Write-Host ''
    Write-Host 'Certificado generado.'
    Write-Host "  Subject:    $($cert.Subject)"
    Write-Host "  Thumbprint: $($cert.Thumbprint)"
    Write-Host "  Valido hasta: $($cert.NotAfter.ToString('yyyy-MM-dd'))"
    Write-Host "  PFX:        $pfxPath"
    Write-Host "  CER:        $cerPath"
    Write-Host "  Password:   $passwordFile"
    Write-Host ''
    Write-Host 'Siguiente paso: npm run build:win'
    Write-Host 'Luego publica deployment\Ecommerce-JCTI-CRM-CodeSigning.cer por GPO/Intune.'
    Write-Host 'Regenera el script de Intune con: npm run cert:intune'
} finally {
    Remove-Item -Path $cert.PSPath -Force -ErrorAction SilentlyContinue
}
