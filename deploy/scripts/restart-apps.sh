#!/usr/bin/env bash
# Rebuild and restart api + backoffice without full deploy health gate.
# Runs pending DB migrations by default — use SKIP_MIGRATE=1 only when you are sure schema is current.
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=lib/compose.sh
source "${SCRIPT_DIR}/lib/compose.sh"
# shellcheck source=lib/database.sh
source "${SCRIPT_DIR}/lib/database.sh"

NO_CACHE="${NO_CACHE:-0}"
FORCE_RECREATE="${FORCE_RECREATE:-1}"
SKIP_MIGRATE="${SKIP_MIGRATE:-0}"

cd "${DEPLOY_ROOT}"
deploy_common_init
deploy_check_docker
deploy_load_env
deploy_compose_validate

read -r git_commit git_branch <<< "$(deploy_git_info)"
deploy_log "Restart api + backoffice (git ${git_commit} on ${git_branch})"

if [[ "${SKIP_MIGRATE}" != "1" ]]; then
  deploy_log "Applying pending database migrations..."
  deploy_compose_migrate build migrate
  prisma_migrate_deploy
else
  deploy_warn "SKIP_MIGRATE=1 — schema may be out of date; API errors like missing is_showcase are possible."
fi

build_args=()
if [[ "${NO_CACHE}" == "1" ]]; then
  build_args+=(--no-cache)
fi

deploy_compose build "${build_args[@]}" api backoffice

up_args=(-d --remove-orphans)
if [[ "${FORCE_RECREATE}" == "1" ]]; then
  up_args+=(--force-recreate)
fi
up_args+=(api backoffice)

deploy_compose up "${up_args[@]}"
deploy_compose ps -a

deploy_log "Done. Run ./deploy/scripts/status.sh to verify HTTP checks."
