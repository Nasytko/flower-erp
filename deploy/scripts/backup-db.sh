#!/usr/bin/env bash
# Backup flower_erp to a verified custom-format dump on the host.
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=lib/compose.sh
source "${SCRIPT_DIR}/lib/compose.sh"
# shellcheck source=lib/database.sh
source "${SCRIPT_DIR}/lib/database.sh"

export DEPLOY_ROOT
deploy_common_init
deploy_load_env

BACKUP_DIR="${FLOWER_DB_BACKUP_DIR:-${DEPLOY_ROOT}/backups}"
RETENTION_DAYS="${FLOWER_DB_BACKUP_RETENTION_DAYS:-14}"
DB_NAME="${FLOWER_DB_NAME:-flower_erp}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUTPUT="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.dump"

mkdir -p "${BACKUP_DIR}"

deploy_log "Backing up ${DB_NAME} → ${OUTPUT}"
db_stream_pg_dump_to_file "${OUTPUT}"
deploy_write_checksum "${OUTPUT}" "${OUTPUT}.sha256"

deploy_log "Backup size: $(du -h "${OUTPUT}" | cut -f1)"
deploy_log "Backup path: ${OUTPUT}"

if [[ "${RETENTION_DAYS}" -gt 0 ]]; then
  find "${BACKUP_DIR}" -name "${DB_NAME}_*.dump" -mtime "+${RETENTION_DAYS}" -delete
  deploy_log "Pruned backups older than ${RETENTION_DAYS} days"
fi

deploy_log "Done."
