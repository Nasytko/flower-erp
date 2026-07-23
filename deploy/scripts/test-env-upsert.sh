#!/usr/bin/env bash
# Fixture tests for env upsert helpers used by init-production.sh (no Docker, no secrets).
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=init-production.sh
# Extract only pure helpers by sourcing after stubbing main-related bits is heavy;
# instead redefine the helpers inline to match init-production.sh (keep in sync).

is_placeholder() {
  local value="${1:-}"
  [[ -z "${value}" ]] && return 0
  [[ "${value}" == CHANGE_ME* ]] && return 0
  return 1
}

get_env_value() {
  local file="$1" key="$2"
  [[ -f "${file}" ]] || { printf ''; return 0; }
  local line
  line="$(grep -E "^${key}=" "${file}" | head -n1 || true)"
  [[ -z "${line}" ]] && { printf ''; return 0; }
  local value="${line#*=}"
  value="${value%$'\r'}"
  printf '%s' "${value}"
}

upsert_env() {
  local file="$1" key="$2" value="$3"
  local tmp
  tmp="$(mktemp "${file}.XXXXXX")"
  if [[ -f "${file}" ]] && grep -qE "^${key}=" "${file}"; then
    awk -v k="${key}" -v v="${value}" '
      BEGIN { done=0 }
      {
        if ($0 ~ ("^" k "=")) {
          if (!done) { print k "=" v; done=1 }
          next
        }
        print
      }
      END { if (!done) print k "=" v }
    ' "${file}" > "${tmp}"
  else
    if [[ -f "${file}" ]]; then
      cat "${file}" > "${tmp}"
      [[ -s "${tmp}" && "$(tail -c1 "${tmp}" | wc -l)" -eq 0 ]] || printf '\n' >> "${tmp}"
    else
      : > "${tmp}"
    fi
    printf '%s=%s\n' "${key}" "${value}" >> "${tmp}"
  fi
  chmod 600 "${tmp}"
  mv -f -- "${tmp}" "${file}"
}

count_env_key() {
  local file="$1" key="$2"
  grep -cE "^${key}=" "${file}" || true
}

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

WORKDIR="$(mktemp -d)"
trap 'rm -rf "${WORKDIR}"' EXIT
FILE="${WORKDIR}/.env"

cat > "${FILE}" <<'EOF'
# comment
COMPOSE_PROJECT_NAME=flower-erp
JWT_ACCESS_SECRET=CHANGE_ME_MIN_32_CHARS_RANDOM_STRING_HERE
DATABASE_URL=postgresql://flower_user:CHANGE_ME@leadflow-postgres-1:5432/flower_erp?schema=public

# trailing comment
EOF

upsert_env "${FILE}" JWT_ACCESS_SECRET "abc123hex"
upsert_env "${FILE}" JWT_ACCESS_SECRET "abc123hex"
upsert_env "${FILE}" FLOWER_DB_PASSWORD "deadbeef"
upsert_env "${FILE}" COMPOSE_PROJECT_NAME "flower-erp"

assert_eq "$(get_env_value "${FILE}" JWT_ACCESS_SECRET)" "abc123hex" "upsert replaces CHANGE_ME"
assert_eq "$(count_env_key "${FILE}" JWT_ACCESS_SECRET)" "1" "no duplicate JWT_ACCESS_SECRET"
assert_eq "$(count_env_key "${FILE}" FLOWER_DB_PASSWORD)" "1" "new key added once"
assert_eq "$(count_env_key "${FILE}" COMPOSE_PROJECT_NAME)" "1" "existing key not duplicated"
assert_eq "$(get_env_value "${FILE}" COMPOSE_PROJECT_NAME)" "flower-erp" "preserve non-secret value"

# Simulate second init: real secret must not be treated as placeholder
is_placeholder "abc123hex" && { echo "FAIL: real secret treated as placeholder"; fail=1; } || echo "OK: real secret not placeholder"
is_placeholder "CHANGE_ME" && echo "OK: CHANGE_ME is placeholder" || { echo "FAIL: CHANGE_ME"; fail=1; }
is_placeholder "" && echo "OK: empty is placeholder" || { echo "FAIL: empty"; fail=1; }

# Comments preserved
grep -q '^# comment' "${FILE}" && echo "OK: comments preserved" || { echo "FAIL: comments lost"; fail=1; }

perm="$(stat -c '%a' "${FILE}" 2>/dev/null || stat -f '%OLp' "${FILE}" 2>/dev/null || echo '')"
if [[ "$(uname -s)" == Linux* ]]; then
  assert_eq "${perm}" "600" "chmod 600 on upserted file"
else
  echo "OK: chmod assertion skipped on $(uname -s) (enforced on Linux VPS)"
fi

exit "${fail}"
