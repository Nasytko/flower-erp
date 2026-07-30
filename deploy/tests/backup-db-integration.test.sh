#!/usr/bin/env bash
# Integration test: backup/restore against PostgreSQL 16 via migrate image pg_dump 16.
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

if ! command -v docker >/dev/null 2>&1; then
  echo "SKIP: docker not available"
  exit 0
fi

CONTAINER="flower-backup-itest-$$"
PGPORT="55434"
PGPASSWORD="backup_test_secret"
MIGRATE_IMAGE="flower-erp-migrate:backup-itest-$$"
WORKDIR=""

cleanup() {
  docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true
  docker rmi "${MIGRATE_IMAGE}" >/dev/null 2>&1 || true
  [[ -n "${WORKDIR}" && -d "${WORKDIR}" ]] && rm -rf "${WORKDIR}"
}
trap cleanup EXIT

docker run -d --name "${CONTAINER}" \
  -p "127.0.0.1:${PGPORT}:5432" \
  -e POSTGRES_PASSWORD="${PGPASSWORD}" \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_DB=postgres \
  postgres:16-alpine >/dev/null

for _ in $(seq 1 40); do
  docker exec "${CONTAINER}" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done

docker exec -i "${CONTAINER}" psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'EOSQL'
CREATE ROLE flower_migrate LOGIN PASSWORD 'migrate';
CREATE DATABASE flower_erp OWNER flower_migrate;
CREATE DATABASE flower_erp_restore OWNER flower_migrate;
EOSQL

export DATABASE_MIGRATE_URL="postgresql://flower_migrate:migrate@127.0.0.1:${PGPORT}/flower_erp?schema=public"
export DEPLOY_ROOT
WORKDIR="$(mktemp -d)"

cat > "${WORKDIR}/.env.production" <<EOF
COMPOSE_PROJECT_NAME=flower-backup-itest-$$
DATABASE_MIGRATE_URL=${DATABASE_MIGRATE_URL}
FLOWER_MIGRATE_IMAGE=${MIGRATE_IMAGE}
EOF
export ENV_FILE="${WORKDIR}/.env.production"
export COMPOSE_FILE="${SCRIPT_DIR}/fixtures/docker-compose.migrate-itest.yml"

# shellcheck source=../scripts/lib/common.sh
source "${SCRIPT_DIR}/../scripts/lib/common.sh"
# shellcheck source=../scripts/lib/compose.sh
source "${SCRIPT_DIR}/../scripts/lib/compose.sh"
# shellcheck source=../scripts/lib/database.sh
source "${SCRIPT_DIR}/../scripts/lib/database.sh"

pg_itest_handler() {
  psql "$(pg_prisma_url_for_psql "${DATABASE_MIGRATE_URL}")" "$@"
}
export PG_EXEC_TEST_HANDLER=pg_itest_handler
pg_load_env

deploy_compose_migrate build migrate >/dev/null

client_major="$(pg_client_major_version_migrate)"
[[ "${client_major}" == "16" ]] || {
  echo "FAIL: migrate image pg_dump major is ${client_major}, expected 16" >&2
  exit 1
}
echo "OK: migrate image pg_dump major ${client_major}"

deploy_compose_migrate run --rm migrate migrate deploy >/dev/null

docker exec -i "${CONTAINER}" psql -U flower_migrate -d flower_erp -v ON_ERROR_STOP=1 <<'EOSQL'
CREATE TABLE backup_marker (id int PRIMARY KEY, label text NOT NULL);
INSERT INTO backup_marker (id, label) VALUES (1, 'before-backup');
EOSQL

DUMP_FILE="${WORKDIR}/flower_erp_backup.dump"
db_stream_pg_dump_to_file "${DUMP_FILE}"
db_verify_pg_dump_file "${DUMP_FILE}"
echo "OK: backup created and verified"

deploy_compose_migrate run --rm --no-deps \
  -v "${DUMP_FILE}:/backup.dump:ro" \
  --entrypoint pg_restore migrate --list /backup.dump >/dev/null \
  || { echo "FAIL: pg_restore --list via migrate image" >&2; exit 1; }
echo "OK: pg_restore --list via migrate image"

docker exec -i "${CONTAINER}" psql -U flower_migrate -d flower_erp_restore -v ON_ERROR_STOP=1 <<'EOSQL'
CREATE TABLE backup_marker (id int PRIMARY KEY, label text NOT NULL);
INSERT INTO backup_marker (id, label) VALUES (1, 'stale');
EOSQL

deploy_compose_migrate run --rm --no-deps \
  -e "PGPASSWORD=migrate" \
  -v "${DUMP_FILE}:/backup.dump:ro" \
  --entrypoint sh migrate -c \
  'pg_restore -h 127.0.0.1 -p '"${PGPORT}"' -U flower_migrate -d flower_erp_restore --clean --if-exists --no-owner --no-privileges /backup.dump' \
  >/dev/null

label="$(docker exec "${CONTAINER}" psql -U flower_migrate -d flower_erp_restore -Atc \
  "SELECT label FROM backup_marker WHERE id = 1;")"
[[ "${label}" == "before-backup" ]] || {
  echo "FAIL: restore data mismatch (got '${label}')" >&2
  exit 1
}
echo "OK: pg_restore into PostgreSQL 16"

echo "OK: backup integration (pg_dump 16, verify, restore)"
