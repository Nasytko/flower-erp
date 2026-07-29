#!/usr/bin/env bash
# Flower ERP — reset test-only PostgreSQL database (flower_erp) from Prisma migrations.
#
# NEVER called from deploy.sh. Requires explicit confirmation flags.
#
# Example:
#   CONFIRM_RESET_TEST_DATABASE=YES \
#   CONFIRM_ALL_FLOWER_DATA_CAN_BE_DELETED=YES \
#   ALLOW_RESET_WITHOUT_BACKUP=YES \
#     ./deploy/scripts/reset-test-database.sh

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# shellcheck source=lib/deploy-common.sh
source "${SCRIPT_DIR}/lib/deploy-common.sh"
# shellcheck source=lib/pg-exec.sh
source "${SCRIPT_DIR}/lib/pg-exec.sh"
# shellcheck source=lib/prisma-migrate.sh
source "${SCRIPT_DIR}/lib/prisma-migrate.sh"
# shellcheck source=lib/reset-test-database-lib.sh
source "${SCRIPT_DIR}/lib/reset-test-database-lib.sh"

ON_ERROR_HANDLED=0

reset_on_error() {
  local exit_code=$?
  if [[ "${ON_ERROR_HANDLED}" -eq 1 ]]; then
    exit "${exit_code}"
  fi
  ON_ERROR_HANDLED=1
  printf '\nERROR: reset failed (exit %s).\n' "${exit_code}" >&2
  printf 'PostgreSQL container/volume were NOT deleted.\n' >&2
  printf 'Fix migrations before starting api/backoffice.\n' >&2
  exit "${exit_code}"
}

trap reset_on_error ERR

reset_stop_flower_app_containers() {
  deploy_log "Stopping Flower ERP api/backoffice (PostgreSQL stays running)..."
  deploy_compose stop api backoffice 2>/dev/null || true
}

reset_run_migrations() {
  deploy_log "Applying Prisma migrations (migrate deploy)..."
  "${SCRIPT_DIR}/migrate.sh"
}

reset_start_flower_app_containers() {
  deploy_log "Starting Flower ERP api/backoffice..."
  deploy_compose up -d --force-recreate api
  local deadline=$((SECONDS + 120))
  until deploy_compose ps api | grep -q "(healthy)"; do
    if (( SECONDS > deadline )); then
      deploy_compose logs --tail=80 api
      deploy_die "API did not become healthy within 120s after reset."
    fi
    sleep 3
  done
  deploy_compose up -d --force-recreate backoffice

  local api_port="${FLOWER_API_PORT:-4100}"
  local bo_port="${FLOWER_BACKOFFICE_PORT:-3100}"
  curl -sf "http://127.0.0.1:${api_port}/api/v1/health/live" >/dev/null \
    || deploy_die "API /health/live failed after reset."
  curl -sf "http://127.0.0.1:${api_port}/api/v1/health/ready" >/dev/null \
    || deploy_die "API /health/ready failed after reset."
  local bo_code
  bo_code="$(curl -sf -o /dev/null -w '%{http_code}' "http://127.0.0.1:${bo_port}/" || echo 000)"
  [[ "${bo_code}" =~ ^[23] ]] || deploy_die "Backoffice HTTP check failed after reset (status ${bo_code})."
}

reset_prechecks() {
  deploy_check_docker
  deploy_common_init
  pg_load_env
  reset_validate_target_database

  pg_assert_psql_in_migrate_image
  pg_verify_connection

  deploy_log "PostgreSQL admin: container=${FLOWER_POSTGRES_CONTAINER:-leadflow-postgres-1}, user=$(reset_admin_user), maintenance_db=$(reset_admin_db)"
  reset_verify_admin_psql

  deploy_log "Listing databases (names only)..."
  reset_list_databases | sed 's/^/    /'

  local owner="${FLOWER_MIGRATE_ROLE:-flower_migrate}"
  if reset_database_exists "${RESET_EXPECTED_DATABASE}"; then
    owner="$(reset_current_database_owner "${RESET_EXPECTED_DATABASE}")"
    [[ -n "${owner}" ]] || owner="${FLOWER_MIGRATE_ROLE:-flower_migrate}"
    deploy_log "Current owner of ${RESET_EXPECTED_DATABASE}: ${owner}"
  else
    deploy_log "Database ${RESET_EXPECTED_DATABASE} does not exist yet; will create with owner ${owner}."
  fi

  RESET_DB_OWNER="${owner}"
  export RESET_DB_OWNER

  local container="${FLOWER_POSTGRES_CONTAINER:-leadflow-postgres-1}"
  if ! docker ps --format '{{.Names}}' | grep -qx "${container}"; then
    deploy_die "PostgreSQL container ${container} is not running."
  fi

  reset_stop_flower_app_containers
}

main() {
  cd "${DEPLOY_ROOT}"

  reset_confirm_interactive

  deploy_log "Flower ERP test database reset"
  deploy_log "  Target database: ${RESET_EXPECTED_DATABASE}"
  deploy_log "  Project: ${COMPOSE_PROJECT_NAME:-flower-erp}"

  reset_prechecks
  reset_attempt_backup

  deploy_log "Recreating database ${RESET_EXPECTED_DATABASE}..."
  reset_drop_and_recreate_database "${RESET_EXPECTED_DATABASE}" "${RESET_DB_OWNER}"

  pg_load_env
  pg_verify_connection

  reset_run_migrations

  reset_reapply_table_grants "${RESET_EXPECTED_DATABASE}"

  pg_load_env
  reset_validate_post_migrate

  prisma_refresh_migrate_status
  prisma_assert_status_readable
  if [[ "${PRISMA_MIGRATE_STATUS_CLASS}" != "up_to_date" ]]; then
    deploy_die "Prisma migration status is not up to date after reset."
  fi

  reset_run_optional_seed
  reset_start_flower_app_containers

  deploy_compose ps -a
  deploy_log "Reset complete. Database ${RESET_EXPECTED_DATABASE} recreated from current migrations."
}

main "$@"
