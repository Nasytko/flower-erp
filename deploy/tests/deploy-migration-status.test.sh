#!/usr/bin/env bash
# Unit tests for prisma migrate status classification (no production DB).
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# shellcheck source=../scripts/lib/deploy-common.sh
source "${SCRIPT_DIR}/../scripts/lib/deploy-common.sh"
# shellcheck source=../scripts/lib/prisma-migrate.sh
source "${SCRIPT_DIR}/../scripts/lib/prisma-migrate.sh"

fail=0
assert_eq() {
  local got="$1" want="$2" msg="$3"
  if [[ "${got}" != "${want}" ]]; then
    echo "FAIL: ${msg} (got='${got}' want='${want}')" >&2
    fail=1
  else
    echo "OK: ${msg}"
  fi
}

sample_up_to_date="Datasource \"db\": PostgreSQL database
14 migrations found in prisma/migrations
Database schema is up to date!"

sample_pending="Following migrations have not yet been applied:
20260729150000_remove_unused_enum_values
To apply migrations in development run prisma migrate dev."

sample_failed="Following migrations have failed:
20260729150000_remove_unused_enum_values
During development ..."

sample_connection="Error: P1001: Can't reach database server at \`leadflow-postgres-1:5432\`"

sample_unknown_cmd="Error: Unknown command \"status\""

assert_eq "$(prisma_classify_status_output "${sample_up_to_date}" 0)" "up_to_date" "up to date"
assert_eq "$(prisma_classify_status_output "${sample_pending}" 1)" "pending" "pending"
assert_eq "$(prisma_classify_status_output "${sample_failed}" 1)" "failed" "failed"
assert_eq "$(prisma_classify_status_output "${sample_connection}" 1)" "connection_error" "connection error"
assert_eq "$(prisma_classify_status_output "${sample_unknown_cmd}" 1)" "cli_error" "cli error"

failed_list="$(prisma_extract_migration_names 'have failed' "${sample_failed}")"
assert_eq "${failed_list}" "20260729150000_remove_unused_enum_values" "failed migration parse"

pending_list="$(prisma_extract_migration_names 'not yet been applied' "${sample_pending}")"
assert_eq "${pending_list}" "20260729150000_remove_unused_enum_values" "pending migration parse"

exit "${fail}"
