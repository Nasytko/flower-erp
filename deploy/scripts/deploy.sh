#!/usr/bin/env bash
# Flower ERP — production deploy (ORVIX-safe).
# Build → optional Stage C audit/backup → migrate → rolling recreate.
#
# Flags:
#   DRY_RUN=1
#   RUN_STAGE_C_AUDIT=1
#   RUN_STAGE_C_BACKUP=1
#   ALLOW_DESTRUCTIVE_MIGRATIONS=1
#   SKIP_DOCKER_CLEANUP=1

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# shellcheck source=lib/deploy-common.sh
source "${SCRIPT_DIR}/lib/deploy-common.sh"
# shellcheck source=lib/pg-exec.sh
source "${SCRIPT_DIR}/lib/pg-exec.sh"
# shellcheck source=lib/prisma-migrate.sh
source "${SCRIPT_DIR}/lib/prisma-migrate.sh"

ENV_FILE="${ENV_FILE:-${DEPLOY_ROOT}/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-${DEPLOY_ROOT}/docker-compose.production.yml}"
DRY_RUN="${DRY_RUN:-0}"
RUN_STAGE_C_AUDIT="${RUN_STAGE_C_AUDIT:-0}"
RUN_STAGE_C_BACKUP="${RUN_STAGE_C_BACKUP:-0}"
ALLOW_DESTRUCTIVE_MIGRATIONS="${ALLOW_DESTRUCTIVE_MIGRATIONS:-0}"
SKIP_DOCKER_CLEANUP="${SKIP_DOCKER_CLEANUP:-0}"

STAGE_C_MIGRATIONS=(
  "20260729140000_remove_obsolete_erp_tables"
  "20260729150000_remove_unused_enum_values"
)

SAFE_LEGACY_PATHS=()
ON_ERROR_HANDLED=0

log() { deploy_log "$@"; }
warn() { deploy_warn "$@"; }
die() { deploy_die "$@"; }
run() {
  if [[ "${DRY_RUN}" == "1" ]]; then
    printf '[dry-run] %s\n' "$*"
    return 0
  fi
  "$@"
}
compose() { deploy_compose "$@"; }
compose_migrate() { deploy_compose_migrate "$@"; }

check_disk_space() {
  local avail_kb min_kb=1048576
  if command -v df >/dev/null 2>&1; then
    avail_kb="$(df -Pk "${DEPLOY_ROOT}" | awk 'NR==2 {print $4}')"
    if [[ "${avail_kb}" -lt "${min_kb}" ]]; then
      die "Insufficient disk space in ${DEPLOY_ROOT}: ${avail_kb} KiB free (need >= 1 GiB)."
    fi
    log "Disk free in ${DEPLOY_ROOT}: $(( avail_kb / 1024 / 1024 )) GiB"
  else
    warn "df not found; skipping disk space check."
  fi
}

print_deploy_info() {
  log "Flower ERP deploy"
  log "  Root:    ${DEPLOY_ROOT}"
  log "  Env:     ${ENV_FILE}"
  log "  Compose: ${COMPOSE_FILE}"
  log "  Project: ${COMPOSE_PROJECT_NAME:-flower-erp}"
  if command -v git >/dev/null 2>&1 && git -C "${DEPLOY_ROOT}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    log "  Git commit: $(git -C "${DEPLOY_ROOT}" rev-parse --short HEAD 2>/dev/null || echo unknown)"
    log "  Git branch: $(git -C "${DEPLOY_ROOT}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
  fi
  log "Compose services:"
  compose config --services 2>/dev/null | sed 's/^/    /' || warn "Could not list compose services."
  log "Running containers (this project):"
  compose ps -a 2>/dev/null || true
  check_disk_space
}

check_git_state() {
  if ! command -v git >/dev/null 2>&1; then
    warn "git not found; skipping working tree check."
    return 0
  fi
  if ! git -C "${DEPLOY_ROOT}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    warn "Not a git repository; skipping working tree check."
    return 0
  fi
  log "Git status:"
  git -C "${DEPLOY_ROOT}" status --short || true
  if [[ -n "$(git -C "${DEPLOY_ROOT}" status --porcelain --untracked-files=no)" ]]; then
    die "Modified tracked files detected. Commit or stash before deploy."
  fi
  local untracked
  untracked="$(git -C "${DEPLOY_ROOT}" status --porcelain --untracked-files=normal | grep '^??' || true)"
  if [[ -n "${untracked}" ]]; then
    warn "Untracked files present (not removed automatically):"
    printf '%s\n' "${untracked}"
  fi
  log "Untracked preview (git clean -nd — NOT executed):"
  git -C "${DEPLOY_ROOT}" clean -nd || true
}

check_prerequisites() {
  deploy_check_docker
  deploy_common_init
  deploy_load_env
}

get_pending_stage_c_migrations() {
  local pending="" mig
  for mig in "${STAGE_C_MIGRATIONS[@]}"; do
    if printf '%s\n' "${PRISMA_MIGRATE_STATUS_OUTPUT}" | grep -A50 'not yet been applied' | grep -q "${mig}"; then
      pending="${pending} ${mig}"
    fi
  done
  printf '%s' "${pending# }"
}

check_failed_migrations() {
  local failed_names
  if [[ "${PRISMA_MIGRATE_STATUS_CLASS}" != "failed" ]]; then
    return 0
  fi

  failed_names="$(prisma_failed_migration_names)"
  [[ -n "${failed_names}" ]] || die "Prisma reported failed migrations but none could be parsed."

  if printf '%s\n' "${failed_names}" | grep -q "${STAGE_C_FAILED_MIGRATION}"; then
    cat >&2 <<EOF
ERROR:
Prisma found failed migration(s). Deploy is blocked (P3009).

Failed migration(s):
${failed_names}

Run automated recovery first:
  ./deploy/scripts/recover-stage-c-migration.sh

Then:
  ./deploy/scripts/deploy.sh
EOF
    exit 1
  fi

  cat >&2 <<EOF
ERROR:
Prisma found failed migration(s). Deploy is blocked (P3009).

Failed migration(s):
${failed_names}

Resolve with prisma migrate resolve, then redeploy.
Example:
  $(prisma_compose_cmd_hint) resolve --rolled-back "MIGRATION_NAME"
EOF
  exit 1
}

check_prisma_migration_state() {
  log "Checking Prisma migration state..."
  prisma_refresh_migrate_status
  prisma_assert_status_readable
  check_failed_migrations

  local pending
  pending="$(get_pending_stage_c_migrations)"
  case "${PRISMA_MIGRATE_STATUS_CLASS}" in
    pending)
      log "Pending migrations:${pending:- (see prisma migrate status output)}"
      ;;
    up_to_date)
      log "Database migrations are up to date."
      ;;
    *)
      if [[ -n "${pending}" ]]; then
        log "Pending migrations:${pending}"
      fi
      ;;
  esac
}

check_stage_c_safety_gate() {
  local pending
  pending="$(get_pending_stage_c_migrations)"
  if [[ -z "${pending}" ]]; then
    log "Stage C migrations: none pending."
    return 0
  fi
  log "Pending Stage C migrations:${pending}"
  if [[ "${ALLOW_DESTRUCTIVE_MIGRATIONS}" != "1" ]]; then
    cat >&2 <<EOF
Stage C destructive migrations are pending:${pending}

Run audit and backups first, then rerun with:
  RUN_STAGE_C_AUDIT=1
  RUN_STAGE_C_BACKUP=1
  ALLOW_DESTRUCTIVE_MIGRATIONS=1
EOF
    exit 1
  fi
  if [[ "${RUN_STAGE_C_AUDIT}" != "1" || "${RUN_STAGE_C_BACKUP}" != "1" ]]; then
    die "First Stage C deploy requires RUN_STAGE_C_AUDIT=1 and RUN_STAGE_C_BACKUP=1."
  fi
  log "Stage C safety gate passed."
}

run_stage_c_audit() {
  if [[ "${RUN_STAGE_C_AUDIT}" != "1" ]]; then
    log "Skipping Stage C audit (set RUN_STAGE_C_AUDIT=1 to enable)."
    return 0
  fi
  deploy_require_cmd psql
  local audit_sql="${DEPLOY_ROOT}/scripts/audit-removable-data.sql"
  [[ -f "${audit_sql}" ]] || die "Missing ${audit_sql}"
  log "Running Stage C data audit..."
  run psql "${DATABASE_MIGRATE_URL}" -v ON_ERROR_STOP=1 -f "${audit_sql}"
}

run_stage_c_backup() {
  if [[ "${RUN_STAGE_C_BACKUP}" != "1" ]]; then
    log "Skipping Stage C backup (set RUN_STAGE_C_BACKUP=1 to enable)."
    return 0
  fi
  log "Running full database backup..."
  run "${SCRIPT_DIR}/backup-db.sh"
  local latest_full
  latest_full="$(ls -t "${DEPLOY_ROOT}/backups/"*.dump 2>/dev/null | head -1 || true)"
  [[ -n "${latest_full}" && -s "${latest_full}" ]] || die "Full backup missing or empty."
  log "Running Stage C table backup..."
  export DATABASE_URL="${DATABASE_MIGRATE_URL}"
  run bash "${DEPLOY_ROOT}/scripts/backup-stage-c-tables.sh"
  local stage_dir
  stage_dir="$(ls -td "${DEPLOY_ROOT}/backups/stage-c-"* 2>/dev/null | head -1 || true)"
  [[ -n "${stage_dir}" && -s "${stage_dir}/stage-c-tables.sql" ]] || die "Stage C table backup missing or empty."
  log "Backups verified: ${latest_full}, ${stage_dir}/stage-c-tables.sql"
}

build_images() {
  log "[1/5] Building images (api, backoffice, migrate)..."
  run compose build api backoffice
  run compose_migrate build migrate
}

run_migrations() {
  log "[2/5] Running database migrations..."
  if [[ "${DRY_RUN}" == "1" ]]; then
    run compose_migrate run --rm migrate migrate deploy
    return 0
  fi
  run "${SCRIPT_DIR}/migrate.sh"
}

deploy_services() {
  log "[3/5] Starting / updating API..."
  run compose up -d --no-deps --force-recreate api
  if [[ "${DRY_RUN}" == "1" ]]; then
    log "[dry-run] Would wait for API health and recreate backoffice."
    return 0
  fi
  log "Waiting for API health..."
  local deadline=$((SECONDS + 120))
  until compose ps api | grep -q "(healthy)"; do
    if (( SECONDS > deadline )); then
      compose logs --tail=80 api
      die "API did not become healthy within 120s."
    fi
    sleep 3
  done
  log "[4/5] Starting / updating Backoffice..."
  run compose up -d --remove-orphans --force-recreate backoffice
}

verify_health() {
  if [[ "${DRY_RUN}" == "1" ]]; then
    log "[dry-run] Would verify healthchecks and HTTP endpoints."
    return 0
  fi
  log "[5/5] Verifying deployment..."
  compose ps -a
  local api_port="${FLOWER_API_PORT:-4100}"
  local bo_port="${FLOWER_BACKOFFICE_PORT:-3100}"
  curl -sf "http://127.0.0.1:${api_port}/api/v1/health/live" >/dev/null || die "API /health/live failed."
  curl -sf "http://127.0.0.1:${api_port}/api/v1/health/ready" >/dev/null || die "API /health/ready failed."
  local bo_code
  bo_code="$(curl -sf -o /dev/null -w '%{http_code}' "http://127.0.0.1:${bo_port}/" || echo 000)"
  [[ "${bo_code}" =~ ^[23] ]] || die "Backoffice HTTP check failed (status ${bo_code})."

  prisma_invalidate_status_cache
  prisma_refresh_migrate_status
  prisma_assert_status_readable
  check_failed_migrations
  if [[ "${PRISMA_MIGRATE_STATUS_CLASS}" == "pending" ]]; then
    die "Pending migrations remain after deploy."
  fi

  local restarting
  restarting="$(compose ps --format json 2>/dev/null | grep -c Restarting || true)"
  if [[ "${restarting}" -gt 0 ]]; then
    die "Containers in restart loop detected."
  fi
  log "Health checks passed."
}

cleanup_after_successful_deploy() {
  if [[ "${SKIP_DOCKER_CLEANUP}" == "1" ]]; then
    log "Skipping Docker cleanup (SKIP_DOCKER_CLEANUP=1)."
    return 0
  fi
  if [[ "${DRY_RUN}" == "1" ]]; then
    log "[dry-run] Would run: docker image prune -f"
    return 0
  fi
  log "Post-deploy cleanup (dangling images + old build cache)..."
  docker image prune -f || warn "docker image prune failed."
  if docker builder prune --help 2>&1 | grep -q 'filter'; then
    docker builder prune -f --filter 'until=168h' || warn "docker builder prune failed."
  else
    warn "docker builder prune --filter not supported; skipping build cache prune."
  fi
}

on_error() {
  local exit_code=$?
  if [[ "${ON_ERROR_HANDLED}" -eq 1 ]]; then
    exit "${exit_code}"
  fi
  ON_ERROR_HANDLED=1
  printf '\nERROR: deploy failed (exit %s).\n' "${exit_code}" >&2
  if [[ "${DRY_RUN}" != "1" ]]; then
    compose logs --tail=100 api backoffice 2>/dev/null || true
    cat >&2 <<'EOF'
Rollback hints (do NOT delete volumes or backups):
  1. Restore DB from latest backup if migration caused issues:
       ./deploy/scripts/restore-db.sh /opt/flower-erp/backups/flower_erp_YYYYMMDDTHHMMSSZ.dump
  2. Pin previous image tags in .env.production and recreate containers.
EOF
  fi
  exit "${exit_code}"
}

trap on_error ERR

main() {
  cd "${DEPLOY_ROOT}"
  check_prerequisites
  print_deploy_info
  check_git_state
  if [[ "${DRY_RUN}" == "1" ]]; then
    log "DRY RUN — no build, migrate, restart, or cleanup will be executed."
  fi
  check_prisma_migration_state
  check_stage_c_safety_gate
  run_stage_c_audit
  run_stage_c_backup
  build_images
  run_migrations
  deploy_services
  verify_health
  cleanup_after_successful_deploy
  log "Deploy complete."
}

main "$@"
