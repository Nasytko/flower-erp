#!/usr/bin/env bash
# Optional PostgreSQL 16 integration test via migrate-container pg-exec path.
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

if ! command -v docker >/dev/null 2>&1; then
  echo "SKIP: docker not available"
  exit 0
fi

CONTAINER="flower-recover-itest-$$"
NETWORK="flower-recover-itest-net-$$"
PGPASSWORD="recover_test_secret"
DATABASE_MIGRATE_URL="postgresql://recover_migrate:${PGPASSWORD}@127.0.0.1:55432/flower_recover_test?schema=public"

cleanup() {
  docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true
  docker network rm "${NETWORK}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker network create "${NETWORK}" >/dev/null
docker run -d --name "${CONTAINER}" --network "${NETWORK}" \
  -e POSTGRES_PASSWORD="${PGPASSWORD}" \
  -e POSTGRES_USER=recover_migrate \
  -e POSTGRES_DB=flower_recover_test \
  -p 127.0.0.1:55432:5432 \
  postgres:16-alpine >/dev/null

for _ in $(seq 1 30); do
  docker exec "${CONTAINER}" pg_isready -U recover_migrate >/dev/null 2>&1 && break
  sleep 1
done

docker exec -i "${CONTAINER}" psql -U recover_migrate -d flower_recover_test -v ON_ERROR_STOP=1 <<'EOSQL'
CREATE TYPE "PaymentMethodType" AS ENUM (
  'CASH','BANK_CARD','ONLINE','QR','BANK_TRANSFER','OTHER'
);
CREATE TYPE "SalesChannel" AS ENUM ('STORE','PHONE','WEBSITE','TELEGRAM','OTHER');
CREATE TYPE "SalesChannel_new" AS ENUM ('STORE','PHONE','WEBSITE','OTHER');
CREATE TABLE payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type "PaymentMethodType" NOT NULL
);
CREATE TABLE sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_channel "SalesChannel" NOT NULL DEFAULT 'STORE'
);
INSERT INTO payment_methods (type) VALUES ('CASH');
INSERT INTO sales (sales_channel) VALUES ('STORE');
CREATE TABLE "_prisma_migrations" (
  id varchar(36) PRIMARY KEY,
  checksum varchar(64) NOT NULL,
  finished_at timestamptz,
  migration_name varchar(255) NOT NULL,
  logs text,
  rolled_back_at timestamptz,
  started_at timestamptz NOT NULL DEFAULT now(),
  applied_steps_count integer NOT NULL DEFAULT 0
);
EOSQL

export DEPLOY_ROOT
export DATABASE_MIGRATE_URL
export PG_EXEC_TEST_HANDLER=pg_itest_handler

WORKDIR="$(mktemp -d)"
trap 'rm -rf "${WORKDIR}"; cleanup' EXIT

cat > "${WORKDIR}/.env.production" <<EOF
COMPOSE_PROJECT_NAME=flower-recover-itest
DATABASE_MIGRATE_URL=${DATABASE_MIGRATE_URL}
EOF
export ENV_FILE="${WORKDIR}/.env.production"
export COMPOSE_FILE="${DEPLOY_ROOT}/docker-compose.production.yml"

# shellcheck source=../scripts/lib/deploy-common.sh
source "${SCRIPT_DIR}/../scripts/lib/deploy-common.sh"
# shellcheck source=../scripts/lib/pg-exec.sh
source "${SCRIPT_DIR}/../scripts/lib/pg-exec.sh"
# shellcheck source=../scripts/lib/recover-stage-c-lib.sh
source "${SCRIPT_DIR}/../scripts/lib/recover-stage-c-lib.sh"

pg_itest_handler() {
  psql "${DATABASE_MIGRATE_URL}" "$@"
}

pg_load_env
recover_collect_schema_state
recover_detect_state
[[ "${RECOVER_STATE}" == "A" ]] || { echo "FAIL: expected state A, got ${RECOVER_STATE}" >&2; exit 1; }

RECOVER_LOG_DIR="${WORKDIR}"
repair_sql="${WORKDIR}/repair.sql"
recover_write_state_a_sql "${repair_sql}"
pg_run_sql_file "${repair_sql}"
recover_assert_final_invariants
recover_verify_no_removed_enum_values

echo "OK: PostgreSQL 16 integration recovery (state A, pg-exec path)"
