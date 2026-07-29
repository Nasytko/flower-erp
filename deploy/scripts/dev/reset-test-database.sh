#!/usr/bin/env bash
# DEV/STAGING ONLY — reset test database flower_erp from Prisma migrations.
# NEVER run on production VPS without explicit dev approval.
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

if [[ "${ALLOW_DEV_DATABASE_RESET:-}" != "YES" ]]; then
  echo "ERROR: Refusing reset. Set ALLOW_DEV_DATABASE_RESET=YES (dev/staging only)." >&2
  exit 1
fi

# shellcheck source=../lib/common.sh
source "${SCRIPT_DIR}/../lib/common.sh"
# shellcheck source=../lib/compose.sh
source "${SCRIPT_DIR}/../lib/compose.sh"
# shellcheck source=../lib/database.sh
source "${SCRIPT_DIR}/../lib/database.sh"
# shellcheck source=../lib/health.sh
source "${SCRIPT_DIR}/../lib/health.sh"
# shellcheck source=lib/reset-test-database-lib.sh
source "${SCRIPT_DIR}/lib/reset-test-database-lib.sh"

ON_ERROR_HANDLED=0
reset_on_error() {
  local exit_code=$?
  [[ "${ON_ERROR_HANDLED}" -eq 1 ]] && exit "${exit_code}"
  ON_ERROR_HANDLED=1
  printf '\nERROR: reset failed (exit %s).\n' "${exit_code}" >&2
  exit "${exit_code}"
}
trap reset_on_error ERR

reset_stop_flower_app_containers() {
  deploy_log "Stopping Flower ERP api/backoffice..."
  deploy_compose stop api backoffice 2>/dev/null || true
}

reset_start_flower_app_containers() {
  deploy_log "Starting Flower ERP api/backoffice..."
  deploy_compose up -d --remove-orphans api backoffice
  health_smoke_production
}

reset_prechecks() {
  deploy_check_docker
  deploy_common_init
  deploy_load_env
  reset_validate_target_database
  pg_assert_psql_in_migrate_image
  pg_verify_connection
  reset_verify_admin_psql
  reset_stop_flower_app_containers
}

main() {
  cd "${DEPLOY_ROOT}"
  reset_confirm_interactive
  reset_prechecks

  local owner="${FLOWER_MIGRATE_ROLE:-flower_migrate}"
  if reset_database_exists "${RESET_EXPECTED_DATABASE}"; then
    owner="$(reset_current_database_owner "${RESET_EXPECTED_DATABASE}")"
    [[ -n "${owner}" ]] || owner="${FLOWER_MIGRATE_ROLE:-flower_migrate}"
  fi

  reset_attempt_backup
  reset_drop_and_recreate_database "${RESET_EXPECTED_DATABASE}" "${owner}"
  "${SCRIPT_DIR}/../migrate.sh"
  reset_reapply_table_grants "${RESET_EXPECTED_DATABASE}"
  reset_validate_post_migrate
  prisma_refresh_migrate_status
  prisma_assert_status_readable
  reset_run_optional_seed
  reset_start_flower_app_containers
  deploy_log "Reset complete."
}

main "$@"
