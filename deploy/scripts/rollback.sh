#!/usr/bin/env bash
# Roll back Flower ERP application images only (database schema is NOT reverted).
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=lib/compose.sh
source "${SCRIPT_DIR}/lib/compose.sh"
# shellcheck source=lib/health.sh
source "${SCRIPT_DIR}/lib/health.sh"

export DEPLOY_ROOT
deploy_common_init
deploy_check_docker
deploy_load_env

cat <<'EOF'

WARNING: Application rollback only.
Database migrations are NOT automatically rolled back.

EOF

deploy_load_previous_state

read -r -p "Rollback api/backoffice to previous image tags? Type yes: " confirm
[[ "${confirm}" == "yes" ]] || { echo "Aborted."; exit 1; }

deploy_log "Rolling back to:"
deploy_log "  API:        ${FLOWER_API_IMAGE}"
deploy_log "  Backoffice: ${FLOWER_BACKOFFICE_IMAGE}"

export FLOWER_API_IMAGE FLOWER_BACKOFFICE_IMAGE
deploy_compose up -d --no-deps --force-recreate api backoffice
health_smoke_production
deploy_compose ps -a
deploy_log "Application rollback complete."
