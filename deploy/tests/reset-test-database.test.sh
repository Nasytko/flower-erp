#!/usr/bin/env bash
# Unit tests for reset-test-database helpers (no production DB).
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

export DEPLOY_ROOT

# shellcheck source=../scripts/lib/deploy-common.sh
source "${SCRIPT_DIR}/../scripts/lib/deploy-common.sh"
# shellcheck source=../scripts/lib/pg-exec.sh
source "${SCRIPT_DIR}/../scripts/lib/pg-exec.sh"
# shellcheck source=../scripts/lib/reset-test-database-lib.sh
source "${SCRIPT_DIR}/../scripts/lib/reset-test-database-lib.sh"

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

assert_fails() {
  local msg="$1"
  shift
  if ( "$@" ) >/dev/null 2>&1; then
    echo "FAIL: expected failure for ${msg}" >&2
    fail=1
  else
    echo "OK: ${msg} fails as expected"
  fi
}

# missing confirmation flags
unset CONFIRM_RESET_TEST_DATABASE CONFIRM_ALL_FLOWER_DATA_CAN_BE_DELETED
assert_fails "missing flags" reset_confirm_flags_present

export CONFIRM_RESET_TEST_DATABASE=YES
export CONFIRM_ALL_FLOWER_DATA_CAN_BE_DELETED=YES
reset_confirm_flags_present
echo "OK: flags accepted"

# database validation
export FLOWER_DB_NAME="flower_erp"
export DATABASE_MIGRATE_URL="postgresql://u:p@host:5432/flower_erp?schema=public"
reset_validate_target_database
echo "OK: valid flower_erp URL accepted"

export DATABASE_MIGRATE_URL="postgresql://u:p@host:5432/postgres?schema=public"
assert_fails "postgres database rejected" reset_validate_target_database

export FLOWER_DB_NAME="postgres"
export DATABASE_MIGRATE_URL="postgresql://u:p@host:5432/postgres"
assert_fails "postgres name rejected" reset_validate_target_database

export FLOWER_DB_NAME="flower_erp"
export DATABASE_MIGRATE_URL="postgres://u:p@host:5432/flower_erp?sslmode=require&schema=public"
reset_validate_target_database
echo "OK: postgres:// with query accepted"

export FLOWER_DB_NAME="flower_erp"
export DATABASE_MIGRATE_URL="postgresql://u:p@host:5432/wrong_db?schema=public"
assert_fails "wrong database name in URL" reset_validate_target_database

export FLOWER_DB_NAME="other_erp"
export DATABASE_MIGRATE_URL="postgresql://u:p@host:5432/other_erp"
assert_fails "wrong FLOWER_DB_NAME" reset_validate_target_database

# backup gate
export FLOWER_DB_NAME="flower_erp"
export DATABASE_MIGRATE_URL="postgresql://u:p@host:5432/flower_erp"
RESET_BACKUP_HANDLER() { return 1; }
export RESET_BACKUP_HANDLER
export ALLOW_RESET_WITHOUT_BACKUP=""
assert_fails "backup without allow flag" reset_attempt_backup
export ALLOW_RESET_WITHOUT_BACKUP=YES
reset_attempt_backup
echo "OK: backup skip allowed with flag"

# seed gate
unset RUN_SEED
reset_run_optional_seed 2>&1 | grep -q 'Skipping seed' \
  || { echo "FAIL: seed should skip without RUN_SEED=1" >&2; fail=1; }
export RUN_SEED=1
reset_run_optional_seed 2>&1 | grep -q 'RUN_SEED=1 set' \
  || { echo "FAIL: seed branch with RUN_SEED=1" >&2; fail=1; }
echo "OK: seed runs only with RUN_SEED=1"

# admin SQL only touches flower_erp
ADMIN_SQL=""
reset_admin_psql() {
  local chunk=""
  if [[ $# -gt 0 ]]; then
    chunk="$*"
  fi
  if [[ ! -t 0 ]]; then
    chunk+="$(cat)"
  fi
  ADMIN_SQL+="${chunk}"$'\n'
}
export FLOWER_POSTGRES_CONTAINER="test-pg"
export RESET_DB_OWNER="flower_migrate"
reset_drop_and_recreate_database "flower_erp" "flower_migrate"
grep -Fq "datname = 'flower_erp'" <<< "${ADMIN_SQL}" || { echo "FAIL: terminate targets flower_erp" >&2; fail=1; }
grep -Fq 'DROP DATABASE IF EXISTS "flower_erp"' <<< "${ADMIN_SQL}" || { echo "FAIL: drop flower_erp" >&2; fail=1; }
grep -Fq 'CREATE DATABASE "flower_erp"' <<< "${ADMIN_SQL}" || { echo "FAIL: create flower_erp" >&2; fail=1; }
! grep -Fq 'DROP DATABASE IF EXISTS "other_db"' <<< "${ADMIN_SQL}" || { echo "FAIL: other db touched" >&2; fail=1; }
echo "OK: drop/create only flower_erp"

exit "${fail}"
