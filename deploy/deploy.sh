#!/usr/bin/env bash
# ============================================================
# Despliegue del CRM en el VPS (WSL + Docker) desde la rama `dev`.
#
# Uso:
#   bash deploy/deploy.sh                 # despliega origin/dev
#   bash deploy/deploy.sh <sha|ref>       # despliega un commit/ref concreto
#   DEPLOY_PATH=/ruta bash deploy/deploy.sh
#
# Lo usan GitHub Actions (runner self-hosted) y el operador a mano.
# Delega en `prod.js --build`, que sincroniza docker/.env, construye la imagen
# y levanta el contenedor. No toca secretos ni volúmenes.
# ============================================================
set -Eeuo pipefail

ROOT="${DEPLOY_PATH:-/mnt/c/Users/Desarrolo4/Documents/crm}"
TARGET="${1:-origin/dev}"

log() { printf '[crm-deploy] %s\n' "$*"; }
die() { printf '[crm-deploy] ERROR: %s\n' "$*" >&2; exit 1; }

cd "$ROOT" 2>/dev/null || die "No existe DEPLOY_PATH=$ROOT"
[[ -f prod.js ]] || die "Falta prod.js en $ROOT"
command -v git  >/dev/null || die "git no está instalado"
command -v node >/dev/null || die "node no está en PATH"
command -v docker >/dev/null || die "docker no está en PATH"
docker info >/dev/null 2>&1 || die "Docker no responde (revisa systemctl status docker)"

# El .git/config del checkout apunta al ssh.exe de Windows; se sobreescribe solo
# para este proceso con la clave de despliegue.
GIT_SSH_KEY="${GIT_SSH_KEY:-/etc/mercaldas/deploy_key}"
if [[ -r "$GIT_SSH_KEY" ]]; then
  export GIT_SSH_COMMAND="${GIT_SSH_COMMAND:-ssh -i $GIT_SSH_KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new}"
fi

git_here() {
  git -c safe.directory="$ROOT" -c core.hooksPath=/nonexistent -C "$ROOT" "$@"
}

log "Repositorio: $ROOT"
log "Objetivo   : $TARGET"

git_here fetch --prune origin '+refs/heads/dev:refs/remotes/origin/dev'
git_here rev-parse --verify --quiet "$TARGET^{commit}" >/dev/null \
  || die "El commit/ref '$TARGET' no existe tras el fetch"

git_here checkout -f -B dev "$TARGET"
COMMIT="$(git_here rev-parse --short=12 HEAD)"
log "Checkout en dev: $COMMIT — $(git_here log -1 --pretty=%s)"

node prod.js --build

log "Despliegue completado: $COMMIT"
