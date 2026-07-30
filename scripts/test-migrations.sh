#!/usr/bin/env bash
# Ephemeral PostgreSQL migration tests (clean + optional upgrade/negative from migration.test.json).
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

PG_IMAGE="${PG_IMAGE:-postgres:16-alpine}"
PG_PORT="${PG_PORT:-55432}"
MIGRATIONS_DIR="${ROOT}/apps/api/prisma/migrations"

CONTAINER=""
HOLD_DIR=""
DATABASE_URL=""
TARGET_MIGRATION=""
TARGET_PATH=""
TARGET_META=""
BASELINE_FIXTURE=""
NEGATIVE_FIXTURE=""

log() { printf '==> %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

cleanup() {
  if [[ -n "${HOLD_DIR}" && -n "${TARGET_MIGRATION}" && -d "${HOLD_DIR}/${TARGET_MIGRATION}" ]]; then
    mv "${HOLD_DIR}/${TARGET_MIGRATION}" "${MIGRATIONS_DIR}/" 2>/dev/null || true
  fi
  [[ -n "${HOLD_DIR}" ]] && rmdir "${HOLD_DIR}" 2>/dev/null || true
  [[ -n "${CONTAINER}" ]] && docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

resolve_target_migration() {
  local dir name latest=""
  if [[ -n "${TARGET_MIGRATION:-}" ]]; then
    printf '%s' "${TARGET_MIGRATION}"
    return 0
  fi
  for dir in "${MIGRATIONS_DIR}"/*/; do
    [[ -f "${dir}migration.test.json" ]] || continue
    name="$(basename "${dir}")"
    if [[ -z "${latest}" || "${name}" > "${latest}" ]]; then
      latest="${name}"
    fi
  done
  printf '%s' "${latest}"
}

load_target_meta() {
  local field="$1"
  [[ -n "${TARGET_META}" ]] || return 1
  node -e "
    const meta = JSON.parse(process.argv[1]);
    const field = process.argv[2];
    const value = meta[field];
    if (value === undefined) process.exit(1);
    if (Array.isArray(value)) {
      value.forEach((item) => {
        console.log(typeof item === 'object' ? JSON.stringify(item) : String(item));
      });
      process.exit(0);
    }
    if (typeof value === 'object') {
      console.log(JSON.stringify(value));
      process.exit(0);
    }
    console.log(String(value));
  " "${TARGET_META}" "${field}"
}

meta_has_upgrade_tests() {
  [[ -n "${TARGET_META}" && -n "${BASELINE_FIXTURE}" && -f "${BASELINE_FIXTURE}" ]]
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
  [[ -n "${HOLD_DIR}" && -n "${TARGET_MIGRATION}" && -d "${HOLD_DIR}/${TARGET_MIGRATION}" ]] || return 0
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

assert_tables_dropped() {
  local table table_exists
  while IFS= read -r table; do
    [[ -n "${table}" ]] || continue
    table_exists="$(psql_query "SELECT to_regclass('public.${table}') IS NOT NULL;")"
    [[ "${table_exists}" == "f" ]] || die "Table ${table} should be dropped after migration"
  done < <(load_target_meta tablesDropped 2>/dev/null || true)
}

assert_enum_columns() {
  local column table col enum_type default_value default_type default_expr
  [[ -n "${TARGET_META}" ]] || return 0
  while IFS= read -r column; do
    [[ -n "${column}" ]] || continue
    table="$(node -e "console.log(JSON.parse(process.argv[1]).table)" "${column}")"
    col="$(node -e "console.log(JSON.parse(process.argv[1]).column)" "${column}")"
    enum_type="$(node -e "console.log(JSON.parse(process.argv[1]).enumType)" "${column}")"
    default_value="$(node -e "console.log(JSON.parse(process.argv[1]).defaultValue || '')" "${column}")"
    default_type="$(psql_query "SELECT pg_catalog.format_type(a.atttypid, a.atttypmod) FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid = a.attrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = '${table}' AND a.attname = '${col}' AND a.attnum > 0 AND NOT a.attisdropped;")"
    grep -q "${enum_type}" <<<"${default_type}" || die "${table}.${col} type mismatch: ${default_type}"
    if [[ -n "${default_value}" ]]; then
      default_expr="$(psql_query "SELECT pg_get_expr(adbin, adrelid) FROM pg_attrdef JOIN pg_attribute ON pg_attrdef.adrelid = pg_attribute.attrelid AND pg_attrdef.adnum = pg_attribute.attnum JOIN pg_class ON pg_class.oid = pg_attribute.attrelid WHERE pg_class.relname = '${table}' AND pg_attribute.attname = '${col}';")"
      grep -q "${default_value}" <<<"${default_expr}" || die "${table}.${col} default missing: ${default_expr}"
    fi
  done < <(load_target_meta enumColumns 2>/dev/null || true)
}

test_clean_database() {
  log "TEST A — clean database (port ${PG_PORT})"
  start_postgres "${PG_PORT}"
  pnpm db:generate >/dev/null
  prisma migrate deploy
  prisma migrate status
  pnpm prisma:validate
  assert_no_failed_migrations
  if [[ -n "${TARGET_META}" ]]; then
    assert_tables_dropped
    assert_enum_columns
  fi
  stop_postgres
  log "TEST A passed"
}

test_upgrade_database() {
  local port=$((PG_PORT + 1))
  if ! meta_has_upgrade_tests; then
    log "TEST B — skipped (no migration.test.json with baselineFixture)"
    return 0
  fi
  log "TEST B — upgrade database (port ${port}, target ${TARGET_MIGRATION})"
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
  assert_tables_dropped
  assert_enum_columns
  stop_postgres
  log "TEST B passed"
}

test_negative_guard() {
  local port=$((PG_PORT + 2))
  local guard_pattern
  if ! meta_has_upgrade_tests || [[ -z "${NEGATIVE_FIXTURE}" || ! -f "${NEGATIVE_FIXTURE}" ]]; then
    log "TEST C — skipped (no negativeFixture in migration.test.json)"
    return 0
  fi
  guard_pattern="$(load_target_meta negativeGuardPattern 2>/dev/null || printf 'DATA GUARD')"
  log "TEST C — negative enum guard (port ${port}, target ${TARGET_MIGRATION})"
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
  grep -qi "${guard_pattern}" /tmp/flower-migration-negative.log \
    || die "Expected ${guard_pattern} error in migration output"
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

  TARGET_MIGRATION="$(resolve_target_migration)"
  if [[ -n "${TARGET_MIGRATION}" ]]; then
    TARGET_PATH="${MIGRATIONS_DIR}/${TARGET_MIGRATION}"
    [[ -f "${TARGET_PATH}/migration.sql" ]] || die "Missing migration.sql for ${TARGET_MIGRATION}"
    if [[ -f "${TARGET_PATH}/migration.test.json" ]]; then
      TARGET_META="$(cat "${TARGET_PATH}/migration.test.json")"
      BASELINE_FIXTURE="${ROOT}/$(load_target_meta baselineFixture)"
      NEGATIVE_FIXTURE="${ROOT}/$(load_target_meta negativeFixture 2>/dev/null || true)"
      log "Using migration test metadata: ${TARGET_MIGRATION}"
    else
      log "No migration.test.json for ${TARGET_MIGRATION}; running generic clean deploy test only"
    fi
  else
    log "No migration.test.json found; running generic clean deploy test only"
  fi

  test_clean_database
  test_upgrade_database
  test_negative_guard
  log "All migration tests passed"
}

main "$@"
