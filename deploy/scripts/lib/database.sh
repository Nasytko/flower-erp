#!/usr/bin/env bash
# PostgreSQL helpers via migrate container (never parse or log DATABASE_URL).

PG_MIGRATE_IMAGE_BUILT=0
PG_USING_DATABASE_URL_FALLBACK=0
PG_PSQL_CONNECTION_URL=""

# Remove Prisma-only `schema` query param; libpq/psql rejects it. Does not decode URL
# or extract credentials — only strips query segments named schema from the query string.
pg_prisma_url_for_psql() {
  local url="$1"
  local base query part result="" first=1

  case "${url}" in
    *[\?]*)
      base="${url%%\?*}"
      query="${url#*\?}"
      ;;
    *)
      printf '%s' "${url}"
      return 0
      ;;
  esac

  local IFS='&'
  read -r -a params <<< "${query}"
  for part in "${params[@]}"; do
    [[ "${part}" == schema=* ]] && continue
    [[ -z "${part}" ]] && continue
    if [[ "${first}" -eq 1 ]]; then
      result="${part}"
      first=0
    else
      result="${result}&${part}"
    fi
  done

  if [[ -z "${result}" ]]; then
    printf '%s' "${base}"
  else
    printf '%s?%s' "${base}" "${result}"
  fi
}

pg_psql_connection_url() {
  if [[ -z "${PG_PSQL_CONNECTION_URL}" ]]; then
    : "${DATABASE_MIGRATE_URL:?DATABASE_MIGRATE_URL is required}"
    PG_PSQL_CONNECTION_URL="$(pg_prisma_url_for_psql "${DATABASE_MIGRATE_URL}")"
  fi
  printf '%s' "${PG_PSQL_CONNECTION_URL}"
}

pg_load_env() {
  : "${DEPLOY_ROOT:?DEPLOY_ROOT required for pg_load_env}"
  deploy_common_init
  [[ -f "${ENV_FILE}" ]] || deploy_die "${ENV_FILE} not found."
  [[ -f "${COMPOSE_FILE}" ]] || deploy_die "${COMPOSE_FILE} not found."
  # shellcheck disable=SC1090
  set -a
  # shellcheck source=/dev/null
  source "${ENV_FILE}"
  set +a
  export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-flower-erp}"

  if [[ -n "${DATABASE_MIGRATE_URL:-}" ]]; then
    export DATABASE_URL="${DATABASE_MIGRATE_URL}"
  elif [[ -n "${DATABASE_URL:-}" ]]; then
    deploy_warn "DATABASE_MIGRATE_URL is not set; using DATABASE_URL fallback (verify DDL privileges)."
    export DATABASE_MIGRATE_URL="${DATABASE_URL}"
    PG_USING_DATABASE_URL_FALLBACK=1
  else
    deploy_die "DATABASE_MIGRATE_URL or DATABASE_URL is required."
  fi
  PG_PSQL_CONNECTION_URL=""
}

pg_assert_ddl_privileges() {
  if [[ "${PG_USING_DATABASE_URL_FALLBACK}" != "1" ]]; then
    return 0
  fi
  local can_create
  can_create="$(pg_run_sql "SELECT has_schema_privilege('public', 'CREATE');")"
  [[ "${can_create}" == "t" ]] \
    || deploy_die "DATABASE_URL fallback user lacks CREATE privilege on schema public."
}

pg_ensure_migrate_image() {
  if [[ "${PG_MIGRATE_IMAGE_BUILT}" == "1" ]]; then
    return 0
  fi
  deploy_compose_migrate build migrate >/dev/null
  PG_MIGRATE_IMAGE_BUILT=1
}

pg_assert_psql_in_migrate_image() {
  pg_ensure_migrate_image
  if ! deploy_compose_migrate run --rm --no-deps --entrypoint sh migrate \
    -c 'command -v psql >/dev/null 2>&1 && psql --version'; then
    deploy_die "psql is not available in migrate container (rebuild migrate image with postgresql-client)."
  fi
}

pg_psql_via_migrate() {
  local -a psql_args=("$@")
  local psql_url
  psql_url="$(pg_psql_connection_url)"
  local -a compose_args=(run --rm --no-deps -i -e "DATABASE_URL=${psql_url}" --entrypoint sh migrate)
  local file_path="" file_idx=-1 file_arg="" arg i=0

  pg_ensure_migrate_image

  while [[ $i -lt ${#psql_args[@]} ]]; do
    arg="${psql_args[$i]}"
    if [[ "${arg}" == "-f" && $((i + 1)) -lt ${#psql_args[@]} ]]; then
      file_arg="${psql_args[$((i + 1))]}"
      if [[ -f "${file_arg}" ]]; then
        file_path="$(cd "$(dirname "${file_arg}")" && pwd)/$(basename "${file_arg}")"
        file_idx=$i
      fi
      break
    fi
    i=$((i + 1))
  done

  if [[ -n "${file_path}" ]]; then
    local -a inner_args=()
    i=0
    while [[ $i -lt ${#psql_args[@]} ]]; do
      if [[ $i -eq $((file_idx + 1)) ]]; then
        inner_args+=("/tmp/pgexec.sql")
      elif [[ $i -ne "${file_idx}" ]]; then
        inner_args+=("${psql_args[$i]}")
      fi
      i=$((i + 1))
    done
    compose_args+=(-v "${file_path}:/tmp/pgexec.sql:ro")
    compose_args+=(-c 'psql "$DATABASE_URL" "$@"' _ "${inner_args[@]}")
  else
    compose_args+=(-c 'psql "$DATABASE_URL" "$@"' _ "${psql_args[@]}")
  fi

  deploy_compose_migrate "${compose_args[@]}"
}

pg_psql_via_explicit_container() {
  local container="${FLOWER_POSTGRES_CONTAINER:-}"
  [[ -n "${container}" ]] || return 1
  docker exec -i "${container}" psql "$(pg_psql_connection_url)" "$@"
}

pg_run_sql() {
  local sql="$1"
  pg_psql -X -A -t -P pager=off -v ON_ERROR_STOP=1 -c "${sql}"
}

pg_run_sql_file() {
  local file="$1"
  pg_psql -v ON_ERROR_STOP=1 -f "${file}"
}

pg_psql() {
  if [[ -n "${PG_EXEC_TEST_OUTPUT:-}" ]]; then
    printf '%s\n' "$*" >> "${PG_EXEC_TEST_OUTPUT}"
    return 0
  fi

  if [[ -n "${PG_EXEC_TEST_HANDLER:-}" ]]; then
    # shellcheck disable=SC2068
    "${PG_EXEC_TEST_HANDLER}" "$@"
    return $?
  fi

  deploy_require_cmd docker
  : "${DATABASE_MIGRATE_URL:?DATABASE_MIGRATE_URL is required (call pg_load_env first)}"

  if pg_psql_via_migrate "$@"; then
    return 0
  fi

  if [[ -n "${FLOWER_POSTGRES_CONTAINER:-}" ]]; then
    if pg_psql_via_explicit_container "$@"; then
      deploy_warn "Executed psql via FLOWER_POSTGRES_CONTAINER fallback."
      return 0
    fi
  fi

  deploy_die "Could not execute psql via migrate container. Rebuild migrate image and verify database connectivity."
}

pg_table_exists() {
  local table="$1"
  [[ "$(pg_run_sql "SELECT to_regclass('public.\"${table}\"') IS NOT NULL;")" == "t" ]]
}

pg_type_exists() {
  local type_name="$1"
  [[ "$(pg_run_sql "SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = '${type_name}');")" == "t" ]]
}

pg_enum_labels_csv() {
  local type_name="$1"
  pg_run_sql "
    SELECT COALESCE(string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder), '')
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = '${type_name}';
  "
}

pg_column_udt() {
  local table="$1" column="$2"
  pg_run_sql "
    SELECT COALESCE(c.udt_name, '')
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = '${table}'
      AND c.column_name = '${column}';
  "
}

pg_column_default() {
  local table="$1" column="$2"
  pg_run_sql "
    SELECT COALESCE(column_default, '')
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = '${table}'
      AND column_name = '${column}';
  "
}

pg_count_text_match() {
  local table="$1" column="$2" value="$3"
  pg_run_sql "SELECT COUNT(*)::text FROM \"${table}\" WHERE \"${column}\"::text = '${value}';"
}

pg_type_used_by_column() {
  local type_name="$1"
  [[ "$(pg_run_sql "
    SELECT EXISTS (
      SELECT 1
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_type t ON t.oid = a.atttypid
      WHERE n.nspname = 'public'
        AND NOT a.attisdropped
        AND a.attnum > 0
        AND t.typname = '${type_name}'
    );
  ")" == "t" ]]
}

pg_verify_connection() {
  pg_assert_psql_in_migrate_image
  pg_psql -v ON_ERROR_STOP=1 -c "SELECT 1;" >/dev/null \
    || deploy_die "Database is not reachable via migrate container."
}

# Extract major version from `SHOW server_version` or `pg_dump (PostgreSQL) 16.x`.
pg_parse_major_version() {
  local line
  IFS= read -r line || true
  if [[ "${line}" =~ ([0-9]+)\. ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
  fi
}

pg_server_major_version() {
  pg_run_sql "SHOW server_version;" | pg_parse_major_version
}

pg_client_major_version_migrate() {
  pg_ensure_migrate_image
  deploy_compose_migrate run --rm --no-deps --entrypoint sh migrate \
    -c 'pg_dump --version' | pg_parse_major_version
}

pg_client_major_version_host() {
  command -v pg_dump >/dev/null 2>&1 || return 1
  pg_dump --version | pg_parse_major_version
}

pg_server_major_version_host() {
  : "${FLOWER_DB_HOST:?FLOWER_DB_HOST required}"
  : "${FLOWER_DB_PORT:?FLOWER_DB_PORT required}"
  : "${FLOWER_DB_USER:?FLOWER_DB_USER required}"
  : "${FLOWER_DB_PASSWORD:?FLOWER_DB_PASSWORD required}"
  : "${FLOWER_DB_NAME:?FLOWER_DB_NAME required}"
  PGPASSWORD="${FLOWER_DB_PASSWORD}" psql \
    -h "${FLOWER_DB_HOST}" \
    -p "${FLOWER_DB_PORT}" \
    -U "${FLOWER_DB_USER}" \
    -d "${FLOWER_DB_NAME}" \
    -X -A -t -P pager=off -v ON_ERROR_STOP=1 \
    -c "SHOW server_version;" | pg_parse_major_version
}

pg_assert_pg_dump_version_compatible() {
  local server_major client_major

  if command -v pg_dump >/dev/null 2>&1 \
    && [[ -n "${FLOWER_DB_HOST:-}" && -n "${FLOWER_DB_PORT:-}" \
      && -n "${FLOWER_DB_USER:-}" && -n "${FLOWER_DB_PASSWORD:-}" ]]; then
    server_major="$(pg_server_major_version_host)"
    client_major="$(pg_client_major_version_host)"
  else
    pg_verify_connection
    server_major="$(pg_server_major_version)"
    client_major="$(pg_client_major_version_migrate)"
  fi

  [[ -n "${server_major}" && -n "${client_major}" ]] \
    || deploy_die "Could not detect PostgreSQL server/client major versions for backup."

  if [[ "${client_major}" -lt "${server_major}" ]]; then
    deploy_die "pg_dump major version ${client_major} is older than PostgreSQL server ${server_major}. Rebuild migrate image with postgresql-client-${server_major} (apt.postgresql.org) or upgrade host pg_dump."
  fi

  deploy_log "pg_dump version OK (client ${client_major}, server ${server_major})"
}

db_pg_restore_list() {
  local file="$1"
  local abs_dir abs_file

  abs_dir="$(cd "$(dirname "${file}")" && pwd)"
  abs_file="${abs_dir}/$(basename "${file}")"

  if command -v pg_restore >/dev/null 2>&1; then
    if pg_restore --list "${abs_file}" >/dev/null 2>&1; then
      return 0
    fi
  fi

  pg_ensure_migrate_image
  deploy_compose_migrate run --rm --no-deps \
    -v "${abs_file}:/backup.dump:ro" \
    --entrypoint pg_restore migrate --list /backup.dump >/dev/null
}

pg_run_pg_dump() {
  local output_file="$1"
  db_stream_pg_dump_to_file "${output_file}"
}

# Stream custom-format pg_dump to a host file (stderr separate from binary stdout).
db_stream_pg_dump_to_file() {
  local output_file="$1"
  local partial err_file psql_url backup_dir

  [[ -n "${output_file}" ]] || deploy_die "db_stream_pg_dump_to_file: output file required."
  backup_dir="$(cd "$(dirname "${output_file}")" && pwd)"
  mkdir -p "${backup_dir}"
  partial="${backup_dir}/.partial.$(basename "${output_file}").$$"
  err_file="${partial}.err"

  pg_assert_pg_dump_version_compatible

  if command -v pg_dump >/dev/null 2>&1 \
    && [[ -n "${FLOWER_DB_HOST:-}" && -n "${FLOWER_DB_PORT:-}" \
      && -n "${FLOWER_DB_USER:-}" && -n "${FLOWER_DB_PASSWORD:-}" ]]; then
    PGPASSWORD="${FLOWER_DB_PASSWORD}" pg_dump \
      -h "${FLOWER_DB_HOST}" \
      -p "${FLOWER_DB_PORT}" \
      -U "${FLOWER_DB_USER}" \
      -d "${FLOWER_DB_NAME:-flower_erp}" \
      -Fc --no-owner --no-privileges > "${partial}" 2>"${err_file}" \
      || deploy_die "pg_dump failed (see ${err_file})."
  else
    deploy_require_cmd docker
    pg_ensure_migrate_image
    psql_url="$(pg_psql_connection_url)"
    if ! deploy_compose_migrate run --rm --no-deps --entrypoint sh migrate \
      -c 'command -v pg_dump >/dev/null 2>&1'; then
      deploy_die "pg_dump is not available in migrate container."
    fi
    deploy_compose_migrate run --rm --no-deps \
      -e "DATABASE_URL=${psql_url}" \
      --entrypoint sh migrate \
      -c 'pg_dump "$DATABASE_URL" -Fc --no-owner --no-privileges' > "${partial}" 2>"${err_file}" \
      || deploy_die "pg_dump via migrate container failed (see ${err_file})."
  fi

  db_verify_pg_dump_file "${partial}"
  mv -f "${partial}" "${output_file}"
  chmod 600 "${output_file}" 2>/dev/null || true
  rm -f "${err_file}"
}

db_verify_pg_dump_file() {
  local file="$1"
  deploy_verify_nonempty_file "${file}"
  [[ "$(head -c 5 "${file}" 2>/dev/null || true)" == "PGDMP" ]] \
    || deploy_die "Backup file is not a valid pg_dump custom archive (missing PGDMP magic): ${file}"
  db_pg_restore_list "${file}" \
    || deploy_die "pg_restore --list rejected backup file: ${file}"
}

# --- Prisma migrate helpers (entrypoint: prisma "$@") ---

PRISMA_MIGRATE_STATUS_OUTPUT=""
PRISMA_MIGRATE_STATUS_CLASS=""

prisma_compose_cmd_hint() {
  printf 'docker compose -f %q --env-file %q --profile migrate run --rm migrate migrate' \
    "${COMPOSE_FILE}" "${ENV_FILE}"
}

prisma_run_migrate() {
  local tmp exit_code
  tmp="$(mktemp "${TMPDIR:-/tmp}/flower-prisma.XXXXXX")"
  if deploy_compose_migrate run --rm migrate migrate "$@" >"${tmp}" 2>&1; then
    exit_code=0
  else
    exit_code=$?
  fi
  PRISMA_MIGRATE_LAST_OUTPUT="$(cat "${tmp}")"
  rm -f "${tmp}"
  return "${exit_code}"
}

prisma_classify_status_output() {
  local output="$1" exit_code="$2"

  if [[ -z "${output}" && "${exit_code}" -ne 0 ]]; then
    printf 'connection_error'
    return 0
  fi
  if printf '%s' "${output}" | grep -q 'Unknown command'; then
    printf 'cli_error'
    return 0
  fi
  if printf '%s' "${output}" | grep -qiE 'P1001|Can.t reach database|ECONNREFUSED|Connection refused|timeout'; then
    printf 'connection_error'
    return 0
  fi
  if printf '%s' "${output}" | grep -qi 'following migration.*have failed'; then
    printf 'failed'
    return 0
  fi
  if printf '%s' "${output}" | grep -qi 'not yet been applied'; then
    printf 'pending'
    return 0
  fi
  if printf '%s' "${output}" | grep -qi 'Database schema is up to date'; then
    printf 'up_to_date'
    return 0
  fi
  if [[ "${exit_code}" -eq 0 ]]; then
    printf 'up_to_date'
    return 0
  fi
  if printf '%s' "${output}" | grep -qiE 'Prisma schema|Datasource|migration|Database schema'; then
    if printf '%s' "${output}" | grep -qi 'failed'; then
      printf 'failed'
    elif printf '%s' "${output}" | grep -qi 'not yet been applied'; then
      printf 'pending'
    else
      printf 'unknown'
    fi
    return 0
  fi
  printf 'connection_error'
}

prisma_refresh_migrate_status() {
  local exit_code
  if prisma_run_migrate status; then
    exit_code=0
  else
    exit_code=$?
  fi
  PRISMA_MIGRATE_STATUS_OUTPUT="${PRISMA_MIGRATE_LAST_OUTPUT}"
  PRISMA_MIGRATE_STATUS_CLASS="$(prisma_classify_status_output "${PRISMA_MIGRATE_STATUS_OUTPUT}" "${exit_code}")"
}

prisma_invalidate_status_cache() {
  PRISMA_MIGRATE_STATUS_OUTPUT=""
  PRISMA_MIGRATE_STATUS_CLASS=""
}

prisma_extract_migration_names() {
  local section_header="$1" output="$2"
  printf '%s\n' "${output}" | awk -v header="${section_header}" '
    BEGIN { IGNORECASE = 1 }
    $0 ~ header { in_section = 1; next }
    in_section && /^[0-9]{14}_[a-zA-Z0-9_]+$/ { print }
    in_section && /^[[:space:]]*$/ { in_section = 0 }
  '
}

prisma_failed_migration_names() {
  prisma_extract_migration_names 'have failed' "${PRISMA_MIGRATE_STATUS_OUTPUT}"
}

prisma_pending_migration_names() {
  prisma_extract_migration_names 'not yet been applied' "${PRISMA_MIGRATE_STATUS_OUTPUT}"
}

prisma_assert_status_readable() {
  prisma_refresh_migrate_status
  case "${PRISMA_MIGRATE_STATUS_CLASS}" in
    connection_error)
      deploy_die "Unable to determine Prisma migration status (database connection failed)."
      ;;
    cli_error)
      deploy_die "Prisma CLI rejected migrate status (check migrate container entrypoint)."
      ;;
    unknown)
      deploy_die "Unable to determine Prisma migration status (unrecognized output)."
      ;;
  esac
}

prisma_assert_no_failed_migrations() {
  if [[ "${PRISMA_MIGRATE_STATUS_CLASS}" == "failed" ]]; then
    local failed_names
    failed_names="$(prisma_failed_migration_names)"
    cat >&2 <<EOF
ERROR: Prisma found failed migration(s). Deploy is blocked (P3009).

Failed migration(s):
${failed_names:-unknown}

Resolve with prisma migrate resolve, then redeploy.
Example:
  $(prisma_compose_cmd_hint) resolve --rolled-back "MIGRATION_NAME"
EOF
    exit 1
  fi
}

prisma_migrate_deploy() {
  deploy_log "Running prisma migrate deploy..."
  if prisma_run_migrate deploy; then
    deploy_log "Migrations applied successfully."
    return 0
  fi
  deploy_warn "Prisma migrate deploy failed:"
  printf '%s\n' "${PRISMA_MIGRATE_LAST_OUTPUT}" >&2
  deploy_die "Database migrations failed. Runtime containers were not updated."
}
