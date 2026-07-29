#!/usr/bin/env bash
# PostgreSQL helpers for deploy scripts (never print DATABASE_URL/passwords).

pg_run_sql() {
  local sql="$1"
  pg_psql -v ON_ERROR_STOP=1 -Atqc "${sql}"
}

pg_run_sql_file() {
  local file="$1"
  pg_psql -v ON_ERROR_STOP=1 -f "${file}"
}

pg_psql() {
  if [[ -n "${PG_EXEC_TEST_OUTPUT:-}" ]]; then
    # Test harness captures SQL via mocked pg_psql.
    printf '%s\n' "$*" >> "${PG_EXEC_TEST_OUTPUT}"
    return 0
  fi

  if [[ -n "${PG_EXEC_TEST_HANDLER:-}" ]]; then
    # shellcheck disable=SC2068
    "${PG_EXEC_TEST_HANDLER}" "$@"
    return $?
  fi

  if command -v psql >/dev/null 2>&1; then
    psql "${DATABASE_MIGRATE_URL}" "$@"
    return $?
  fi

  deploy_require_cmd docker
  : "${FLOWER_DB_HOST:?FLOWER_DB_HOST required for docker psql fallback}"
  : "${FLOWER_DB_PORT:?FLOWER_DB_PORT required}"
  : "${FLOWER_DB_NAME:?FLOWER_DB_NAME required}"

  local migrate_user migrate_password
  migrate_user="$(pg_parse_url_component user "${DATABASE_MIGRATE_URL}")"
  migrate_password="$(pg_parse_url_component password "${DATABASE_MIGRATE_URL}")"
  [[ -n "${migrate_user}" && -n "${migrate_password}" ]] \
    || deploy_die "Could not parse DATABASE_MIGRATE_URL for docker psql fallback."

  docker run --rm -i \
    --network "${PG_DOCKER_NETWORK:-leadflow_default}" \
    -e "PGPASSWORD=${migrate_password}" \
    postgres:16-alpine \
    psql -h "${FLOWER_DB_HOST}" -p "${FLOWER_DB_PORT}" -U "${migrate_user}" -d "${FLOWER_DB_NAME}" "$@"
}

pg_parse_url_component() {
  local component="$1" url="$2"
  node -e "
    const url = new URL(process.argv[1]);
    const key = process.argv[2];
    if (key === 'user') process.stdout.write(decodeURIComponent(url.username));
    else if (key === 'password') process.stdout.write(decodeURIComponent(url.password));
  " "${url}" "${component}" 2>/dev/null || true
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
