#!/usr/bin/env bash
# Recovery logic for failed migration 20260729150000_remove_unused_enum_values.

RECOVER_MIGRATION_NAME="20260729150000_remove_unused_enum_values"
RECOVER_TARGET_PM_LABELS="CASH,BANK_CARD,ONLINE,QR,BANK_TRANSFER,OTHER"
RECOVER_TARGET_SC_LABELS="STORE,PHONE,WEBSITE,OTHER"
RECOVER_TARGET_SC_DEFAULT="'STORE'::\"SalesChannel\""

RECOVER_STATE=""
RECOVER_PM_UDT=""
RECOVER_SC_UDT=""
RECOVER_PM_LABELS=""
RECOVER_SC_LABELS=""
RECOVER_PM_NEW_EXISTS="false"
RECOVER_SC_NEW_EXISTS="false"
RECOVER_GIFT_CERT_COUNT="0"
RECOVER_TELEGRAM_COUNT="0"
RECOVER_HAS_SUCCESS="false"
RECOVER_HAS_FAILED="false"

recover_log_diag() {
  local msg="$1"
  deploy_log "${msg}"
  if [[ -n "${RECOVER_LOG_DIR:-}" ]]; then
    printf '%s\n' "${msg}" >> "${RECOVER_LOG_DIR}/recovery.log"
  fi
}

recover_save_diag_file() {
  local name="$1"
  local content="$2"
  [[ -n "${RECOVER_LOG_DIR:-}" ]] || return 0
  printf '%s\n' "${content}" > "${RECOVER_LOG_DIR}/${name}"
}

recover_query_migration_rows() {
  pg_psql -v ON_ERROR_STOP=1 -c "
    SELECT
      id,
      migration_name,
      started_at,
      finished_at,
      rolled_back_at,
      applied_steps_count,
      logs
    FROM \"_prisma_migrations\"
    WHERE migration_name = '${RECOVER_MIGRATION_NAME}'
    ORDER BY started_at;
  "
}

recover_analyze_migration_history() {
  local finished_count failed_count
  finished_count="$(pg_run_sql "
    SELECT COUNT(*)::text
    FROM \"_prisma_migrations\"
    WHERE migration_name = '${RECOVER_MIGRATION_NAME}'
      AND finished_at IS NOT NULL;
  ")"
  failed_count="$(pg_run_sql "
    SELECT COUNT(*)::text
    FROM \"_prisma_migrations\"
    WHERE migration_name = '${RECOVER_MIGRATION_NAME}'
      AND finished_at IS NULL
      AND rolled_back_at IS NULL
      AND logs IS NOT NULL;
  ")"

  [[ "${finished_count}" -gt 0 ]] && RECOVER_HAS_SUCCESS="true"
  [[ "${failed_count}" -gt 0 ]] && RECOVER_HAS_FAILED="true"
}

recover_collect_schema_state() {
  pg_table_exists "_prisma_migrations" || deploy_die "Table _prisma_migrations not found."
  pg_table_exists "payment_methods" || deploy_die "Table payment_methods not found."
  pg_table_exists "sales" || deploy_die "Table sales not found."

  recover_analyze_migration_history

  RECOVER_PM_UDT="$(pg_column_udt payment_methods type)"
  RECOVER_SC_UDT="$(pg_column_udt sales sales_channel)"
  pg_type_exists "PaymentMethodType" && RECOVER_PM_LABELS="$(pg_enum_labels_csv PaymentMethodType)" || RECOVER_PM_LABELS=""
  pg_type_exists "SalesChannel" && RECOVER_SC_LABELS="$(pg_enum_labels_csv SalesChannel)" || RECOVER_SC_LABELS=""
  pg_type_exists "PaymentMethodType_new" && RECOVER_PM_NEW_EXISTS="true"
  pg_type_exists "SalesChannel_new" && RECOVER_SC_NEW_EXISTS="true"

  RECOVER_GIFT_CERT_COUNT="$(pg_count_text_match payment_methods type GIFT_CERTIFICATE)"
  RECOVER_TELEGRAM_COUNT="$(pg_count_text_match sales sales_channel TELEGRAM)"
}

recover_pm_is_target() {
  [[ "${RECOVER_PM_UDT}" == "PaymentMethodType" ]] \
    && [[ "${RECOVER_PM_LABELS}" == "${RECOVER_TARGET_PM_LABELS}" ]] \
    && [[ "${RECOVER_PM_NEW_EXISTS}" == "false" ]]
}

recover_sc_is_target() {
  [[ "${RECOVER_SC_UDT}" == "SalesChannel" ]] \
    && [[ "${RECOVER_SC_LABELS}" == "${RECOVER_TARGET_SC_LABELS}" ]] \
    && [[ "${RECOVER_SC_NEW_EXISTS}" == "false" ]]
}

recover_target_schema_reached() {
  recover_pm_is_target && recover_sc_is_target
}

recover_detect_state() {
  if recover_target_schema_reached; then
    RECOVER_STATE="D"
    return 0
  fi

  if recover_pm_is_target \
    && [[ "${RECOVER_SC_UDT}" == "SalesChannel" ]] \
    && [[ "${RECOVER_SC_NEW_EXISTS}" == "true" ]] \
    && printf '%s' "${RECOVER_SC_LABELS}" | grep -q 'TELEGRAM'; then
    RECOVER_STATE="A"
    return 0
  fi

  if [[ "${RECOVER_SC_UDT}" == "SalesChannel_new" ]]; then
    RECOVER_STATE="C"
    return 0
  fi

  if [[ "${RECOVER_PM_NEW_EXISTS}" == "false" && "${RECOVER_SC_NEW_EXISTS}" == "false" ]] \
    && { [[ "${RECOVER_PM_LABELS}" == *"GIFT_CERTIFICATE"* ]] || [[ "${RECOVER_SC_LABELS}" == *"TELEGRAM"* ]]; }; then
    RECOVER_STATE="B"
    return 0
  fi

  if [[ "${RECOVER_PM_NEW_EXISTS}" == "true" && "${RECOVER_PM_UDT}" == "PaymentMethodType" ]] \
    && ! recover_pm_is_target; then
    RECOVER_STATE="B"
    return 0
  fi

  RECOVER_STATE="UNEXPECTED"
}

recover_assert_data_safety_gate() {
  local ids
  if [[ "${RECOVER_GIFT_CERT_COUNT}" != "0" ]]; then
    ids="$(pg_run_sql "SELECT string_agg(id::text, ', ') FROM payment_methods WHERE type::text = 'GIFT_CERTIFICATE' LIMIT 20;")"
    deploy_die "Found ${RECOVER_GIFT_CERT_COUNT} payment_methods with GIFT_CERTIFICATE (ids: ${ids:-unknown}). Recovery aborted."
  fi
  if [[ "${RECOVER_TELEGRAM_COUNT}" != "0" ]]; then
    ids="$(pg_run_sql "SELECT string_agg(id::text, ', ') FROM sales WHERE sales_channel::text = 'TELEGRAM' LIMIT 20;")"
    deploy_die "Found ${RECOVER_TELEGRAM_COUNT} sales with TELEGRAM (ids: ${ids:-unknown}). Recovery aborted."
  fi
}

recover_write_repair_sql() {
  local out="$1"
  cat > "${out}" <<'EOSQL'
BEGIN;

-- PaymentMethodType: reach target labels without GIFT_CERTIFICATE
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentMethodType_new') THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'payment_methods'
        AND column_name = 'type'
        AND udt_name = 'PaymentMethodType'
    ) THEN
      ALTER TABLE "payment_methods" ALTER COLUMN "type" DROP DEFAULT;
      ALTER TABLE "payment_methods"
        ALTER COLUMN "type" TYPE "PaymentMethodType_new"
        USING ("type"::text::"PaymentMethodType_new");
      IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentMethodType') THEN
        DROP TYPE "PaymentMethodType";
      END IF;
      ALTER TYPE "PaymentMethodType_new" RENAME TO "PaymentMethodType";
    ELSIF NOT EXISTS (
      SELECT 1
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_type t ON t.oid = a.atttypid
      WHERE c.relname = 'payment_methods'
        AND a.attname = 'type'
        AND NOT a.attisdropped
        AND t.typname = 'PaymentMethodType_new'
    ) THEN
      DROP TYPE "PaymentMethodType_new";
    END IF;
  ELSIF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'PaymentMethodType'
      AND e.enumlabel = 'GIFT_CERTIFICATE'
  ) THEN
    CREATE TYPE "PaymentMethodType_new" AS ENUM (
      'CASH', 'BANK_CARD', 'ONLINE', 'QR', 'BANK_TRANSFER', 'OTHER'
    );
    ALTER TABLE "payment_methods" ALTER COLUMN "type" DROP DEFAULT;
    ALTER TABLE "payment_methods"
      ALTER COLUMN "type" TYPE "PaymentMethodType_new"
      USING ("type"::text::"PaymentMethodType_new");
    DROP TYPE "PaymentMethodType";
    ALTER TYPE "PaymentMethodType_new" RENAME TO "PaymentMethodType";
  END IF;
END $$;

-- SalesChannel: reach target labels without TELEGRAM
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SalesChannel_new') THEN
    IF EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'SalesChannel'
        AND e.enumlabel = 'TELEGRAM'
    ) OR EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'sales'
        AND column_name = 'sales_channel'
        AND udt_name = 'SalesChannel'
    ) THEN
      CREATE TYPE "SalesChannel_new" AS ENUM ('STORE', 'PHONE', 'WEBSITE', 'OTHER');
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SalesChannel_new') THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'sales'
        AND column_name = 'sales_channel'
        AND udt_name IN ('SalesChannel', 'SalesChannel_new')
    ) THEN
      ALTER TABLE "sales" ALTER COLUMN "sales_channel" DROP DEFAULT;
      ALTER TABLE "sales"
        ALTER COLUMN "sales_channel" TYPE "SalesChannel_new"
        USING ("sales_channel"::text::"SalesChannel_new");
    END IF;

    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SalesChannel')
      AND NOT EXISTS (
        SELECT 1
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_type t ON t.oid = a.atttypid
        WHERE c.relname NOT IN ('sales')
          AND NOT a.attisdropped
          AND a.attnum > 0
          AND t.typname = 'SalesChannel'
      ) THEN
      DROP TYPE "SalesChannel";
    END IF;

    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SalesChannel_new') THEN
      ALTER TYPE "SalesChannel_new" RENAME TO "SalesChannel";
    END IF;

    ALTER TABLE "sales"
      ALTER COLUMN "sales_channel" SET DEFAULT 'STORE'::"SalesChannel";
  END IF;
END $$;

COMMIT;
EOSQL
}

recover_write_state_a_sql() {
  local out="$1"
  cat > "${out}" <<'EOSQL'
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SalesChannel_new') THEN
    CREATE TYPE "SalesChannel_new" AS ENUM ('STORE', 'PHONE', 'WEBSITE', 'OTHER');
  END IF;
END $$;

ALTER TABLE "sales" ALTER COLUMN "sales_channel" DROP DEFAULT;
ALTER TABLE "sales"
  ALTER COLUMN "sales_channel" TYPE "SalesChannel_new"
  USING ("sales_channel"::text::"SalesChannel_new");

DROP TYPE "SalesChannel";
ALTER TYPE "SalesChannel_new" RENAME TO "SalesChannel";
ALTER TABLE "sales"
  ALTER COLUMN "sales_channel" SET DEFAULT 'STORE'::"SalesChannel";

COMMIT;
EOSQL
}

recover_write_state_c_sql() {
  local out="$1"
  cat > "${out}" <<'EOSQL'
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SalesChannel')
    AND NOT EXISTS (
      SELECT 1
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_type t ON t.oid = a.atttypid
      WHERE c.relname NOT IN ('sales')
        AND NOT a.attisdropped
        AND a.attnum > 0
        AND t.typname = 'SalesChannel'
    ) THEN
    DROP TYPE "SalesChannel";
  END IF;
END $$;

ALTER TYPE "SalesChannel_new" RENAME TO "SalesChannel";
ALTER TABLE "sales"
  ALTER COLUMN "sales_channel" SET DEFAULT 'STORE'::"SalesChannel";

COMMIT;
EOSQL
}

recover_select_repair_sql_writer() {
  case "${RECOVER_STATE}" in
    A) recover_write_state_a_sql "$1" ;;
    C) recover_write_state_c_sql "$1" ;;
    B) recover_write_repair_sql "$1" ;;
    *) recover_write_repair_sql "$1" ;;
  esac
}

recover_assert_final_invariants() {
  recover_collect_schema_state

  recover_pm_is_target || deploy_die "Post-recovery invariant failed: PaymentMethodType."
  recover_sc_is_target || deploy_die "Post-recovery invariant failed: SalesChannel."

  pg_type_exists "PaymentMethodType_new" && deploy_die "Post-recovery invariant failed: PaymentMethodType_new still exists."
  pg_type_exists "SalesChannel_new" && deploy_die "Post-recovery invariant failed: SalesChannel_new still exists."

  local sc_default
  sc_default="$(pg_column_default sales sales_channel)"
  [[ "${sc_default}" == *"STORE"* ]] \
    || deploy_die "Post-recovery invariant failed: sales.sales_channel default is not STORE."

  pg_table_exists "delivery_route_plans" && deploy_die "Stage C table delivery_route_plans should be absent."
  pg_table_exists "reservation_movements" && deploy_die "Stage C table reservation_movements should be absent."
}

recover_verify_no_removed_enum_values() {
  pg_run_sql "
    SELECT EXISTS (
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'PaymentMethodType' AND e.enumlabel = 'GIFT_CERTIFICATE'
    );
  " | grep -q f || deploy_die "GIFT_CERTIFICATE still present in PaymentMethodType."
  pg_run_sql "
    SELECT EXISTS (
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'SalesChannel' AND e.enumlabel = 'TELEGRAM'
    );
  " | grep -q f || deploy_die "TELEGRAM still present in SalesChannel."
}

recover_check_api_health_optional() {
  local api_port="${FLOWER_API_PORT:-4100}"
  if curl -sf "http://127.0.0.1:${api_port}/api/v1/health/live" >/dev/null 2>&1; then
    recover_log_diag "API health/live OK (container not restarted by recovery script)."
  else
    recover_log_diag "API health/live not reachable (expected before deploy.sh)."
  fi
}
