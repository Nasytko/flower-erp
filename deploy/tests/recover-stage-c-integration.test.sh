#!/usr/bin/env bash
# Optional PostgreSQL 16 integration test for Stage C enum recovery SQL.
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# shellcheck source=../scripts/lib/deploy-common.sh
source "${SCRIPT_DIR}/../scripts/lib/deploy-common.sh"
# shellcheck source=../scripts/lib/pg-exec.sh
source "${SCRIPT_DIR}/../scripts/lib/pg-exec.sh"
# shellcheck source=../scripts/lib/recover-stage-c-lib.sh
source "${SCRIPT_DIR}/../scripts/lib/recover-stage-c-lib.sh"

if ! command -v docker >/dev/null 2>&1; then
  echo "SKIP: docker not available"
  exit 0
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "SKIP: psql not available"
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
  if docker exec "${CONTAINER}" pg_isready -U recover_migrate >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

docker exec "${CONTAINER}" pg_isready -U recover_migrate >/dev/null

docker exec -i "${CONTAINER}" psql -U recover_migrate -d flower_recover_test -v ON_ERROR_STOP=1 <<'EOSQL'
CREATE TYPE "PaymentMethodType" AS ENUM (
  'CASH','BANK_CARD','ONLINE','QR','BANK_TRANSFER','GIFT_CERTIFICATE','OTHER'
);
CREATE TYPE "SalesChannel" AS ENUM ('STORE','PHONE','WEBSITE','TELEGRAM','OTHER');

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

INSERT INTO "_prisma_migrations" (id, checksum, migration_name, logs, finished_at)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'checksum',
  '20260729150000_remove_unused_enum_values',
  'ERROR: default for column "sales_channel" cannot be cast automatically to type "SalesChannel_new"',
  NULL
);

CREATE TYPE "SalesChannel_new" AS ENUM ('STORE','PHONE','WEBSITE','OTHER');
EOSQL

export DATABASE_MIGRATE_URL
export FLOWER_DB_HOST=127.0.0.1
export FLOWER_DB_PORT=55432
export FLOWER_DB_NAME=flower_recover_test

RECOVER_LOG_DIR="$(mktemp -d)"
recover_collect_schema_state
recover_detect_state

if [[ "${RECOVER_STATE}" != "A" ]]; then
  echo "FAIL: expected state A, got ${RECOVER_STATE}" >&2
  exit 1
fi

repair_sql="${RECOVER_LOG_DIR}/repair.sql"
recover_write_state_a_sql "${repair_sql}"
pg_run_sql_file "${repair_sql}"

recover_assert_final_invariants
recover_verify_no_removed_enum_values

echo "OK: PostgreSQL 16 integration recovery (state A)"
