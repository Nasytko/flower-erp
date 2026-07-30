#!/usr/bin/env bash
# Pre-deploy checks (local or VPS). Does not build images or restart containers.
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=lib/compose.sh
source "${SCRIPT_DIR}/lib/compose.sh"

cd "${DEPLOY_ROOT}"
deploy_common_init
deploy_check_docker
deploy_check_host_tools

if [[ -f "${ENV_FILE}" && -f "${COMPOSE_FILE}" ]]; then
  deploy_load_env
  deploy_compose_validate
else
  deploy_warn "${ENV_FILE} or ${COMPOSE_FILE} missing — skipping compose validation."
fi

deploy_log "Migration SQL safety..."
deploy_run_migration_safety

if command -v node >/dev/null 2>&1 && command -v pnpm >/dev/null 2>&1; then
  deploy_log "Prisma validate..."
  pnpm prisma:validate
else
  deploy_warn "node/pnpm not available — skipping prisma:validate (run pnpm verify:release locally)."
fi

deploy_log "Deploy script syntax/tests..."
bash deploy/tests/run-all.sh

deploy_log "Preflight OK."
deploy_log "Next on VPS: git pull && ./deploy/scripts/deploy.sh"
deploy_log "Before destructive schema changes: PRE_MIGRATE_BACKUP=1 ./deploy/scripts/deploy.sh"
