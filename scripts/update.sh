#!/usr/bin/env bash
#
# This file is part of NetConfig Lab Image Manager.
#
# NetConfig Lab Image Manager is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# NetConfig Lab Image Manager is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with NetConfig Lab Image Manager.  If not, see <https://www.gnu.org/licenses/>.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

CHECK_ONLY=0
FORCE_DIRTY=0
NO_BUILD=0

log() {
  printf '[update] %s\n' "$*"
}

fail() {
  printf '[update] erro: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Uso:
  ./scripts/update.sh [--check] [--force-dirty] [--no-build]

Opções:
  --check        Apenas verifica se há commits novos no upstream.
  --force-dirty  Continua mesmo com alterações locais no git.
  --no-build     Sobe o stack sem rebuild explícito das imagens.
  --help         Exibe esta ajuda.

Fluxo padrão:
  1. valida o repositório git
  2. faz fetch do upstream
  3. aplica git pull --ff-only
  4. executa docker compose up -d --build --remove-orphans
EOF
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

resolve_compose_cmd() {
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD=("docker" "compose")
    return 0
  fi

  if command_exists docker-compose; then
    COMPOSE_CMD=("docker-compose")
    return 0
  fi

  fail "docker compose não encontrado. Instale Docker Compose antes de atualizar."
}

while (($# > 0)); do
  case "$1" in
    --check)
      CHECK_ONLY=1
      ;;
    --force-dirty)
      FORCE_DIRTY=1
      ;;
    --no-build)
      NO_BUILD=1
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      fail "opção inválida: $1"
      ;;
  esac
  shift
done

command_exists git || fail "git não encontrado."
command_exists docker || fail "docker não encontrado."

cd "${PROJECT_DIR}"

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "o diretório ${PROJECT_DIR} não é um repositório git."

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[ "${CURRENT_BRANCH}" != "HEAD" ] || fail "HEAD destacado não é suportado por este script."

UPSTREAM_REF="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)"
if [ -z "${UPSTREAM_REF}" ]; then
  UPSTREAM_REMOTE="origin"
  UPSTREAM_BRANCH="${CURRENT_BRANCH}"
  UPSTREAM_REF="${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH}"
else
  UPSTREAM_REMOTE="${UPSTREAM_REF%%/*}"
  UPSTREAM_BRANCH="${UPSTREAM_REF#*/}"
fi

DIRTY_STATUS="$(git status --short)"
if [ -n "${DIRTY_STATUS}" ] && [ "${FORCE_DIRTY}" -ne 1 ]; then
  printf '%s\n' "${DIRTY_STATUS}" >&2
  fail "há alterações locais no repositório. Faça commit/stash ou use --force-dirty."
fi

log "projeto: ${PROJECT_DIR}"
log "branch atual: ${CURRENT_BRANCH}"
log "upstream: ${UPSTREAM_REF}"
log "sincronizando referências remotas..."
git fetch --tags --prune "${UPSTREAM_REMOTE}"

git rev-parse --verify "${UPSTREAM_REF}" >/dev/null 2>&1 || fail "não foi possível localizar ${UPSTREAM_REF}."

BEHIND_COUNT="$(git rev-list --count "HEAD..${UPSTREAM_REF}" 2>/dev/null || echo 0)"
AHEAD_COUNT="$(git rev-list --count "${UPSTREAM_REF}..HEAD" 2>/dev/null || echo 0)"

log "status: ${AHEAD_COUNT} commit(s) à frente e ${BEHIND_COUNT} commit(s) atrás do upstream."

if [ "${CHECK_ONLY}" -eq 1 ]; then
  if [ "${BEHIND_COUNT}" -eq 0 ]; then
    log "nenhum update pendente."
  else
    log "update disponível."
  fi
  exit 0
fi

if [ "${BEHIND_COUNT}" -gt 0 ]; then
  log "aplicando git pull --ff-only..."
  git pull --ff-only "${UPSTREAM_REMOTE}" "${UPSTREAM_BRANCH}"
else
  log "repositório já está atualizado."
fi

resolve_compose_cmd

if [ "${NO_BUILD}" -eq 1 ]; then
  log "subindo stack sem rebuild explícito..."
  "${COMPOSE_CMD[@]}" up -d --remove-orphans
else
  log "reconstruindo e subindo stack..."
  "${COMPOSE_CMD[@]}" up -d --build --remove-orphans
fi

CURRENT_VERSION="$(tr -d '\n' < VERSION 2>/dev/null || true)"
if [ -n "${CURRENT_VERSION}" ]; then
  log "update concluído. versão local: ${CURRENT_VERSION}"
else
  log "update concluído."
fi
