#!/usr/bin/env bash
# Unit tests for recover-stage-c migration logic (mocked PostgreSQL).
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# shellcheck source=../scripts/lib/deploy-common.sh
source "${SCRIPT_DIR}/../scripts/lib/deploy-common.sh"
# shellcheck source=../scripts/lib/pg-exec.sh
source "${SCRIPT_DIR}/../scripts/lib/pg-exec.sh"
# shellcheck source=../scripts/lib/recover-stage-c-lib.sh
source "${SCRIPT_DIR}/../scripts/lib/recover-stage-c-lib.sh"

fail=0
assert_eq() {
  local got="$1" want="$2" msg="$3"
  if [[ "${got}" != "${want}" ]]; then
    echo "FAIL: ${msg} (got='${got}' want='${want}')" >&2
    fail=1
  else
    echo "OK: ${msg}"
  fi
}

assert_true() {
  local cmd="$1" msg="$2"
  if eval "${cmd}"; then
    echo "OK: ${msg}"
  else
    echo "FAIL: ${msg}" >&2
    fail=1
  fi
}

MOCK_STATE=""

pg_run_sql() {
  local sql="$1"

  if [[ "${sql}" == *"finished_at IS NOT NULL"* ]]; then
    case "${MOCK_STATE}" in
      applied) printf '1' ;;
      state_a|state_d|telegram_rows|gift_rows) printf '0' ;;
      *) printf '0' ;;
    esac
    return 0
  fi
  if [[ "${sql}" == *"logs IS NOT NULL"* ]]; then
    case "${MOCK_STATE}" in
      applied) printf '0' ;;
      state_a|state_d|telegram_rows|gift_rows) printf '1' ;;
      *) printf '0' ;;
    esac
    return 0
  fi

  case "${MOCK_STATE}" in
    applied)
      case "${sql}" in
        *payment_methods*) printf '0' ;;
        *sales*) printf '100' ;;
        *GIFT_CERTIFICATE*) printf '0' ;;
        *TELEGRAM*) printf '0' ;;
        *GIFT_CERTIFICATE*enum*) printf 'f' ;;
        *TELEGRAM*enum*) printf 'f' ;;
        *) printf '' ;;
      esac
      ;;
    state_a)
      case "${sql}" in
        *payment_methods*type*) printf 'PaymentMethodType' ;;
        *sales*sales_channel*) printf 'SalesChannel' ;;
        *PaymentMethodType_new*) printf 'f' ;;
        *SalesChannel_new*) printf 't' ;;
        *typname*PaymentMethodType*) printf 'CASH,BANK_CARD,ONLINE,QR,BANK_TRANSFER,OTHER' ;;
        *typname*SalesChannel*) printf 'STORE,PHONE,WEBSITE,TELEGRAM,OTHER' ;;
        *GIFT_CERTIFICATE*) printf '0' ;;
        *TELEGRAM*) printf '0' ;;
        *) printf '0' ;;
      esac
      ;;
    state_d)
      case "${sql}" in
        *payment_methods*type*) printf 'PaymentMethodType' ;;
        *sales*sales_channel*) printf 'SalesChannel' ;;
        *PaymentMethodType_new*) printf 'f' ;;
        *SalesChannel_new*) printf 'f' ;;
        *typname*PaymentMethodType*) printf 'CASH,BANK_CARD,ONLINE,QR,BANK_TRANSFER,OTHER' ;;
        *typname*SalesChannel*) printf 'STORE,PHONE,WEBSITE,OTHER' ;;
        *column_default*) printf "'STORE'::\"SalesChannel\"" ;;
        *GIFT_CERTIFICATE*) printf '0' ;;
        *TELEGRAM*) printf '0' ;;
        *delivery_route_plans*) printf 'f' ;;
        *reservation_movements*) printf 'f' ;;
        *enumlabel*GIFT_CERTIFICATE*) printf 'f' ;;
        *enumlabel*TELEGRAM*) printf 'f' ;;
        *) printf '0' ;;
      esac
      ;;
    telegram_rows)
      case "${sql}" in
        *payment_methods*type*) printf 'PaymentMethodType' ;;
        *sales*sales_channel*) printf 'SalesChannel' ;;
        *TELEGRAM*) printf '2' ;;
        *string_agg*TELEGRAM*) printf 'uuid-1, uuid-2' ;;
        *GIFT_CERTIFICATE*) printf '0' ;;
        *) printf '0' ;;
      esac
      ;;
    gift_rows)
      case "${sql}" in
        *GIFT_CERTIFICATE*) printf '1' ;;
        *string_agg*GIFT_CERTIFICATE*) printf 'pm-1' ;;
        *TELEGRAM*) printf '0' ;;
        *) printf '0' ;;
      esac
      ;;
    unexpected)
      case "${sql}" in
        *payment_methods*type*) printf 'unknown_enum' ;;
        *sales*sales_channel*) printf 'unknown_enum' ;;
        *PaymentMethodType_new*) printf 't' ;;
        *SalesChannel_new*) printf 't' ;;
        *) printf '' ;;
      esac
      ;;
  esac
}

pg_table_exists() {
  case "$1" in
    _prisma_migrations|payment_methods|sales) return 0 ;;
    delivery_route_plans|reservation_movements) return 1 ;;
    *) return 1 ;;
  esac
}

pg_type_exists() {
  case "${MOCK_STATE}:${1}" in
    state_a:PaymentMethodType_new) return 1 ;;
    state_a:SalesChannel_new) return 0 ;;
    state_d:PaymentMethodType_new) return 1 ;;
    state_d:SalesChannel_new) return 1 ;;
    state_a:PaymentMethodType) return 0 ;;
    state_a:SalesChannel) return 0 ;;
    state_d:PaymentMethodType) return 0 ;;
    state_d:SalesChannel) return 0 ;;
    unexpected:PaymentMethodType_new) return 0 ;;
    unexpected:SalesChannel_new) return 0 ;;
    *) return 1 ;;
  esac
}

pg_column_udt() {
  pg_run_sql "udt ${1} ${2}"
}

pg_enum_labels_csv() {
  pg_run_sql "typname = '${1}'"
}

pg_column_default() {
  pg_run_sql "column_default"
}

pg_count_text_match() {
  pg_run_sql "${3}"
}

pg_psql() { return 0; }

MOCK_STATE="state_a"
recover_collect_schema_state
recover_detect_state
assert_eq "${RECOVER_STATE}" "A" "detect state A"

MOCK_STATE="state_d"
recover_collect_schema_state
recover_detect_state
assert_eq "${RECOVER_STATE}" "D" "detect state D (target reached)"

MOCK_STATE="state_d"
recover_collect_schema_state
assert_true "recover_target_schema_reached" "target schema reached in state D"

MOCK_STATE="telegram_rows"
if ( recover_collect_schema_state && recover_assert_data_safety_gate ) >/dev/null 2>&1; then
  echo "FAIL: TELEGRAM rows should abort recovery" >&2
  fail=1
else
  echo "OK: TELEGRAM rows abort recovery"
fi

MOCK_STATE="gift_rows"
if ( recover_collect_schema_state && recover_assert_data_safety_gate ) >/dev/null 2>&1; then
  echo "FAIL: GIFT_CERTIFICATE rows should abort recovery" >&2
  fail=1
else
  echo "OK: GIFT_CERTIFICATE rows abort recovery"
fi

MOCK_STATE="unexpected"
recover_collect_schema_state
recover_detect_state
assert_eq "${RECOVER_STATE}" "UNEXPECTED" "detect unexpected binding"

tmpdir="$(mktemp -d)"
recover_write_state_a_sql "${tmpdir}/a.sql"
grep -q 'SalesChannel_new' "${tmpdir}/a.sql" && echo "OK: state A SQL contains SalesChannel_new" || { echo "FAIL: state A SQL" >&2; fail=1; }
grep -q 'BEGIN;' "${tmpdir}/a.sql" && echo "OK: state A SQL is transactional" || { echo "FAIL: state A transaction" >&2; fail=1; }
rm -rf "${tmpdir}"

exit "${fail}"
