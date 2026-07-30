#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fail=0

run_test() {
  local name="$1"
  echo "==> ${name}"
  if bash "${SCRIPT_DIR}/${name}"; then
    echo "PASS: ${name}"
  else
    echo "FAIL: ${name}" >&2
    fail=1
  fi
}

bash -n "${SCRIPT_DIR}/../scripts/deploy.sh"
bash -n "${SCRIPT_DIR}/../scripts/preflight.sh"
bash -n "${SCRIPT_DIR}/../scripts/migrate.sh"
bash -n "${SCRIPT_DIR}/../scripts/backup-db.sh"
bash -n "${SCRIPT_DIR}/../scripts/restore-db.sh"
bash -n "${SCRIPT_DIR}/../scripts/status.sh"
bash -n "${SCRIPT_DIR}/../scripts/rollback.sh"
bash -n "${SCRIPT_DIR}/../scripts/bootstrap-first-organization.sh"
bash -n "${SCRIPT_DIR}/../scripts/create-director-user.sh"
bash -n "${SCRIPT_DIR}/../scripts/dev/reset-test-database.sh"
bash -n "${SCRIPT_DIR}/../scripts/lib/common.sh"
bash -n "${SCRIPT_DIR}/../scripts/lib/compose.sh"
bash -n "${SCRIPT_DIR}/../scripts/lib/health.sh"
bash -n "${SCRIPT_DIR}/../scripts/lib/database.sh"
bash -n "${SCRIPT_DIR}/../scripts/dev/lib/reset-test-database-lib.sh"
echo "OK: bash -n syntax checks"

run_test "pg-exec.test.sh"
run_test "deploy-migration-status.test.sh"
run_test "migrate-image-psql.test.sh"
run_test "reset-test-database.test.sh"
run_test "reset-test-database-integration.test.sh"
run_test "backup-db-stream.test.sh"
run_test "backup-db-integration.test.sh"

exit "${fail}"
