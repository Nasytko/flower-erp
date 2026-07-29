#!/usr/bin/env bash
# Flower ERP — production deploy (ORVIX-safe).
# Build → optional Stage C audit/backup → migrate → rolling recreate.
# Does NOT touch other compose projects, named volumes, or environment files.
#
# Flags:
#   DRY_RUN=1                      — print planned steps only
#   RUN_STAGE_C_AUDIT=1             — run scripts/audit-removable-data.sql before migrate
#   RUN_STAGE_C_BACKUP=1            — full pg_dump + scripts/backup-stage-c-tables.sh
#   ALLOW_DESTRUCTIVE_MIGRATIONS=1  — required when Stage C migrations are pending
#   SKIP_DOCKER_CLEANUP=1            — skip post-success image/cache prune
#
# Example (first deploy after Stage C):
#   RUN_STAGE_C_AUDIT=1 RUN_STAGE_C_BACKUP=1 ALLOW_DESTRUCTIVE_MIGRATIONS=1 \
#     ./deploy/scripts/deploy.sh

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

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

# Legacy server paths safe to remove when empty/untracked (allowlist only).
SAFE_LEGACY_PATHS=()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log() { printf '==> %s\n' "$*"; }

warn() { printf 'WARN: %s\n' "$*" >&2; }

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

run() {
  if [[ "${DRY_RUN}" == "1" ]]; then
    printf '[dry-run] %s\n' "$*"
    return 0
  fi
  "$@"
}

compose() {
  docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" "$@"
}

compose_migrate() {
  compose --profile migrate "$@"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

check_docker_daemon() {
  docker info >/dev/null 2>&1 || die "Docker daemon is not reachable. Is Docker running?"
}

check_compose_v2() {
  docker compose version >/dev/null 2>&1 || die "Docker Compose V2 required (docker compose)."
}

check_disk_space() {
  local avail_kb min_kb=1048576 # 1 GiB
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

remove_safe_legacy_paths() {
  if [[ "${#SAFE_LEGACY_PATHS[@]}" -eq 0 ]]; then
    return 0
  fi
  local rel abs
  for rel in "${SAFE_LEGACY_PATHS[@]}"; do
    abs="${DEPLOY_ROOT}/${rel}"
    [[ "${abs}" == "${DEPLOY_ROOT}" ]] && die "Refusing to remove project root."
    [[ -L "${abs}" ]] && die "Refusing to remove symlink: ${abs}"
    case "${abs}" in
      *\.env*|*backup*|*uploads*|*/data/*|*cert*) die "Refusing unsafe legacy path: ${abs}" ;;
    esac
    if [[ -e "${abs}" ]]; then
      log "Removing safe legacy path: ${rel}"
      run rm -rf "${abs}"
    fi
  done
}

check_prerequisites() {
  require_cmd docker
  check_docker_daemon
  check_compose_v2
  [[ -f "${ENV_FILE}" ]] || die "${ENV_FILE} not found."
  [[ -f "${COMPOSE_FILE}" ]] || die "${COMPOSE_FILE} not found."

  # shellcheck disable=SC1090
  set -a
  # shellcheck source=/dev/null
  source "${ENV_FILE}"
  set +a

  export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-flower-erp}"
}

get_pending_stage_c_migrations() {
  local output pending="" mig
  if [[ "${DRY_RUN}" == "1" ]]; then
    log "[dry-run] Would check pending migrations via: docker compose ... run --rm migrate status"
    # Best-effort read if DB reachable; otherwise assume check at deploy time.
    if ! compose_migrate run --rm migrate status >/tmp/flower-migrate-status.txt 2>&1; then
      rm -f /tmp/flower-migrate-status.txt
      return 0
    fi
    output="$(cat /tmp/flower-migrate-status.txt)"
    rm -f /tmp/flower-migrate-status.txt
  else
    output="$(compose_migrate run --rm migrate status 2>&1)" || {
      warn "Could not run prisma migrate status; Stage C gate skipped."
      return 0
    }
  fi
  for mig in "${STAGE_C_MIGRATIONS[@]}"; do
    if printf '%s\n' "${output}" | grep -A50 'not yet been applied' | grep -q "${mig}"; then
      pending="${pending} ${mig}"
    fi
  done
  printf '%s' "${pending# }"
}

check_stage_c_safety_gate() {
  local pending
  pending="$(get_pending_stage_c_migrations || true)"
  if [[ -z "${pending}" ]]; then
    log "Stage C migrations: none pending (or already applied)."
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
  require_cmd psql
  : "${DATABASE_MIGRATE_URL:?DATABASE_MIGRATE_URL required for audit}"
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
  : "${DATABASE_MIGRATE_URL:?DATABASE_MIGRATE_URL required for backup}"

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
    run compose_migrate run --rm migrate deploy
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

  curl -sf "http://127.0.0.1:${api_port}/api/v1/health/live" >/dev/null \
    || die "API /health/live failed."
  curl -sf "http://127.0.0.1:${api_port}/api/v1/health/ready" >/dev/null \
    || die "API /health/ready failed."
  local bo_code
  bo_code="$(curl -sf -o /dev/null -w '%{http_code}' "http://127.0.0.1:${bo_port}/" || echo 000)"
  [[ "${bo_code}" =~ ^[23] ]] || die "Backoffice HTTP check failed (status ${bo_code})."

  # Migration status (informational)
  compose_migrate run --rm migrate status || warn "Could not read migration status."

  # Restart loop check
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
    log "[dry-run] Would run: docker builder prune -f --filter until=168h (if supported)"
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
  printf '\nERROR: deploy failed (exit %s).\n' "${exit_code}" >&2
  if [[ "${DRY_RUN}" != "1" ]]; then
    compose logs --tail=100 api backoffice 2>/dev/null || true
    cat >&2 <<'EOF'

Rollback hints (do NOT delete volumes or backups):
  1. Restore DB from latest backup if migration caused issues:
       ./deploy/scripts/restore-db.sh /opt/flower-erp/backups/flower_erp_YYYYMMDDTHHMMSSZ.dump
  2. Pin previous image tags in .env.production and recreate containers:
       docker compose -f docker-compose.production.yml --env-file .env.production up -d --no-deps --force-recreate api backoffice
EOF
  fi
  exit "${exit_code}"
}

trap on_error ERR

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

main() {
  cd "${DEPLOY_ROOT}"

  check_prerequisites
  print_deploy_info
  check_git_state
  remove_safe_legacy_paths

  if [[ "${DRY_RUN}" == "1" ]]; then
    log "DRY RUN — no build, migrate, restart, or cleanup will be executed."
  fi

  check_stage_c_safety_gate
  run_stage_c_audit
  run_stage_c_backup
  build_images
  run_migrations
  deploy_services
  verify_health
  cleanup_after_successful_deploy

  log "Deploy complete."
  printf '\nLocal bindings:\n'
  printf '  API:        http://127.0.0.1:%s/api/v1/health/live\n' "${FLOWER_API_PORT:-4100}"
  printf '  Backoffice: http://127.0.0.1:%s/\n' "${FLOWER_BACKOFFICE_PORT:-3100}"
}

main "$@"
