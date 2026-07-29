#!/usr/bin/env bash
# Integration test: reset drops only flower_erp on shared PostgreSQL (Docker).
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

if ! command -v docker >/dev/null 2>&1; then
  echo "SKIP: docker not available"
  exit 0
fi

CONTAINER="flower-reset-itest-$$"
NETWORK="flower-reset-itest-net-$$"
VOLUME="flower-reset-itest-vol-$$"
PGPORT="55433"
PGPASSWORD="reset_test_secret"
MIGRATE_IMAGE="flower-erp-migrate:reset-itest-$$"
WORKDIR=""

cleanup() {
  docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true
  docker network rm "${NETWORK}" >/dev/null 2>&1 || true
  docker volume rm "${VOLUME}" >/dev/null 2>&1 || true
  docker rmi "${MIGRATE_IMAGE}" >/dev/null 2>&1 || true
  [[ -n "${WORKDIR}" && -d "${WORKDIR}" ]] && rm -rf "${WORKDIR}"
}
trap cleanup EXIT

docker network create "${NETWORK}" >/dev/null
docker volume create "${VOLUME}" >/dev/null

docker run -d --name "${CONTAINER}" --network "${NETWORK}" \
  -p "127.0.0.1:${PGPORT}:5432" \
  -v "${VOLUME}:/var/lib/postgresql/data" \
  -e POSTGRES_PASSWORD="${PGPASSWORD}" \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_DB=postgres \
  postgres:16-alpine >/dev/null

for _ in $(seq 1 30); do
  docker exec "${CONTAINER}" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done

docker exec -i "${CONTAINER}" psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'EOSQL'
CREATE ROLE flower_migrate LOGIN PASSWORD 'migrate';
CREATE ROLE flower_user LOGIN PASSWORD 'app';
CREATE DATABASE flower_erp OWNER flower_migrate;
CREATE DATABASE other_db OWNER postgres;
\c other_db
CREATE TABLE marker (id int PRIMARY KEY, label text NOT NULL);
INSERT INTO marker (id, label) VALUES (1, 'preserve-me');
\c flower_erp
CREATE TABLE junk (id int PRIMARY KEY);
INSERT INTO junk VALUES (1);
EOSQL

export DATABASE_MIGRATE_URL="postgresql://flower_migrate:migrate@127.0.0.1:${PGPORT}/flower_erp?schema=public"

# Hold an open session against flower_erp while reset runs.
docker exec -d "${CONTAINER}" psql -U flower_migrate -d flower_erp -c "SELECT pg_sleep(120);" >/dev/null
sleep 1

active_before="$(docker exec "${CONTAINER}" psql -U postgres -d postgres -Atc \
  "SELECT COUNT(*) FROM pg_stat_activity WHERE datname = 'flower_erp' AND pid <> pg_backend_pid();")"
[[ "${active_before}" -ge 1 ]] || { echo "FAIL: expected active flower_erp session" >&2; exit 1; }

export DEPLOY_ROOT
export FLOWER_POSTGRES_CONTAINER="${CONTAINER}"
export FLOWER_DB_NAME="flower_erp"
export CONFIRM_RESET_TEST_DATABASE=YES
export CONFIRM_ALL_FLOWER_DATA_CAN_BE_DELETED=YES
export ALLOW_RESET_WITHOUT_BACKUP=YES

# shellcheck source=../scripts/lib/deploy-common.sh
source "${SCRIPT_DIR}/../scripts/lib/deploy-common.sh"
# shellcheck source=../scripts/lib/pg-exec.sh
source "${SCRIPT_DIR}/../scripts/lib/pg-exec.sh"
# shellcheck source=../scripts/lib/reset-test-database-lib.sh
source "${SCRIPT_DIR}/../scripts/lib/reset-test-database-lib.sh"

reset_validate_target_database
reset_drop_and_recreate_database "flower_erp" "flower_migrate"

active_after="$(docker exec "${CONTAINER}" psql -U postgres -d postgres -Atc \
  "SELECT COUNT(*) FROM pg_stat_activity WHERE datname = 'flower_erp' AND pid <> pg_backend_pid();")"
[[ "${active_after}" == "0" ]] || { echo "FAIL: flower_erp sessions not terminated" >&2; exit 1; }

other_label="$(docker exec "${CONTAINER}" psql -U postgres -d other_db -Atc \
  "SELECT label FROM marker WHERE id = 1;")"
[[ "${other_label}" == "preserve-me" ]] || { echo "FAIL: other_db data was lost" >&2; exit 1; }

docker volume inspect "${VOLUME}" >/dev/null \
  || { echo "FAIL: PostgreSQL data volume was removed" >&2; exit 1; }

WORKDIR="$(mktemp -d)"
cat > "${WORKDIR}/.env.production" <<EOF
COMPOSE_PROJECT_NAME=flower-reset-itest-$$
DATABASE_MIGRATE_URL=${DATABASE_MIGRATE_URL}
FLOWER_MIGRATE_IMAGE=${MIGRATE_IMAGE}
EOF
export ENV_FILE="${WORKDIR}/.env.production"
export COMPOSE_FILE="${SCRIPT_DIR}/fixtures/docker-compose.migrate-itest.yml"

deploy_compose_migrate build migrate >/dev/null
deploy_compose_migrate run --rm migrate migrate deploy

pg_itest_handler() {
  psql "$(pg_prisma_url_for_psql "${DATABASE_MIGRATE_URL}")" "$@"
}
export PG_EXEC_TEST_HANDLER=pg_itest_handler
pg_load_env
reset_validate_post_migrate

failed_rows="$(pg_run_sql "
  SELECT COUNT(*)::text
  FROM \"_prisma_migrations\"
  WHERE finished_at IS NULL AND rolled_back_at IS NULL;
")"
[[ "${failed_rows}" == "0" ]] || { echo "FAIL: unfinished migrations after deploy" >&2; exit 1; }

# Seed gate: default skips; RUN_SEED=1 reaches seed branch (no auto demo data).
unset RUN_SEED
reset_run_optional_seed 2>&1 | grep -q 'Skipping seed' \
  || { echo "FAIL: seed should skip by default" >&2; exit 1; }
export RUN_SEED=1
reset_run_optional_seed 2>&1 | grep -q 'RUN_SEED=1 set' \
  || { echo "FAIL: RUN_SEED=1 should enable seed branch" >&2; exit 1; }

echo "OK: reset integration (shared PG, sessions, volume, migrations, seed gate)"
