#!/usr/bin/env bash
# Testable helpers for reset-test-database.sh

RESET_EXPECTED_DATABASE="flower_erp"
RESET_FORBIDDEN_DATABASES=(postgres template0 template1)

RESET_STAGE_C_REMOVED_TABLES=(
  delivery_route_plans
  delivery_route_stops
  payment_allocation_transfers
  order_composition_replacements
  order_timeline_events
  sale_timeline_events
  payment_timeline_events
  delivery_timeline_events
  transfer_timeline_events
  reservation_movements
)

RESET_REQUIRED_TABLES=(
  organizations
  stores
  warehouses
  users
  customers
  items
  orders
  sales
  payments
  inventory_reservations
  delivery_jobs
  audit_logs
)

reset_confirm_flags_present() {
  [[ "${CONFIRM_RESET_TEST_DATABASE:-}" == "YES" ]] \
    || deploy_die "Refusing reset: set CONFIRM_RESET_TEST_DATABASE=YES"
  [[ "${CONFIRM_ALL_FLOWER_DATA_CAN_BE_DELETED:-}" == "YES" ]] \
    || deploy_die "Refusing reset: set CONFIRM_ALL_FLOWER_DATA_CAN_BE_DELETED=YES"
}

reset_print_deletion_warning() {
  cat <<'EOF'

******************************************************************
  ALL DATA IN DATABASE flower_erp WILL BE PERMANENTLY DELETED.
  Other databases and PostgreSQL volumes are NOT affected.
******************************************************************

EOF
}

reset_confirm_interactive() {
  reset_confirm_flags_present
  reset_print_deletion_warning

  if [[ -t 0 ]]; then
    printf 'Type exactly: RESET flower_erp\n' >&2
    local typed=""
    IFS= read -r typed
    [[ "${typed}" == "RESET flower_erp" ]] \
      || deploy_die "Interactive confirmation failed (expected: RESET flower_erp)."
  fi
}

reset_validate_target_database() {
  local db_name="${FLOWER_DB_NAME:-flower_erp}"
  local forbidden

  [[ -n "${db_name}" ]] || deploy_die "Database name is empty."
  [[ "${db_name}" == "${RESET_EXPECTED_DATABASE}" ]] \
    || deploy_die "Refusing reset: database name must be exactly ${RESET_EXPECTED_DATABASE} (got ${db_name})."

  for forbidden in "${RESET_FORBIDDEN_DATABASES[@]}"; do
    [[ "${db_name}" != "${forbidden}" ]] \
      || deploy_die "Refusing reset: forbidden database name ${forbidden}."
  done

  : "${DATABASE_MIGRATE_URL:?DATABASE_MIGRATE_URL is required}"
  if [[ ! "${DATABASE_MIGRATE_URL}" =~ /${RESET_EXPECTED_DATABASE}(\?|$) ]]; then
    deploy_die "DATABASE_MIGRATE_URL must target database ${RESET_EXPECTED_DATABASE} only."
  fi
  if [[ "${DATABASE_MIGRATE_URL}" =~ /postgres(\?|$) ]]; then
    deploy_die "DATABASE_MIGRATE_URL must not target postgres maintenance database."
  fi
}

reset_migrate_role() {
  printf '%s' "${FLOWER_MIGRATE_ROLE:-flower_migrate}"
}

reset_app_role() {
  printf '%s' "${FLOWER_APP_ROLE:-flower_user}"
}

reset_admin_psql() {
  if [[ -n "${RESET_ADMIN_PSQL_HANDLER:-}" ]]; then
    "${RESET_ADMIN_PSQL_HANDLER}" "$@"
    return $?
  fi

  deploy_require_cmd docker
  local container="${FLOWER_POSTGRES_CONTAINER:-leadflow-postgres-1}"
  docker exec -i "${container}" psql -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"
}

reset_list_databases() {
  reset_admin_psql -X -A -t -P pager=off -c \
    "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY 1;"
}

reset_database_exists() {
  local db="$1"
  reset_admin_psql -X -A -t -P pager=off -c \
    "SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = '${db}');" | grep -q '^t$'
}

reset_current_database_owner() {
  local db="$1"
  reset_admin_psql -X -A -t -P pager=off -c \
    "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = '${db}';"
}

reset_drop_and_recreate_database() {
  local db="$1" owner="$2"
  local migrate_role app_role
  migrate_role="$(reset_migrate_role)"
  app_role="$(reset_app_role)"

  reset_admin_psql <<EOSQL
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '${db}'
  AND pid <> pg_backend_pid();
EOSQL

  reset_admin_psql -c "DROP DATABASE IF EXISTS \"${db}\";"
  reset_admin_psql -c "CREATE DATABASE \"${db}\" OWNER \"${owner}\";"

  reset_admin_psql <<EOSQL
REVOKE ALL ON DATABASE "${db}" FROM PUBLIC;
GRANT CONNECT ON DATABASE "${db}" TO "${app_role}";
GRANT CONNECT ON DATABASE "${db}" TO "${migrate_role}";
EOSQL

  reset_admin_psql -d "${db}" <<EOSQL
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO "${app_role}";
GRANT USAGE ON SCHEMA public TO "${migrate_role}";
GRANT CREATE ON SCHEMA public TO "${migrate_role}";
EOSQL
}

reset_reapply_table_grants() {
  local db="$1"
  local migrate_role app_role
  migrate_role="$(reset_migrate_role)"
  app_role="$(reset_app_role)"

  reset_admin_psql -d "${db}" <<EOSQL
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${app_role}";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "${app_role}";
ALTER DEFAULT PRIVILEGES FOR ROLE "${migrate_role}" IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${app_role}";
ALTER DEFAULT PRIVILEGES FOR ROLE "${migrate_role}" IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO "${app_role}";
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "${migrate_role}";
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO "${migrate_role}";
ALTER DEFAULT PRIVILEGES FOR ROLE "${migrate_role}" IN SCHEMA public
  GRANT ALL ON TABLES TO "${migrate_role}";
ALTER DEFAULT PRIVILEGES FOR ROLE "${migrate_role}" IN SCHEMA public
  GRANT ALL ON SEQUENCES TO "${migrate_role}";
EOSQL
}

reset_attempt_backup() {
  local backup_script="${DEPLOY_ROOT}/deploy/scripts/backup-db.sh"
  local backup_ok=0

  if [[ -n "${RESET_BACKUP_HANDLER:-}" ]]; then
    if RESET_BACKUP_HANDLER; then
      backup_ok=1
      deploy_log "Pre-reset backup completed (test handler)."
    else
      deploy_warn "Pre-reset backup failed (test handler)."
    fi
  elif [[ -x "${backup_script}" ]] && "${backup_script}"; then
    backup_ok=1
    deploy_log "Pre-reset backup completed."
  else
    deploy_warn "Pre-reset backup failed."
  fi

  if [[ "${backup_ok}" -eq 0 && "${ALLOW_RESET_WITHOUT_BACKUP:-}" != "YES" ]]; then
    deploy_die "Backup failed. Set ALLOW_RESET_WITHOUT_BACKUP=YES to continue without backup."
  fi
}

reset_run_optional_seed() {
  if [[ "${RUN_SEED:-0}" != "1" ]]; then
    deploy_log "Skipping seed (set RUN_SEED=1 to enable; no Prisma seed is configured)."
    return 0
  fi
  deploy_log "RUN_SEED=1 set, but no Prisma seed script is configured in this project."
  deploy_log "Create the initial director manually after reset if needed:"
  deploy_log "  docker compose ... run --rm api node dist/scripts/create-initial-director.js"
}

reset_validate_post_migrate() {
  local failed_count removed exists enum_val table

  failed_count="$(pg_run_sql "
    SELECT COUNT(*)::text
    FROM \"_prisma_migrations\"
    WHERE (finished_at IS NULL AND rolled_back_at IS NULL)
       OR (logs IS NOT NULL AND btrim(logs) <> '' AND finished_at IS NULL);
  ")"
  [[ "${failed_count}" == "0" ]] || deploy_die "Failed migration rows detected in _prisma_migrations."

  for removed in "${RESET_STAGE_C_REMOVED_TABLES[@]}"; do
    if pg_table_exists "${removed}"; then
      deploy_die "Removed Stage C table still exists: ${removed}"
    fi
  done

  pg_type_exists "PaymentMethodType_new" && deploy_die "Temporary enum PaymentMethodType_new exists."
  pg_type_exists "SalesChannel_new" && deploy_die "Temporary enum SalesChannel_new exists."

  enum_val="$(pg_enum_labels_csv PaymentMethodType)"
  [[ "${enum_val}" != *"GIFT_CERTIFICATE"* ]] || deploy_die "GIFT_CERTIFICATE still in PaymentMethodType."
  enum_val="$(pg_enum_labels_csv SalesChannel)"
  [[ "${enum_val}" != *"TELEGRAM"* ]] || deploy_die "TELEGRAM still in SalesChannel."

  for table in "${RESET_REQUIRED_TABLES[@]}"; do
    pg_table_exists "${table}" || deploy_die "Expected table missing after migrate: ${table}"
  done
}
