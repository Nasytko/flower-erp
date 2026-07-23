#!/usr/bin/env bash
# Backup flower_erp database only (does not touch ORVIX databases).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

ENV_FILE="${ENV_FILE:-${DEPLOY_ROOT}/.env.production}"

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
: "${FLOWER_DB_PASSWORD:?FLOWER_DB_PASSWORD required (set in .env.production)}"

BACKUP_DIR="${FLOWER_DB_BACKUP_DIR:-${DEPLOY_ROOT}/backups}"
RETENTION_DAYS="${FLOWER_DB_BACKUP_RETENTION_DAYS:-14}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUTPUT="${BACKUP_DIR}/${FLOWER_DB_NAME}_${TIMESTAMP}.dump"

mkdir -p "${BACKUP_DIR}"

echo "==> Backing up ${FLOWER_DB_NAME} → ${OUTPUT}"

PGPASSWORD="${FLOWER_DB_PASSWORD}" pg_dump \
  -h "${FLOWER_DB_HOST}" \
  -p "${FLOWER_DB_PORT}" \
  -U "${FLOWER_DB_USER}" \
  -d "${FLOWER_DB_NAME}" \
  -Fc \
  --no-owner \
  --no-privileges \
  -f "${OUTPUT}"

echo "==> Backup size: $(du -h "${OUTPUT}" | cut -f1)"

if [[ "${RETENTION_DAYS}" -gt 0 ]]; then
  find "${BACKUP_DIR}" -name "${FLOWER_DB_NAME}_*.dump" -mtime "+${RETENTION_DAYS}" -delete
  echo "==> Pruned backups older than ${RETENTION_DAYS} days"
fi

echo "==> Done."
