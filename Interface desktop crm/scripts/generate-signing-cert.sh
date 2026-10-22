#!/usr/bin/env bash
# Genera el certificado autofirmado de code signing de Ecommerce (Linux/macOS).
#
# Uso:
#   ./scripts/generate-signing-cert.sh
#   FORCE=1 ./scripts/generate-signing-cert.sh   # rota el certificado
#
# Variables opcionales:
#   OUT_DIR  (default: <proyecto>/certs)
#   SUBJECT  (default: /C=CO/O=Ecommerce-JCTI/OU=Tecnologia/CN=Ecommerce-JCTI CRM Code Signing)
#   DAYS     (default: 3650)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${OUT_DIR:-$ROOT/certs}"
SUBJECT="${SUBJECT:-/C=CO/O=Ecommerce-JCTI/OU=Tecnologia/CN=Ecommerce-JCTI CRM Code Signing}"
DAYS="${DAYS:-3650}"
FORCE="${FORCE:-0}"

PFX="$OUT/Ecommerce-JCTI-CRM-CodeSigning.pfx"
KEY="$OUT/Ecommerce-JCTI-CRM-CodeSigning.key"
CRT="$OUT/Ecommerce-JCTI-CRM-CodeSigning.crt"
CER="$OUT/Ecommerce-JCTI-CRM-CodeSigning.cer"
PASSWORD_FILE="$OUT/.pfx-password"
DEPLOYMENT="$ROOT/deployment"

if [[ -f "$PFX" && "$FORCE" != "1" ]]; then
  echo "Ya existe $PFX. Usa FORCE=1 para rotar (invalida la confianza hasta redistribuir el .cer)." >&2
  exit 1
fi

command -v openssl >/dev/null 2>&1 || {
  echo "Falta openssl." >&2
  exit 1
}

mkdir -p "$OUT" "$DEPLOYMENT"

echo "Creando certificado de code signing..."
openssl req -x509 -newkey rsa:4096 -sha256 -days "$DAYS" -nodes \
  -keyout "$KEY" \
  -out "$CRT" \
  -subj "$SUBJECT" \
  -addext "basicConstraints=critical,CA:TRUE" \
  -addext "keyUsage=critical,digitalSignature,keyCertSign" \
  -addext "extendedKeyUsage=critical,codeSigning" \
  -addext "subjectKeyIdentifier=hash" 2>/dev/null

openssl rand -base64 -out "$PASSWORD_FILE" 24
openssl pkcs12 -export \
  -out "$PFX" \
  -inkey "$KEY" \
  -in "$CRT" \
  -name "Ecommerce-JCTI CRM Code Signing" \
  -passout "file:$PASSWORD_FILE"

openssl x509 -in "$CRT" -outform DER -out "$CER"
cp "$CER" "$DEPLOYMENT/Ecommerce-JCTI-CRM-CodeSigning.cer"

chmod 600 "$KEY" "$PFX" "$PASSWORD_FILE"
chmod 644 "$CRT" "$CER" "$DEPLOYMENT/Ecommerce-JCTI-CRM-CodeSigning.cer"

echo ""
echo "Certificado generado:"
openssl x509 -in "$CRT" -noout -subject -dates -fingerprint -sha256
echo "  PFX:      $PFX"
echo "  CER:      $CER"
echo "  Password: $PASSWORD_FILE"
echo ""
echo "Siguiente paso: npm run build:win"
echo "Luego publica deployment/Ecommerce-JCTI-CRM-CodeSigning.cer por GPO/Intune."
echo "Regenera el script de Intune con: npm run cert:intune"
