#!/usr/bin/env bash
# Restore flower_erp from a pg_dump custom-format backup.
# DESTRUCTIVE for flower_erp only — does not affect other databases (ORVIX).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

ENV_FILE="${ENV_FILE:-${DEPLOY_ROOT}/.env.production}"
DUMP_FILE="${1:-}"

if [[ -z "${DUMP_FILE}" || ! -f "${DUMP_FILE}" ]]; then
  echo "Usage: $0 /path/to/flower_erp_YYYYMMDDTHHMMSSZ.dump" >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: ${ENV_FILE} not found." >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "${ENV_FILE}"
set +a

: "${FLOWER_DB_HOST:?FLOWER_DB_HOST required}"
: "${FLOWER_DB_PORT:?FLOWER_DB_PORT required}"
: "${FLOWER_DB_NAME:?FLOWER_DB_NAME required}"
: "${FLOWER_DB_USER:?FLOWER_DB_USER required}"
: "${FLOWER_DB_PASSWORD:?FLOWER_DB_PASSWORD required}"

echo "WARNING: This will overwrite data in database '${FLOWER_DB_NAME}' on ${FLOWER_DB_HOST}:${FLOWER_DB_PORT}."
echo "         ORVIX databases are NOT affected."
read -r -p "Type '${FLOWER_DB_NAME}' to confirm: " confirm
if [[ "${confirm}" != "${FLOWER_DB_NAME}" ]]; then
  echo "Aborted."
  exit 1
fi

echo "==> Stopping Flower ERP containers (if running)..."
cd "${DEPLOY_ROOT}"
docker compose -f docker-compose.production.yml --env-file "${ENV_FILE}" stop api backoffice 2>/dev/null || true

echo "==> Restoring ${DUMP_FILE}..."

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

echo "==> Restore complete. Restart Flower ERP:"
echo "    ${SCRIPT_DIR}/deploy.sh"
