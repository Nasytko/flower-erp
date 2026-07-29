#!/usr/bin/env bash
# Prisma migrate helpers via migrate container (entrypoint: prisma "$@").

STAGE_C_FAILED_MIGRATION="20260729150000_remove_unused_enum_values"

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
      deploy_die "Unable to determine Prisma migration status (unrecognized prisma migrate status output)."
      ;;
  esac
}

prisma_resolve_applied() {
  local migration_name="$1"
  if prisma_run_migrate resolve --applied "${migration_name}"; then
    return 0
  fi
  deploy_die "prisma migrate resolve --applied failed for ${migration_name}."
}

prisma_migrate_deploy() {
  if prisma_run_migrate deploy; then
    return 0
  fi
  deploy_die "prisma migrate deploy failed after recovery."
}
