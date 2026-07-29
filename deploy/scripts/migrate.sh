#!/usr/bin/env bash
# Run Prisma migrations against production database.
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=lib/compose.sh
source "${SCRIPT_DIR}/lib/compose.sh"
# shellcheck source=lib/database.sh
source "${SCRIPT_DIR}/lib/database.sh"

export DEPLOY_ROOT
deploy_common_init
deploy_load_env

deploy_log "Flower ERP: running database migrations (project=${COMPOSE_PROJECT_NAME})"
deploy_compose_migrate build migrate
prisma_migrate_deploy
deploy_log "Migrations completed successfully."
