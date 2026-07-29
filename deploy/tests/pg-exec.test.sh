#!/usr/bin/env bash
# Unit tests for pg-exec.sh (no production DB, no URL logging).
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

export DEPLOY_ROOT
export COMPOSE_FILE="${DEPLOY_ROOT}/docker-compose.production.yml"
export ENV_FILE="${DEPLOY_ROOT}/.env.production.example"

# shellcheck source=../scripts/lib/common.sh
source "${SCRIPT_DIR}/../scripts/lib/common.sh"
# shellcheck source=../scripts/lib/compose.sh
source "${SCRIPT_DIR}/../scripts/lib/compose.sh"
# shellcheck source=../scripts/lib/database.sh
source "${SCRIPT_DIR}/../scripts/lib/database.sh"

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

assert_eq "$(pg_prisma_url_for_psql 'postgresql://u:p@h:5432/db?schema=public')" \
  "postgresql://u:p@h:5432/db" "schema only removed"
assert_eq "$(pg_prisma_url_for_psql 'postgresql://u:p@h:5432/db?sslmode=require&schema=public')" \
  "postgresql://u:p@h:5432/db?sslmode=require" "schema last removed"
assert_eq "$(pg_prisma_url_for_psql 'postgresql://u:p@h:5432/db?schema=public&sslmode=require')" \
  "postgresql://u:p@h:5432/db?sslmode=require" "schema first removed"
assert_eq "$(pg_prisma_url_for_psql 'postgresql://u:p@h:5432/db?connect_timeout=10&schema=public&sslmode=require')" \
  "postgresql://u:p@h:5432/db?connect_timeout=10&sslmode=require" "schema middle removed"
assert_eq "$(pg_prisma_url_for_psql 'postgresql://u:p@h:5432/db?sslmode=require')" \
  "postgresql://u:p@h:5432/db?sslmode=require" "no schema unchanged"
assert_eq "$(pg_prisma_url_for_psql 'postgres://u:p@h:5432/db?schema=public')" \
  "postgres://u:p@h:5432/db" "postgres:// scheme supported"

assert_not_contains() {
  local haystack="$1" needle="$2" msg="$3"
  if printf '%s' "${haystack}" | grep -qF "${needle}"; then
    echo "FAIL: ${msg} (leaked '${needle}')" >&2
    fail=1
  else
    echo "OK: ${msg}"
  fi
}

WORKDIR="$(mktemp -d)"
trap 'rm -rf "${WORKDIR}"' EXIT

cat > "${WORKDIR}/.env.production" <<'EOF'
COMPOSE_PROJECT_NAME=flower-erp
DATABASE_MIGRATE_URL=postgresql://migrate_user:p%40ss%2Fword@leadflow-postgres-1:5432/flower_erp?schema=public
DATABASE_URL=postgresql://app_user:secret@leadflow-postgres-1:5432/flower_erp?schema=public
EOF

export ENV_FILE="${WORKDIR}/.env.production"
PG_EXEC_TEST_OUTPUT="${WORKDIR}/psql.log"
: > "${PG_EXEC_TEST_OUTPUT}"

pg_load_env
assert_eq "${DATABASE_MIGRATE_URL}" "postgresql://migrate_user:p%40ss%2Fword@leadflow-postgres-1:5432/flower_erp?schema=public" "uses DATABASE_MIGRATE_URL"
assert_eq "${PG_USING_DATABASE_URL_FALLBACK}" "0" "no fallback when migrate url set"

PG_EXEC_TEST_OUTPUT="${WORKDIR}/psql2.log"
: > "${PG_EXEC_TEST_OUTPUT}"
cat > "${WORKDIR}/.env.fallback" <<'EOF'
DATABASE_URL="postgres://ddl_user:secr%25et@db.internal:5432/flower_erp?schema=public&sslmode=require"
EOF
export ENV_FILE="${WORKDIR}/.env.fallback"
unset DATABASE_MIGRATE_URL DATABASE_URL
PG_USING_DATABASE_URL_FALLBACK=0
PG_PSQL_CONNECTION_URL=""
pg_load_env
assert_eq "${PG_USING_DATABASE_URL_FALLBACK}" "1" "fallback flag when only DATABASE_URL"
assert_eq "${DATABASE_MIGRATE_URL}" "postgres://ddl_user:secr%25et@db.internal:5432/flower_erp?schema=public&sslmode=require" "postgres:// accepted"

PG_EXEC_TEST_HANDLER=pg_test_handler
pg_test_handler() {
  printf '%s\n' "$@" >> "${PG_EXEC_TEST_OUTPUT}"
  return 0
}

pg_psql -X -A -t -P pager=off -v ON_ERROR_STOP=1 -c "SELECT 1;"
grep -Fq "SELECT 1;" "${PG_EXEC_TEST_OUTPUT}"
echo "OK: sql string invocation"

SQL_FILE="${WORKDIR}/query.sql"
printf 'BEGIN;\nSELECT 1;\nCOMMIT;\n' > "${SQL_FILE}"
PG_EXEC_TEST_OUTPUT="${WORKDIR}/psql3.log"
: > "${PG_EXEC_TEST_OUTPUT}"
pg_run_sql_file "${SQL_FILE}"
grep -Fq "${SQL_FILE}" "${PG_EXEC_TEST_OUTPUT}" || grep -Fq -- "-f" "${PG_EXEC_TEST_OUTPUT}"
echo "OK: sql file invocation passes -f to psql"

assert_not_contains "$(cat "${WORKDIR}/psql.log" 2>/dev/null || true)" "p%40ss" "password not in test log"
assert_not_contains "$(cat "${WORKDIR}/psql.log" 2>/dev/null || true)" "postgresql://" "url not in test log"

PG_EXEC_TEST_HANDLER=pg_test_fail_handler
unset PG_EXEC_TEST_OUTPUT
pg_test_fail_handler() { return 1; }
if pg_psql -c "SELECT 1;" 2>"${WORKDIR}/err.log"; then
  echo "FAIL: connection failure should abort" >&2
  fail=1
else
  echo "OK: connection failure aborts"
fi
assert_not_contains "$(cat "${WORKDIR}/err.log")" "postgresql://" "url not in error output"

exit "${fail}"
