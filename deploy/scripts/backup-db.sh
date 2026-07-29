#!/usr/bin/env bash
# Backup flower_erp database only (does not touch ORVIX databases).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# shellcheck source=lib/deploy-common.sh
source "${SCRIPT_DIR}/lib/deploy-common.sh"
# shellcheck source=lib/pg-exec.sh
source "${SCRIPT_DIR}/lib/pg-exec.sh"

ENV_FILE="${ENV_FILE:-${DEPLOY_ROOT}/.env.production}"
export DEPLOY_ROOT

deploy_common_init

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: ${ENV_FILE} not found." >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "${ENV_FILE}"
set +a

BACKUP_DIR="${FLOWER_DB_BACKUP_DIR:-${DEPLOY_ROOT}/backups}"
RETENTION_DAYS="${FLOWER_DB_BACKUP_RETENTION_DAYS:-14}"
DB_NAME="${FLOWER_DB_NAME:-flower_erp}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUTPUT="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.dump"

mkdir -p "${BACKUP_DIR}"

echo "==> Backing up ${DB_NAME} → ${OUTPUT}"

if command -v pg_dump >/dev/null 2>&1 \
  && [[ -n "${FLOWER_DB_HOST:-}" && -n "${FLOWER_DB_PORT:-}" && -n "${FLOWER_DB_USER:-}" && -n "${FLOWER_DB_PASSWORD:-}" ]]; then
  PGPASSWORD="${FLOWER_DB_PASSWORD}" pg_dump \
    -h "${FLOWER_DB_HOST}" \
    -p "${FLOWER_DB_PORT}" \
    -U "${FLOWER_DB_USER}" \
    -d "${DB_NAME}" \
    -Fc \
    --no-owner \
    --no-privileges \
    -f "${OUTPUT}"
else
  echo "==> Host pg_dump unavailable; using migrate container."
  deploy_check_docker
  pg_load_env
  pg_run_pg_dump "${OUTPUT}"
fi

echo "==> Backup size: $(du -h "${OUTPUT}" | cut -f1)"

if [[ "${RETENTION_DAYS}" -gt 0 ]]; then
  find "${BACKUP_DIR}" -name "${DB_NAME}_*.dump" -mtime "+${RETENTION_DAYS}" -delete
  echo "==> Pruned backups older than ${RETENTION_DAYS} days"
fi

echo "==> Done."
