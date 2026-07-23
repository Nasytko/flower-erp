#!/usr/bin/env bash
# Prepare / refresh Flower ERP production secrets and .env.production on the VPS.
# Does NOT run migrations, start the app, or touch LeadFlow containers beyond
# ALTER ROLE + TCP auth checks inside leadflow-postgres-1.
#
# Usage:
#   ./deploy/scripts/init-production.sh
#   ./deploy/scripts/init-production.sh --check
#   ./deploy/scripts/init-production.sh --rotate-secrets
#
# Overrides (for tests / non-default layouts):
#   PROJECT_DIR, PG_CONTAINER, PG_ADMIN_USER, PG_ADMIN_DB, PG_NETWORK,
#   PG_DB_NAME, ENV_FILE, ENV_EXAMPLE
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${PROJECT_DIR:-$(cd "${SCRIPT_DIR}/../.." && pwd)}"
ENV_EXAMPLE="${ENV_EXAMPLE:-${PROJECT_DIR}/.env.production.example}"
ENV_FILE="${ENV_FILE:-${PROJECT_DIR}/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-${PROJECT_DIR}/docker-compose.production.yml}"
BACKUP_DIR="${BACKUP_DIR:-${PROJECT_DIR}/backups}"

PG_CONTAINER="${PG_CONTAINER:-leadflow-postgres-1}"
PG_ADMIN_USER="${PG_ADMIN_USER:-leadflow}"
PG_ADMIN_DB="${PG_ADMIN_DB:-leadflow}"
PG_NETWORK="${PG_NETWORK:-leadflow_default}"
PG_DB_NAME="${PG_DB_NAME:-flower_erp}"
PG_ROLE_USER="${PG_ROLE_USER:-flower_user}"
PG_ROLE_MIGRATE="${PG_ROLE_MIGRATE:-flower_migrate}"
PG_HOST_IN_COMPOSE="${PG_HOST_IN_COMPOSE:-leadflow-postgres-1}"
PG_PORT="${PG_PORT:-5432}"

MODE_CHECK=0
MODE_ROTATE=0

# Secrets held only in memory; cleared on EXIT.
FLOWER_USER_PASSWORD=""
FLOWER_MIGRATE_PASSWORD=""
JWT_ACCESS_VALUE=""
JWT_REFRESH_VALUE=""
PREV_USER_PASSWORD=""
PREV_MIGRATE_PASSWORD=""
DB_PASSWORDS_CHANGED=0
TMP_ENV=""
TMP_FILES=()

ok() { printf '[OK] %s\n' "$*"; }
err() { printf '[ERROR] %s\n' "$*" >&2; }
die() { err "$*"; exit 1; }

cleanup() {
  local f
  for f in "${TMP_FILES[@]+"${TMP_FILES[@]}"}"; do
    [[ -n "${f}" && -e "${f}" ]] && rm -f -- "${f}" || true
  done
  FLOWER_USER_PASSWORD=""
  FLOWER_MIGRATE_PASSWORD=""
  JWT_ACCESS_VALUE=""
  JWT_REFRESH_VALUE=""
  PREV_USER_PASSWORD=""
  PREV_MIGRATE_PASSWORD=""
}
trap cleanup EXIT

usage() {
  cat <<'EOF'
Usage: init-production.sh [--check] [--rotate-secrets]

  (default)         Create or refresh .env.production; sync CHANGE_ME / missing secrets.
  --check           Validate prerequisites and env; change nothing.
  --rotate-secrets  Force new DB passwords + JWT secrets and update PostgreSQL roles.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check) MODE_CHECK=1; shift ;;
    --rotate-secrets) MODE_ROTATE=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown argument: $1" ;;
  esac
done

if [[ "${MODE_CHECK}" -eq 1 && "${MODE_ROTATE}" -eq 1 ]]; then
  die "Use either --check or --rotate-secrets, not both"
fi

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

is_placeholder() {
  local value="${1:-}"
  [[ -z "${value}" ]] && return 0
  [[ "${value}" == CHANGE_ME* ]] && return 0
  return 1
}

# Extract KEY=value from env file (first match). Strips surrounding quotes.
get_env_value() {
  local file="$1" key="$2"
  [[ -f "${file}" ]] || { printf ''; return 0; }
  local line
  line="$(grep -E "^${key}=" "${file}" | head -n1 || true)"
  [[ -z "${line}" ]] && { printf ''; return 0; }
  local value="${line#*=}"
  value="${value%$'\r'}"
  if [[ "${value}" == \"*\" && "${value}" == *\" ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "${value}" == \'*\' && "${value}" == *\' ]]; then
    value="${value:1:${#value}-2}"
  fi
  printf '%s' "${value}"
}

# Upsert KEY=VALUE in file: replace existing assignment or append once.
# Does not print the value. Atomic via temp file + mv.
upsert_env() {
  local file="$1" key="$2" value="$3"
  local tmp
  tmp="$(mktemp "${file}.XXXXXX")"
  if [[ -f "${file}" ]] && grep -qE "^${key}=" "${file}"; then
    awk -v k="${key}" -v v="${value}" '
      BEGIN { done=0 }
      {
        if ($0 ~ ("^" k "=")) {
          if (!done) { print k "=" v; done=1 }
          next
        }
        print
      }
      END { if (!done) print k "=" v }
    ' "${file}" > "${tmp}"
  else
    if [[ -f "${file}" ]]; then
      cat "${file}" > "${tmp}"
      [[ -s "${tmp}" && "$(tail -c1 "${tmp}" | wc -l)" -eq 0 ]] || printf '\n' >> "${tmp}"
    else
      : > "${tmp}"
    fi
    printf '%s=%s\n' "${key}" "${value}" >> "${tmp}"
  fi
  chmod 600 "${tmp}"
  mv -f -- "${tmp}" "${file}"
}

count_env_key() {
  local file="$1" key="$2"
  [[ -f "${file}" ]] || { printf '0'; return 0; }
  grep -cE "^${key}=" "${file}" || true
}

gen_db_password() { openssl rand -hex 32; }
gen_jwt_secret() { openssl rand -hex 48; }

build_pg_url() {
  local user="$1" password="$2"
  printf 'postgresql://%s:%s@%s:%s/%s?schema=public' \
    "${user}" "${password}" "${PG_HOST_IN_COMPOSE}" "${PG_PORT}" "${PG_DB_NAME}"
}

# Parse password from postgresql://user:pass@host/...
extract_url_password() {
  local url="$1"
  if [[ "${url}" =~ ^postgresql://[^:]+:([^@]+)@ ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
  else
    printf ''
  fi
}

check_prerequisites() {
  [[ "$(uname -s)" == Linux* ]] || [[ -n "${ALLOW_NON_LINUX:-}" ]] \
    || die "This script is intended for Linux VPS (set ALLOW_NON_LINUX=1 to override)"

  require_cmd docker
  require_cmd openssl
  require_cmd sed
  require_cmd grep
  require_cmd mktemp
  require_cmd awk
  require_cmd mv

  [[ -d "${PROJECT_DIR}" ]] || die "Project directory not found: ${PROJECT_DIR}"
  [[ -f "${ENV_EXAMPLE}" ]] || die "Missing ${ENV_EXAMPLE}"
  [[ -f "${COMPOSE_FILE}" ]] || die "Missing ${COMPOSE_FILE}"

  docker info >/dev/null 2>&1 || die "Docker is not available or daemon not running"
  ok "Docker available"

  if ! docker inspect -f '{{.State.Running}}' "${PG_CONTAINER}" 2>/dev/null | grep -qi true; then
    die "PostgreSQL container not running: ${PG_CONTAINER}"
  fi
  local health
  health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${PG_CONTAINER}" 2>/dev/null || echo none)"
  if [[ "${health}" != "none" && "${health}" != "healthy" ]]; then
    die "PostgreSQL container ${PG_CONTAINER} health status: ${health}"
  fi
  ok "PostgreSQL container healthy"

  docker network inspect "${PG_NETWORK}" >/dev/null 2>&1 \
    || die "Docker network not found: ${PG_NETWORK}"
  ok "Docker network exists"

  docker exec "${PG_CONTAINER}" psql -U "${PG_ADMIN_USER}" -d "${PG_ADMIN_DB}" -v ON_ERROR_STOP=1 -tAc \
    "SELECT 1 FROM pg_database WHERE datname='${PG_DB_NAME}'" | grep -q 1 \
    || die "Database ${PG_DB_NAME} does not exist"

  docker exec "${PG_CONTAINER}" psql -U "${PG_ADMIN_USER}" -d "${PG_ADMIN_DB}" -v ON_ERROR_STOP=1 -tAc \
    "SELECT 1 FROM pg_roles WHERE rolname='${PG_ROLE_USER}'" | grep -q 1 \
    || die "Role ${PG_ROLE_USER} does not exist"

  docker exec "${PG_CONTAINER}" psql -U "${PG_ADMIN_USER}" -d "${PG_ADMIN_DB}" -v ON_ERROR_STOP=1 -tAc \
    "SELECT 1 FROM pg_roles WHERE rolname='${PG_ROLE_MIGRATE}'" | grep -q 1 \
    || die "Role ${PG_ROLE_MIGRATE} does not exist"
}

# ALTER ROLE: password via stdin to psql (not docker/psql argv / process list).
# Single quotes in password are doubled for SQL literals.
pg_set_role_password() {
  local role="$1" password="$2" escaped
  [[ "${role}" =~ ^[a-z][a-z0-9_]*$ ]] || die "Invalid role name"
  [[ -n "${password}" ]] || die "Empty password for role ${role}"
  escaped="${password//\'/\'\'}"
  docker exec -i "${PG_CONTAINER}" \
    psql -U "${PG_ADMIN_USER}" -d "${PG_ADMIN_DB}" -v ON_ERROR_STOP=1 <<SQL
ALTER ROLE ${role} WITH PASSWORD '${escaped}';
SQL
}

# TCP auth check from inside the Postgres container (forces password auth).
# PGPASSWORD is set inside the container from stdin — not passed on docker argv.
pg_verify_login() {
  local user="$1" password="$2" result
  [[ "${user}" =~ ^[a-z][a-z0-9_]*$ ]] || die "Invalid DB user"
  [[ -n "${password}" ]] || die "Empty password for ${user}"
  result="$(
    printf '%s\n' "${password}" | docker exec -i "${PG_CONTAINER}" \
      bash -c 'IFS= read -r PGPASSWORD; export PGPASSWORD; exec psql -h 127.0.0.1 -U "$1" -d "$2" -v ON_ERROR_STOP=1 -tAc "SELECT current_user || '"'"'|'"'"' || current_database();"' \
      _ "${user}" "${PG_DB_NAME}"
  )" || return 1
  result="${result//[[:space:]]/}"
  [[ "${result}" == "${user}|${PG_DB_NAME}" ]]
}

ensure_backup_dir() {
  mkdir -p "${BACKUP_DIR}"
  chmod 700 "${BACKUP_DIR}"
}

# Decide whether a secret key needs a new value.
needs_secret() {
  local current="$1"
  if [[ "${MODE_ROTATE}" -eq 1 ]]; then
    return 0
  fi
  is_placeholder "${current}"
}

prepare_secrets_from_env() {
  local src="$1"
  local cur_user_pw cur_mig_pw cur_jwt_a cur_jwt_r cur_db_url cur_mig_url

  cur_db_url="$(get_env_value "${src}" DATABASE_URL)"
  cur_mig_url="$(get_env_value "${src}" DATABASE_MIGRATE_URL)"
  cur_user_pw="$(get_env_value "${src}" FLOWER_DB_PASSWORD)"
  if is_placeholder "${cur_user_pw}"; then
    cur_user_pw="$(extract_url_password "${cur_db_url}")"
  fi
  cur_mig_pw="$(extract_url_password "${cur_mig_url}")"
  cur_jwt_a="$(get_env_value "${src}" JWT_ACCESS_SECRET)"
  cur_jwt_r="$(get_env_value "${src}" JWT_REFRESH_SECRET)"

  PREV_USER_PASSWORD="${cur_user_pw}"
  PREV_MIGRATE_PASSWORD="${cur_mig_pw}"

  if needs_secret "${cur_user_pw}"; then
    FLOWER_USER_PASSWORD="$(gen_db_password)"
  else
    FLOWER_USER_PASSWORD="${cur_user_pw}"
  fi

  if needs_secret "${cur_mig_pw}"; then
    FLOWER_MIGRATE_PASSWORD="$(gen_db_password)"
  else
    FLOWER_MIGRATE_PASSWORD="${cur_mig_pw}"
  fi

  if needs_secret "${cur_jwt_a}"; then
    JWT_ACCESS_VALUE="$(gen_jwt_secret)"
  else
    JWT_ACCESS_VALUE="${cur_jwt_a}"
  fi

  if needs_secret "${cur_jwt_r}"; then
    JWT_REFRESH_VALUE="$(gen_jwt_secret)"
  else
    JWT_REFRESH_VALUE="${cur_jwt_r}"
  fi
}

write_candidate_env() {
  local dest="$1"
  local src="$2"

  cp -f -- "${src}" "${dest}"
  chmod 600 "${dest}"

  # Fixed production identity / URLs (idempotent upsert, no duplicates).
  upsert_env "${dest}" COMPOSE_PROJECT_NAME "flower-erp"
  upsert_env "${dest}" FLOWER_API_IMAGE "flower-erp-api:production"
  upsert_env "${dest}" FLOWER_MIGRATE_IMAGE "flower-erp-migrate:production"
  upsert_env "${dest}" FLOWER_BACKOFFICE_IMAGE "flower-erp-backoffice:production"
  upsert_env "${dest}" FLOWER_API_PORT "4100"
  upsert_env "${dest}" FLOWER_BACKOFFICE_PORT "3100"
  upsert_env "${dest}" NEXT_PUBLIC_API_BASE_URL "https://api-erp.nasytko.ru/api/v1"
  upsert_env "${dest}" CORS_ORIGINS "https://erp.nasytko.ru"

  upsert_env "${dest}" DATABASE_URL "$(build_pg_url "${PG_ROLE_USER}" "${FLOWER_USER_PASSWORD}")"
  upsert_env "${dest}" DATABASE_MIGRATE_URL "$(build_pg_url "${PG_ROLE_MIGRATE}" "${FLOWER_MIGRATE_PASSWORD}")"
  upsert_env "${dest}" JWT_ACCESS_SECRET "${JWT_ACCESS_VALUE}"
  upsert_env "${dest}" JWT_REFRESH_SECRET "${JWT_REFRESH_VALUE}"

  upsert_env "${dest}" FLOWER_DB_HOST "${PG_HOST_IN_COMPOSE}"
  upsert_env "${dest}" FLOWER_DB_PORT "${PG_PORT}"
  upsert_env "${dest}" FLOWER_DB_NAME "${PG_DB_NAME}"
  upsert_env "${dest}" FLOWER_DB_USER "${PG_ROLE_USER}"
  upsert_env "${dest}" FLOWER_DB_PASSWORD "${FLOWER_USER_PASSWORD}"
  upsert_env "${dest}" FLOWER_DB_BACKUP_DIR "${BACKUP_DIR}"

  # Remove commented placeholder lines that would confuse operators (keep real keys).
  # (upsert already ensures active keys exist.)
}

assert_no_duplicate_keys() {
  local file="$1"
  local dup
  dup="$(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "${file}" | cut -d= -f1 | sort | uniq -d || true)"
  [[ -z "${dup}" ]] || die "Duplicate env keys in candidate: ${dup}"
}

assert_required_configured() {
  local file="$1"
  local key value
  for key in \
    COMPOSE_PROJECT_NAME FLOWER_API_IMAGE FLOWER_MIGRATE_IMAGE FLOWER_BACKOFFICE_IMAGE \
    NEXT_PUBLIC_API_BASE_URL CORS_ORIGINS \
    DATABASE_URL DATABASE_MIGRATE_URL \
    JWT_ACCESS_SECRET JWT_REFRESH_SECRET \
    FLOWER_DB_HOST FLOWER_DB_NAME FLOWER_DB_USER FLOWER_DB_PASSWORD FLOWER_DB_BACKUP_DIR
  do
    value="$(get_env_value "${file}" "${key}")"
    is_placeholder "${value}" && die "Required variable still placeholder or empty: ${key}"
    [[ "$(count_env_key "${file}" "${key}")" -eq 1 ]] || die "Key must appear exactly once: ${key}"
  done
  ok "Required variables configured"
}

sync_postgres_roles() {
  local need_user=0 need_migrate=0

  if [[ "${MODE_ROTATE}" -eq 1 ]]; then
    need_user=1
    need_migrate=1
  else
    # Only ALTER when we generated a new password (previous was placeholder / empty).
    if is_placeholder "${PREV_USER_PASSWORD}" || [[ "${FLOWER_USER_PASSWORD}" != "${PREV_USER_PASSWORD}" ]]; then
      need_user=1
    fi
    if is_placeholder "${PREV_MIGRATE_PASSWORD}" || [[ "${FLOWER_MIGRATE_PASSWORD}" != "${PREV_MIGRATE_PASSWORD}" ]]; then
      need_migrate=1
    fi
  fi

  if [[ "${need_user}" -eq 0 && "${need_migrate}" -eq 0 ]]; then
    ok "PostgreSQL roles synchronized"
    return 0
  fi

  if [[ "${need_user}" -eq 1 ]]; then
    pg_set_role_password "${PG_ROLE_USER}" "${FLOWER_USER_PASSWORD}" || return 1
    DB_PASSWORDS_CHANGED=1
  fi
  if [[ "${need_migrate}" -eq 1 ]]; then
    pg_set_role_password "${PG_ROLE_MIGRATE}" "${FLOWER_MIGRATE_PASSWORD}" || return 1
    DB_PASSWORDS_CHANGED=1
  fi

  ok "PostgreSQL roles synchronized"
}

verify_db_auth() {
  pg_verify_login "${PG_ROLE_USER}" "${FLOWER_USER_PASSWORD}" \
    || { err "TCP authentication failed for ${PG_ROLE_USER}"; return 1; }
  ok "flower_user authentication verified"
  pg_verify_login "${PG_ROLE_MIGRATE}" "${FLOWER_MIGRATE_PASSWORD}" \
    || { err "TCP authentication failed for ${PG_ROLE_MIGRATE}"; return 1; }
  ok "flower_migrate authentication verified"
}

try_restore_db_passwords() {
  if [[ "${DB_PASSWORDS_CHANGED}" -ne 1 ]]; then
    return 0
  fi
  if is_placeholder "${PREV_USER_PASSWORD}" || is_placeholder "${PREV_MIGRATE_PASSWORD}"; then
    err "DB passwords were changed but previous values were unknown/placeholder — cannot restore automatically."
    err "Update PostgreSQL roles manually to match a known .env.production before retrying."
    return 1
  fi
  err "Attempting to restore previous PostgreSQL role passwords..."
  pg_set_role_password "${PG_ROLE_USER}" "${PREV_USER_PASSWORD}" || true
  pg_set_role_password "${PG_ROLE_MIGRATE}" "${PREV_MIGRATE_PASSWORD}" || true
  return 0
}

run_check_mode() {
  check_prerequisites
  [[ -f "${ENV_FILE}" ]] || die ".env.production not found (run without --check first)"
  chmod 600 "${ENV_FILE}" 2>/dev/null || true
  [[ -d "${BACKUP_DIR}" ]] || die "Backup directory missing: ${BACKUP_DIR}"

  local mode_perm
  mode_perm="$(stat -c '%a' "${ENV_FILE}" 2>/dev/null || stat -f '%OLp' "${ENV_FILE}")"
  [[ "${mode_perm}" == "600" ]] || die ".env.production permissions are ${mode_perm}, expected 600"

  assert_required_configured "${ENV_FILE}"
  assert_no_duplicate_keys "${ENV_FILE}"

  FLOWER_USER_PASSWORD="$(get_env_value "${ENV_FILE}" FLOWER_DB_PASSWORD)"
  FLOWER_MIGRATE_PASSWORD="$(extract_url_password "$(get_env_value "${ENV_FILE}" DATABASE_MIGRATE_URL)")"
  is_placeholder "${FLOWER_USER_PASSWORD}" && die "FLOWER_DB_PASSWORD is placeholder"
  is_placeholder "${FLOWER_MIGRATE_PASSWORD}" && die "DATABASE_MIGRATE_URL password is placeholder"

  verify_db_auth
  ok "File permissions configured"
  ok "Production env prepared"
  printf '\n[OK] --check passed (no changes made)\n'
}

print_next_commands() {
  cat <<EOF

Next steps (not run automatically):

docker compose \\
  --env-file .env.production \\
  -f docker-compose.production.yml \\
  config --services

docker compose \\
  --env-file .env.production \\
  -f docker-compose.production.yml \\
  build --no-cache api

docker compose \\
  --profile migrate \\
  --env-file .env.production \\
  -f docker-compose.production.yml \\
  build --no-cache migrate

Then: ./deploy/scripts/deploy.sh
EOF
}

main() {
  cd "${PROJECT_DIR}"

  if [[ "${MODE_CHECK}" -eq 1 ]]; then
    run_check_mode
    exit 0
  fi

  check_prerequisites
  ensure_backup_dir

  local source_env
  if [[ -f "${ENV_FILE}" ]]; then
    source_env="${ENV_FILE}"
  else
    source_env="${ENV_EXAMPLE}"
  fi

  prepare_secrets_from_env "${source_env}"

  TMP_ENV="$(mktemp "${PROJECT_DIR}/.env.production.XXXXXX")"
  TMP_FILES+=("${TMP_ENV}")
  chmod 600 "${TMP_ENV}"

  write_candidate_env "${TMP_ENV}" "${source_env}"
  assert_no_duplicate_keys "${TMP_ENV}"
  assert_required_configured "${TMP_ENV}"

  # DB update → TCP verify → atomic install. On failure, do not replace env.
  if ! sync_postgres_roles; then
    try_restore_db_passwords || true
    die "Failed to synchronize PostgreSQL roles; .env.production was not replaced"
  fi

  if ! verify_db_auth; then
    try_restore_db_passwords || true
    die "Database authentication verification failed; .env.production was not replaced"
  fi

  # Atomic replace only after successful DB checks.
  chmod 600 "${TMP_ENV}"
  mv -f -- "${TMP_ENV}" "${ENV_FILE}"
  TMP_FILES=("${TMP_FILES[@]/${TMP_ENV}/}")
  chmod 600 "${ENV_FILE}"
  chmod 700 "${BACKUP_DIR}"

  ok "Production env prepared"
  ok "File permissions configured"

  print_next_commands
}

main "$@"
