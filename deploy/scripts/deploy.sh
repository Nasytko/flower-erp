#!/usr/bin/env bash
# Flower ERP — production deploy.
# Build → migrate → start services → verify health.
#
# Optional: DRY_RUN=1, SKIP_DOCKER_CLEANUP=1, PRE_MIGRATE_BACKUP=1, ALLOW_DIRTY_DEPLOY=1

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=lib/compose.sh
source "${SCRIPT_DIR}/lib/compose.sh"
# shellcheck source=lib/database.sh
source "${SCRIPT_DIR}/lib/database.sh"
# shellcheck source=lib/health.sh
source "${SCRIPT_DIR}/lib/health.sh"

DRY_RUN="${DRY_RUN:-0}"
SKIP_DOCKER_CLEANUP="${SKIP_DOCKER_CLEANUP:-0}"
PRE_MIGRATE_BACKUP="${PRE_MIGRATE_BACKUP:-0}"
ON_ERROR_HANDLED=0

run() {
  if [[ "${DRY_RUN}" == "1" ]]; then
    printf '[dry-run] %s\n' "$*"
    return 0
  fi
  "$@"
}

on_error() {
  local exit_code=$?
  if [[ "${ON_ERROR_HANDLED}" -eq 1 ]]; then
    exit "${exit_code}"
  fi
  ON_ERROR_HANDLED=1
  printf '\nERROR: deploy failed (exit %s).\n' "${exit_code}" >&2
  if [[ "${DRY_RUN}" != "1" ]]; then
    health_show_service_logs api 150
    health_show_service_logs backoffice 150
    cat >&2 <<'EOF'
Hints:
  ./deploy/scripts/status.sh
  Scroll up for the first "ERROR:" line (cause is not always migrations).
  If migrations are up to date, force app refresh:
    docker compose -f docker-compose.production.yml --env-file .env.production build api backoffice
    docker compose -f docker-compose.production.yml --env-file .env.production up -d --remove-orphans api backoffice
  ./deploy/scripts/preflight.sh
  ./deploy/scripts/rollback.sh
  ./deploy/scripts/restore-db.sh /path/to/backup.dump
  Failed migration recovery: docs/database-change-workflow.md section E
EOF
  fi
  exit "${exit_code}"
}

trap on_error ERR

main() {
  local git_commit git_branch

  cd "${DEPLOY_ROOT}"
  deploy_common_init
  deploy_check_docker
  deploy_check_host_tools
  deploy_load_env
  deploy_compose_validate

  read -r git_commit git_branch <<< "$(deploy_git_info)"
  deploy_log "Flower ERP deploy"
  deploy_log "  Root:    ${DEPLOY_ROOT}"
  deploy_log "  Project: ${COMPOSE_PROJECT_NAME}"
  deploy_log "  Git:     ${git_commit} (${git_branch})"

  deploy_check_git_clean
  deploy_check_disk_space

  deploy_snapshot_previous_state

  if [[ "${DRY_RUN}" == "1" ]]; then
    deploy_warn "DRY RUN — no build, migrate, or container changes."
  fi

  deploy_log "[1/4] Building images (api, backoffice, migrate)..."
  run deploy_compose build api backoffice
  run deploy_compose_migrate build migrate

  deploy_log "Verifying migration SQL safety..."
  if [[ "${DRY_RUN}" == "1" ]]; then
    run deploy_run_migration_safety
  else
    deploy_run_migration_safety \
      || deploy_die "Migration safety check failed. Fix migration.sql before deploy."
  fi

  deploy_log "[2/4] Checking migration state..."
  if [[ "${DRY_RUN}" == "1" ]]; then
    run deploy_compose_migrate run --rm migrate migrate status
  else
    if [[ "${PRE_MIGRATE_BACKUP}" == "1" ]]; then
      deploy_log "Pre-migrate backup (PRE_MIGRATE_BACKUP=1)..."
      "${SCRIPT_DIR}/backup-db.sh"
    fi
    prisma_refresh_migrate_status
    prisma_assert_status_readable
    prisma_assert_no_failed_migrations
    prisma_migrate_deploy
  fi

  deploy_log "[3/4] Starting api and backoffice..."
  run deploy_compose up -d --remove-orphans api backoffice

  if [[ "${DRY_RUN}" == "1" ]]; then
    deploy_log "[dry-run] Skipping health checks."
    exit 0
  fi

  deploy_log "[4/4] Verifying health..."
  health_smoke_production

  prisma_invalidate_status_cache
  prisma_refresh_migrate_status
  prisma_assert_status_readable
  prisma_assert_no_failed_migrations
  if [[ "${PRISMA_MIGRATE_STATUS_CLASS}" == "pending" ]]; then
    deploy_die "Pending migrations remain after deploy."
  fi
  if health_any_unhealthy; then
    bo_url="$(health_backoffice_url)"
    api_ready_url="$(health_api_url health/ready)"
    if health_code_ok "$(health_http_code "${bo_url}")" \
      && health_code_ok "$(health_http_code "${api_ready_url}")"; then
      deploy_warn "Docker reports unhealthy container(s), but HTTP checks are OK — continuing."
    else
      deploy_die "One or more containers are unhealthy."
    fi
  fi

  deploy_save_deploy_state
  deploy_compose ps -a

  if [[ "${SKIP_DOCKER_CLEANUP}" != "1" ]]; then
    deploy_log "Post-deploy cleanup (dangling images)..."
    docker image prune -f >/dev/null 2>&1 || deploy_warn "docker image prune failed."
  fi

  deploy_log "Deploy complete."
}

main "$@"
