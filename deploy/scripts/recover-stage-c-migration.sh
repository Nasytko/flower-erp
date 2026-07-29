#!/usr/bin/env bash
# Flower ERP — automated recovery for failed Stage C enum migration.
# Marks 20260729150000_remove_unused_enum_values as applied after schema repair.
#
# Usage (on production VPS after git pull):
#   ./deploy/scripts/recover-stage-c-migration.sh
#
# Does NOT restart application containers. Run ./deploy/scripts/deploy.sh after success.

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# shellcheck source=lib/deploy-common.sh
source "${SCRIPT_DIR}/lib/deploy-common.sh"
# shellcheck source=lib/pg-exec.sh
source "${SCRIPT_DIR}/lib/pg-exec.sh"
# shellcheck source=lib/prisma-migrate.sh
source "${SCRIPT_DIR}/lib/prisma-migrate.sh"
# shellcheck source=lib/recover-stage-c-lib.sh
source "${SCRIPT_DIR}/lib/recover-stage-c-lib.sh"

ON_ERROR_HANDLED=0

recover_on_error() {
  local exit_code=$?
  if [[ "${ON_ERROR_HANDLED}" -eq 1 ]]; then
    exit "${exit_code}"
  fi
  ON_ERROR_HANDLED=1
  printf '\nERROR: recovery failed (exit %s).\n' "${exit_code}" >&2
  if [[ -n "${RECOVER_LOG_DIR:-}" && -d "${RECOVER_LOG_DIR}" ]]; then
    printf 'Diagnostic log directory: %s\n' "${RECOVER_LOG_DIR}" >&2
  fi
  cat >&2 <<'EOF'
Rollback (manual, if recovery modified the database):
  ./deploy/scripts/restore-db.sh /opt/flower-erp/backups/flower_erp_YYYYMMDDTHHMMSSZ.dump
EOF
  exit "${exit_code}"
}

trap recover_on_error ERR

recover_create_snapshot() {
  local timestamp="$1"
  RECOVER_LOG_DIR="${DEPLOY_ROOT}/backups/recovery-stage-c-${timestamp}"
  mkdir -p "${RECOVER_LOG_DIR}"
  recover_log_diag "Recovery snapshot directory: ${RECOVER_LOG_DIR}"

  deploy_log "Creating full database backup..."
  "${SCRIPT_DIR}/backup-db.sh"

  local latest_full
  latest_full="$(ls -t "${DEPLOY_ROOT}/backups/"*.dump 2>/dev/null | head -1 || true)"
  deploy_verify_nonempty_file "${latest_full}"
  deploy_write_checksum "${latest_full}" "${RECOVER_LOG_DIR}/full-backup.sha256"
  ln -sf "${latest_full}" "${RECOVER_LOG_DIR}/full-backup.dump"
  recover_save_diag_file "full-backup.path" "${latest_full}"

  recover_log_diag "Saving schema diagnostics..."
  recover_query_migration_rows > "${RECOVER_LOG_DIR}/prisma-migrations.txt"
  pg_psql -v ON_ERROR_STOP=1 -c "
    SELECT t.typname, string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS labels
    FROM pg_type t
    LEFT JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname IN (
      'PaymentMethodType', 'PaymentMethodType_new',
      'SalesChannel', 'SalesChannel_new'
    )
    GROUP BY t.typname
    ORDER BY t.typname;
  " > "${RECOVER_LOG_DIR}/enum-definitions.txt"

  pg_psql -v ON_ERROR_STOP=1 -c "
    SELECT table_name, column_name, udt_name, column_default, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        (table_name = 'payment_methods' AND column_name = 'type')
        OR (table_name = 'sales' AND column_name = 'sales_channel')
      )
    ORDER BY table_name, column_name;
  " > "${RECOVER_LOG_DIR}/column-bindings.txt"

  pg_run_sql "SELECT COUNT(*)::text FROM payment_methods;" > "${RECOVER_LOG_DIR}/count-payment_methods.txt"
  pg_run_sql "SELECT COUNT(*)::text FROM sales;" > "${RECOVER_LOG_DIR}/count-sales.txt"
  pg_run_sql "SELECT COUNT(*)::text FROM payment_methods WHERE type::text = 'GIFT_CERTIFICATE';" \
    > "${RECOVER_LOG_DIR}/count-gift-certificate.txt"
  pg_run_sql "SELECT COUNT(*)::text FROM sales WHERE sales_channel::text = 'TELEGRAM';" \
    > "${RECOVER_LOG_DIR}/count-telegram.txt"

  deploy_write_checksum "${RECOVER_LOG_DIR}/prisma-migrations.txt" "${RECOVER_LOG_DIR}/prisma-migrations.sha256"
}

recover_validate_preconditions() {
  deploy_check_docker
  deploy_common_init
  deploy_load_env
  deploy_check_git_clean

  deploy_compose_migrate build migrate >/dev/null

  pg_psql -v ON_ERROR_STOP=1 -c "SELECT 1;" >/dev/null \
    || deploy_die "Database is not reachable via DATABASE_MIGRATE_URL."

  recover_collect_schema_state

  if [[ "${RECOVER_HAS_SUCCESS}" == "true" ]]; then
    recover_log_diag "Migration already applied successfully."
    recover_assert_final_invariants
    recover_verify_no_removed_enum_values
    prisma_refresh_migrate_status
    prisma_assert_status_readable
    if [[ "${PRISMA_MIGRATE_STATUS_CLASS}" == "failed" ]]; then
      deploy_die "Migration schema is correct but Prisma still reports failed state. Run prisma migrate resolve --applied manually or contact support."
    fi
    deploy_log "Recovery already completed. No changes required."
    exit 0
  fi

  if [[ "${RECOVER_HAS_FAILED}" != "true" ]]; then
    prisma_refresh_migrate_status
    prisma_assert_status_readable
    if [[ "${PRISMA_MIGRATE_STATUS_CLASS}" == "failed" ]] \
      && printf '%s\n' "$(prisma_failed_migration_names)" | grep -q "${RECOVER_MIGRATION_NAME}"; then
      RECOVER_HAS_FAILED="true"
    else
      deploy_die "Migration ${RECOVER_MIGRATION_NAME} is neither applied nor failed. Aborting without changes."
    fi
  fi
}

recover_run_repair() {
  local repair_sql repair_log
  recover_assert_data_safety_gate
  recover_detect_state
  recover_log_diag "Detected recovery state: ${RECOVER_STATE}"

  case "${RECOVER_STATE}" in
    D)
      recover_log_diag "Target schema already reached; skipping DDL."
      return 0
      ;;
    UNEXPECTED)
      deploy_die "Unexpected schema state (pm=${RECOVER_PM_UDT}, sc=${RECOVER_SC_UDT}, pm_new=${RECOVER_PM_NEW_EXISTS}, sc_new=${RECOVER_SC_NEW_EXISTS}). See ${RECOVER_LOG_DIR}/enum-definitions.txt"
      ;;
  esac

  repair_sql="${RECOVER_LOG_DIR}/repair.sql"
  recover_select_repair_sql_writer "${repair_sql}"
  recover_save_diag_file "repair.sql" "$(cat "${repair_sql}")"
  recover_log_diag "Applying recovery DDL in a single transaction..."
  repair_log="${RECOVER_LOG_DIR}/repair-output.txt"
  if pg_run_sql_file "${repair_sql}" > "${repair_log}" 2>&1; then
    recover_log_diag "Recovery DDL committed successfully."
  else
    cat "${repair_log}" >&2
    deploy_die "Recovery DDL failed (transaction rolled back)."
  fi
}

recover_finalize_prisma() {
  recover_assert_final_invariants
  recover_verify_no_removed_enum_values

  recover_log_diag "Marking migration as applied via prisma migrate resolve..."
  prisma_resolve_applied "${RECOVER_MIGRATION_NAME}"

  recover_query_migration_rows > "${RECOVER_LOG_DIR}/prisma-migrations-after-resolve.txt"

  recover_log_diag "Verifying prisma migrate deploy..."
  prisma_invalidate_status_cache
  prisma_migrate_deploy

  prisma_refresh_migrate_status
  prisma_assert_status_readable

  case "${PRISMA_MIGRATE_STATUS_CLASS}" in
    failed)
      deploy_die "Prisma still reports failed migrations after recovery."
      ;;
    pending)
      deploy_log "Pending migrations remain after recovery (will be applied by deploy.sh):"
      prisma_pending_migration_names
      ;;
    up_to_date)
      recover_log_diag "Prisma migration history is up to date."
      ;;
  esac
}

main() {
  cd "${DEPLOY_ROOT}"
  deploy_common_init
  deploy_log "Flower ERP — Stage C enum migration recovery"
  deploy_log "  Root: ${DEPLOY_ROOT}"
  deploy_log "  Migration: ${RECOVER_MIGRATION_NAME}"

  local timestamp
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"

  recover_validate_preconditions
  recover_create_snapshot "${timestamp}"
  recover_collect_schema_state
  recover_save_diag_file "detected-state.txt" "$(env | grep '^RECOVER_' || true)"

  if recover_target_schema_reached; then
    RECOVER_STATE="D"
    recover_log_diag "Target schema already satisfied (state D)."
  else
    recover_run_repair
  fi

  recover_finalize_prisma
  recover_check_api_health_optional

  deploy_log "Recovery completed successfully."
  deploy_log "Next step: ./deploy/scripts/deploy.sh"
  deploy_log "Backup and diagnostics: ${RECOVER_LOG_DIR}"
}

main "$@"
