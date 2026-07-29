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

if ! command -v bash >/dev/null 2>&1; then
  echo "bash required" >&2
  exit 1
fi

bash -n "${SCRIPT_DIR}/../scripts/recover-stage-c-migration.sh"
bash -n "${SCRIPT_DIR}/../scripts/reset-test-database.sh"
bash -n "${SCRIPT_DIR}/../scripts/deploy.sh"
bash -n "${SCRIPT_DIR}/../scripts/lib/deploy-common.sh"
bash -n "${SCRIPT_DIR}/../scripts/lib/pg-exec.sh"
bash -n "${SCRIPT_DIR}/../scripts/lib/prisma-migrate.sh"
bash -n "${SCRIPT_DIR}/../scripts/lib/recover-stage-c-lib.sh"
bash -n "${SCRIPT_DIR}/../scripts/lib/reset-test-database-lib.sh"
echo "OK: bash -n syntax checks"

run_test "pg-exec.test.sh"
run_test "deploy-migration-status.test.sh"
run_test "recover-stage-c-migration.test.sh"
run_test "recover-stage-c-integration.test.sh"
run_test "migrate-image-psql.test.sh"
run_test "reset-test-database.test.sh"
run_test "reset-test-database-integration.test.sh"

exit "${fail}"
