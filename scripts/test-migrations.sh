#!/usr/bin/env bash
# Ephemeral PostgreSQL migration tests (clean + upgrade + negative guard).
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

PG_IMAGE="${PG_IMAGE:-postgres:16-alpine}"
PG_PORT="${PG_PORT:-55432}"
TARGET_MIGRATION="${TARGET_MIGRATION:-20260730120000_remove_transfers_counts_cash}"
MIGRATIONS_DIR="${ROOT}/apps/api/prisma/migrations"
TARGET_PATH="${MIGRATIONS_DIR}/${TARGET_MIGRATION}"
BASELINE_FIXTURE="${ROOT}/scripts/test-fixtures/migration-upgrade-baseline.sql"
NEGATIVE_FIXTURE="${ROOT}/scripts/test-fixtures/migration-negative-enum-row.sql"

CONTAINER=""
HOLD_DIR=""
DATABASE_URL=""

log() { printf '==> %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

cleanup() {
  if [[ -n "${HOLD_DIR}" && -d "${HOLD_DIR}/${TARGET_MIGRATION}" ]]; then
    mv "${HOLD_DIR}/${TARGET_MIGRATION}" "${MIGRATIONS_DIR}/" 2>/dev/null || true
  fi
  [[ -n "${HOLD_DIR}" ]] && rmdir "${HOLD_DIR}" 2>/dev/null || true
  [[ -n "${CONTAINER}" ]] && docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

start_postgres() {
  local port="$1"
  CONTAINER="flower-migration-test-${RANDOM}"
  DATABASE_URL="postgresql://flower:flower@127.0.0.1:${port}/flower_erp?schema=public"
  docker run -d --name "${CONTAINER}" \
    -e POSTGRES_USER=flower \
    -e POSTGRES_PASSWORD=flower \
    -e POSTGRES_DB=flower_erp \
    -p "${port}:5432" \
    "${PG_IMAGE}" >/dev/null
  local i
  for i in $(seq 1 40); do
    if docker exec "${CONTAINER}" pg_isready -U flower -d flower_erp >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  die "PostgreSQL container did not become ready"
}

stop_postgres() {
  [[ -n "${CONTAINER}" ]] && docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true
  CONTAINER=""
}

prisma() {
  DATABASE_URL="${DATABASE_URL}" DATABASE_MIGRATE_URL="${DATABASE_URL}" \
    node scripts/prisma-with-migrate-url.mjs "$@"
}

psql_file() {
  docker exec -i "${CONTAINER}" psql -U flower -d flower_erp -v ON_ERROR_STOP=1 < "$1"
}

psql_query() {
  docker exec "${CONTAINER}" psql -U flower -d flower_erp -tAc "$1" | tr -d '\r'
}

hide_target_migration() {
  [[ -d "${TARGET_PATH}" ]] || die "Target migration not found: ${TARGET_PATH}"
  HOLD_DIR="$(mktemp -d)"
  mv "${TARGET_PATH}" "${HOLD_DIR}/"
}

restore_target_migration() {
  [[ -n "${HOLD_DIR}" && -d "${HOLD_DIR}/${TARGET_MIGRATION}" ]] || return 0
  mv "${HOLD_DIR}/${TARGET_MIGRATION}" "${MIGRATIONS_DIR}/"
  rmdir "${HOLD_DIR}" 2>/dev/null || true
  HOLD_DIR=""
}

assert_no_failed_migrations() {
  local status
  status="$(prisma migrate status 2>&1 || true)"
  if grep -qi 'failed' <<<"${status}"; then
    printf '%s\n' "${status}" >&2
    die "Prisma reported failed migrations"
  fi
}

test_clean_database() {
  log "TEST A — clean database (port ${PG_PORT})"
  start_postgres "${PG_PORT}"
  pnpm db:generate >/dev/null
  prisma migrate deploy
  prisma migrate status
  pnpm prisma:validate
  assert_no_failed_migrations
  local table_exists
  table_exists="$(psql_query "SELECT to_regclass('public.transfer_documents') IS NOT NULL;")"
  [[ "${table_exists}" == "f" ]] || die "transfer_documents should be dropped after clean deploy"
  stop_postgres
  log "TEST A passed"
}

test_upgrade_database() {
  local port=$((PG_PORT + 1))
  log "TEST B — upgrade database (port ${port})"
  hide_target_migration
  start_postgres "${port}"
  pnpm db:generate >/dev/null
  prisma migrate deploy
  psql_file "${BASELINE_FIXTURE}"
  local batch_count
  batch_count="$(psql_query "SELECT COUNT(*) FROM inventory_batches WHERE id = '20202020-2020-4202-8202-202020202020';")"
  [[ "${batch_count}" == "1" ]] || die "Baseline batch missing before upgrade migration"
  restore_target_migration
  prisma migrate deploy
  assert_no_failed_migrations
  batch_count="$(psql_query "SELECT COUNT(*) FROM inventory_batches WHERE id = '20202020-2020-4202-8202-202020202020';")"
  [[ "${batch_count}" == "1" ]] || die "Baseline batch missing after upgrade migration"
  local default_type
  default_type="$(psql_query "SELECT pg_catalog.format_type(a.atttypid, a.atttypmod) FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid = a.attrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'inventory_batches' AND a.attname = 'batch_source_type' AND a.attnum > 0 AND NOT a.attisdropped;")"
  grep -q 'InventoryBatchSourceType' <<<"${default_type}" || die "batch_source_type type mismatch: ${default_type}"
  local default_expr
  default_expr="$(psql_query "SELECT pg_get_expr(adbin, adrelid) FROM pg_attrdef JOIN pg_attribute ON pg_attrdef.adrelid = pg_attribute.attrelid AND pg_attrdef.adnum = pg_attribute.attnum JOIN pg_class ON pg_class.oid = pg_attribute.attrelid WHERE pg_class.relname = 'inventory_batches' AND pg_attribute.attname = 'batch_source_type';")"
  grep -q "GOODS_RECEIPT" <<<"${default_expr}" || die "batch_source_type default missing: ${default_expr}"
  table_exists="$(psql_query "SELECT to_regclass('public.transfer_documents') IS NOT NULL;")"
  [[ "${table_exists}" == "f" ]] || die "transfer_documents should be dropped after upgrade"
  stop_postgres
  log "TEST B passed"
}

test_negative_guard() {
  local port=$((PG_PORT + 2))
  log "TEST C — negative enum guard (port ${port})"
  hide_target_migration
  start_postgres "${port}"
  pnpm db:generate >/dev/null
  prisma migrate deploy
  psql_file "${BASELINE_FIXTURE}"
  psql_file "${NEGATIVE_FIXTURE}"
  restore_target_migration
  set +e
  prisma migrate deploy > /tmp/flower-migration-negative.log 2>&1
  local exit_code=$?
  set -e
  [[ "${exit_code}" -ne 0 ]] || die "Migration should fail when removed enum value remains"
  grep -qi 'DATA GUARD' /tmp/flower-migration-negative.log || die "Expected DATA GUARD error in migration output"
  local orphan_new_type
  orphan_new_type="$(psql_query "SELECT COUNT(*) FROM pg_type WHERE typname LIKE '%_new';")"
  [[ "${orphan_new_type}" == "0" ]] || die "Partial *_new enum types left after failed migration"
  psql_query "DELETE FROM inventory_batches WHERE id = '60606060-6060-4606-8606-606060606060';" >/dev/null
  prisma migrate deploy
  assert_no_failed_migrations
  stop_postgres
  log "TEST C passed"
}

main() {
  require_cmd docker
  require_cmd node
  require_cmd pnpm
  [[ -f "${TARGET_PATH}/migration.sql" || -n "${HOLD_DIR}" ]] || die "Missing target migration"
  [[ -f "${BASELINE_FIXTURE}" ]] || die "Missing baseline fixture"
  [[ -f "${NEGATIVE_FIXTURE}" ]] || die "Missing negative fixture"

  test_clean_database
  test_upgrade_database
  test_negative_guard
  log "All migration tests passed"
}

main "$@"
