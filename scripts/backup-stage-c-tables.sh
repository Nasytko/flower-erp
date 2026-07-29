#!/usr/bin/env bash
# Flower ERP — Stage C backup for tables scheduled for removal.
# Read-only against the database (pg_dump only). Does not modify data.
#
# Usage:
#   DATABASE_URL='postgresql://user:pass@host:5432/db' ./scripts/backup-stage-c-tables.sh
#
# Requires: pg_dump, sha256sum (or shasum on macOS)

set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set." >&2
  echo "Export DATABASE_URL before running this script." >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "ERROR: pg_dump not found in PATH." >&2
  exit 1
fi

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="backups/stage-c-${TIMESTAMP}"
mkdir -p "${BACKUP_DIR}"

TABLES=(
  delivery_route_plans
  delivery_route_stops
  payment_allocation_transfers
  order_composition_replacements
  order_timeline_events
  sale_timeline_events
  payment_timeline_events
  delivery_timeline_events
  transfer_timeline_events
  reservation_movements
)

TABLE_ARGS=()
for t in "${TABLES[@]}"; do
  TABLE_ARGS+=(--table="${t}")
done

echo "Creating Stage C backup in ${BACKUP_DIR} ..."

# Schema + data for removable tables only
pg_dump "${DATABASE_URL}" \
  --format=plain \
  --no-owner \
  --no-privileges \
  "${TABLE_ARGS[@]}" \
  > "${BACKUP_DIR}/stage-c-tables.sql"

# Enum usage report (SELECT only)
ENUM_REPORT="${BACKUP_DIR}/enum-usage-report.sql"
cat > "${ENUM_REPORT}" <<'EOSQL'
-- Enum usage at backup time (informational)
SELECT 'payment_methods GIFT_CERTIFICATE' AS label, COUNT(*) FROM payment_methods WHERE type = 'GIFT_CERTIFICATE';
SELECT 'payments via GIFT_CERTIFICATE' AS label, COUNT(*) FROM payments p JOIN payment_methods pm ON pm.id = p.method_id WHERE pm.type = 'GIFT_CERTIFICATE';
SELECT 'sales TELEGRAM channel' AS label, COUNT(*) FROM sales WHERE sales_channel = 'TELEGRAM';
EOSQL

if command -v psql >/dev/null 2>&1; then
  psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${ENUM_REPORT}" \
    > "${BACKUP_DIR}/enum-usage-report.txt" 2>&1 || {
    echo "WARNING: enum usage report failed (tables may be empty or DB unreachable)." >&2
  }
else
  echo "WARNING: psql not found; enum usage report SQL saved but not executed." >&2
fi

# Checksums
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "${BACKUP_DIR}"/* > "${BACKUP_DIR}/checksums.sha256"
elif command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "${BACKUP_DIR}"/* > "${BACKUP_DIR}/checksums.sha256"
else
  echo "WARNING: neither sha256sum nor shasum found; skipping checksum file." >&2
fi

cat > "${BACKUP_DIR}/README.txt" <<EOF
Flower ERP Stage C backup
Created: ${TIMESTAMP}
Tables: ${TABLES[*]}

Restore example (review before running):
  psql "\$DATABASE_URL" -f stage-c-tables.sql

Do not commit this directory to Git.
EOF

echo "Backup complete: ${BACKUP_DIR}"
echo "Files:"
ls -la "${BACKUP_DIR}"
