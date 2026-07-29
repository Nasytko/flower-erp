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
