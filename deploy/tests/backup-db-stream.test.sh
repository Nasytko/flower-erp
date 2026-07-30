#!/usr/bin/env bash
# Unit tests for database.sh pg URL helpers.
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

assert_eq "$(printf '%s' '16.14' | pg_parse_major_version)" "16" "server version major"
assert_eq "$(printf '%s' 'pg_dump (PostgreSQL) 16.4' | pg_parse_major_version)" "16" "pg_dump version major"

WORKDIR="$(mktemp -d)"
trap 'rm -rf "${WORKDIR}"' EXIT

cat > "${WORKDIR}/.env.production" <<'EOF'
COMPOSE_PROJECT_NAME=flower-erp
DATABASE_MIGRATE_URL=postgresql://migrate_user:p%40ss%2Fword@leadflow-postgres-1:5432/flower_erp?schema=public
EOF
export ENV_FILE="${WORKDIR}/.env.production"
pg_load_env
assert_eq "${DATABASE_MIGRATE_URL}" "postgresql://migrate_user:p%40ss%2Fword@leadflow-postgres-1:5432/flower_erp?schema=public" "uses DATABASE_MIGRATE_URL"

TMP_DUMP="${WORKDIR}/test.dump"
printf 'PGDMP-test' > "${TMP_DUMP}"
[[ "$(head -c 5 "${TMP_DUMP}")" == "PGDMP" ]] || { echo "FAIL: PGDMP magic" >&2; fail=1; }
echo "OK: PGDMP magic prefix"

exit "${fail}"
