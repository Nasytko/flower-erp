#!/usr/bin/env bash
# Logging, errors, env loading, git/disk checks.

deploy_common_init() {
  : "${DEPLOY_ROOT:?DEPLOY_ROOT required}"
  ENV_FILE="${ENV_FILE:-${DEPLOY_ROOT}/.env.production}"
  COMPOSE_FILE="${COMPOSE_FILE:-${DEPLOY_ROOT}/docker-compose.production.yml}"
  STATE_DIR="${STATE_DIR:-${DEPLOY_ROOT}/deploy/state}"
}

deploy_log() { printf '==> %s\n' "$*"; }

deploy_warn() { printf 'WARN: %s\n' "$*" >&2; }

deploy_die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

deploy_require_cmd() {
  command -v "$1" >/dev/null 2>&1 || deploy_die "Required command not found: $1"
}

deploy_check_docker() {
  deploy_require_cmd docker
  docker info >/dev/null 2>&1 || deploy_die "Docker daemon is not reachable."
  docker compose version >/dev/null 2>&1 || deploy_die "Docker Compose V2 required."
}

deploy_load_env() {
  [[ -f "${ENV_FILE}" ]] || deploy_die "${ENV_FILE} not found."
  [[ -f "${COMPOSE_FILE}" ]] || deploy_die "${COMPOSE_FILE} not found."
  # shellcheck disable=SC1090
  set -a
  # shellcheck source=/dev/null
  source "${ENV_FILE}"
  set +a
  export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-flower-erp}"
  : "${DATABASE_MIGRATE_URL:?DATABASE_MIGRATE_URL is required}"
}

deploy_git_info() {
  if ! command -v git >/dev/null 2>&1; then
    printf 'unknown unknown'
    return 0
  fi
  if ! git -C "${DEPLOY_ROOT}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    printf 'unknown unknown'
    return 0
  fi
  printf '%s %s' \
    "$(git -C "${DEPLOY_ROOT}" rev-parse --short HEAD 2>/dev/null || echo unknown)" \
    "$(git -C "${DEPLOY_ROOT}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
}

deploy_check_git_clean() {
  if ! command -v git >/dev/null 2>&1; then
    deploy_warn "git not found; skipping working tree check."
    return 0
  fi
  if ! git -C "${DEPLOY_ROOT}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    deploy_warn "Not a git repository; skipping working tree check."
    return 0
  fi
  if [[ -n "$(git -C "${DEPLOY_ROOT}" status --porcelain --untracked-files=no)" ]]; then
    deploy_die "Modified tracked files detected. Commit or stash before deploy."
  fi
}

deploy_check_disk_space() {
  local avail_kb min_kb=1048576
  if ! command -v df >/dev/null 2>&1; then
    deploy_warn "df not found; skipping disk space check."
    return 0
  fi
  avail_kb="$(df -Pk "${DEPLOY_ROOT}" | awk 'NR==2 {print $4}')"
  if [[ "${avail_kb}" -lt "${min_kb}" ]]; then
    deploy_die "Insufficient disk space in ${DEPLOY_ROOT}: ${avail_kb} KiB free (need >= 1 GiB)."
  fi
  deploy_log "Disk free in ${DEPLOY_ROOT}: $(( avail_kb / 1024 / 1024 )) GiB"
}

deploy_run_migration_safety() {
  local script="${DEPLOY_ROOT}/scripts/check-migration-safety.mjs"
  [[ -f "${script}" ]] || deploy_die "Migration safety script not found: ${script}"

  if command -v node >/dev/null 2>&1; then
    node "${script}"
    return
  fi

  deploy_log "Node.js not on PATH; running migration safety check in Docker..."
  docker run --rm \
    -v "${DEPLOY_ROOT}:/repo:ro" \
    -w /repo \
    node:22-bookworm-slim \
    node scripts/check-migration-safety.mjs
}

deploy_write_checksum() {
  local file="$1"
  local checksum_file="$2"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "${file}" > "${checksum_file}"
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "${file}" > "${checksum_file}"
  else
    deploy_warn "No sha256sum/shasum; skipping checksum for ${file}."
  fi
}

deploy_verify_nonempty_file() {
  local file="$1"
  [[ -f "${file}" && -s "${file}" ]] || deploy_die "Backup file missing or empty: ${file}"
}

deploy_read_password_file() {
  local file="$1"
  [[ -f "${file}" && -r "${file}" ]] || deploy_die "Password file not readable: ${file}"
  tr -d '\r\n' < "${file}"
}
