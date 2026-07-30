#!/usr/bin/env bash
# Rebuild and restart api + backoffice without full deploy health gate.
# Use when migrations are already applied but deploy.sh fails on health checks.
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=lib/compose.sh
source "${SCRIPT_DIR}/lib/compose.sh"

NO_CACHE="${NO_CACHE:-0}"
FORCE_RECREATE="${FORCE_RECREATE:-1}"

cd "${DEPLOY_ROOT}"
deploy_common_init
deploy_check_docker
deploy_load_env
deploy_compose_validate

read -r git_commit git_branch <<< "$(deploy_git_info)"
deploy_log "Restart api + backoffice (git ${git_commit} on ${git_branch})"

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
