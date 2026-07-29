#!/usr/bin/env bash
# Restore flower_erp from a pg_dump custom-format backup.
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

DUMP_FILE="${1:-}"

if [[ -z "${DUMP_FILE}" || ! -f "${DUMP_FILE}" ]]; then
  echo "Usage: $0 /path/to/flower_erp_YYYYMMDDTHHMMSSZ.dump" >&2
  exit 1
fi

export DEPLOY_ROOT
deploy_common_init
deploy_load_env

: "${FLOWER_DB_HOST:?FLOWER_DB_HOST required}"
: "${FLOWER_DB_PORT:?FLOWER_DB_PORT required}"
: "${FLOWER_DB_NAME:?FLOWER_DB_NAME required}"
: "${FLOWER_DB_USER:?FLOWER_DB_USER required}"
: "${FLOWER_DB_PASSWORD:?FLOWER_DB_PASSWORD required}"

db_verify_pg_dump_file "${DUMP_FILE}"

echo "WARNING: This overwrites database '${FLOWER_DB_NAME}' on ${FLOWER_DB_HOST}:${FLOWER_DB_PORT}."
echo "         Other databases and Docker volumes are NOT affected."
read -r -p "Type '${FLOWER_DB_NAME}' to confirm: " confirm
[[ "${confirm}" == "${FLOWER_DB_NAME}" ]] || { echo "Aborted."; exit 1; }

deploy_log "Stopping Flower ERP api/backoffice..."
cd "${DEPLOY_ROOT}"
deploy_compose stop api backoffice 2>/dev/null || true

deploy_log "Restoring ${DUMP_FILE}..."
PGPASSWORD="${FLOWER_DB_PASSWORD}" pg_restore \
  -h "${FLOWER_DB_HOST}" \
  -p "${FLOWER_DB_PORT}" \
  -U "${FLOWER_DB_USER}" \
  -d "${FLOWER_DB_NAME}" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  "${DUMP_FILE}"

deploy_log "Starting Flower ERP api/backoffice..."
deploy_compose up -d --remove-orphans api backoffice
health_smoke_production
deploy_log "Restore complete."
