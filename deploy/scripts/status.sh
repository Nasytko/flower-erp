#!/usr/bin/env bash
# Read-only production status (no mutations).
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=lib/compose.sh
source "${SCRIPT_DIR}/lib/compose.sh"
# shellcheck source=lib/database.sh
source "${SCRIPT_DIR}/lib/database.sh"
# shellcheck source=lib/health.sh
source "${SCRIPT_DIR}/lib/health.sh"

export DEPLOY_ROOT
deploy_common_init

if [[ -f "${ENV_FILE}" && -f "${COMPOSE_FILE}" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "${ENV_FILE}"
  set +a
  export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-flower-erp}"
fi

printf '\n=== Flower ERP status ===\n\n'

if command -v git >/dev/null 2>&1 && git -C "${DEPLOY_ROOT}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  printf 'Git commit: %s\n' "$(git -C "${DEPLOY_ROOT}" rev-parse --short HEAD)"
  printf 'Git branch: %s\n' "$(git -C "${DEPLOY_ROOT}" rev-parse --abbrev-ref HEAD)"
  if [[ -n "$(git -C "${DEPLOY_ROOT}" status --porcelain --untracked-files=no)" ]]; then
    printf 'Git dirty:  yes (tracked changes)\n'
  else
    printf 'Git dirty:  no\n'
  fi
else
  printf 'Git:        unavailable\n'
fi

if command -v df >/dev/null 2>&1; then
  printf 'Disk (%s): %s\n' "${DEPLOY_ROOT}" "$(df -h "${DEPLOY_ROOT}" | awk 'NR==2 {print $4 " free of " $2}')"
fi

if command -v docker >/dev/null 2>&1; then
  printf '\nDocker disk:\n'
  docker system df 2>/dev/null | sed 's/^/  /' || true
fi

if [[ -f "${ENV_FILE}" && -f "${COMPOSE_FILE}" ]]; then
  printf '\nCompose services:\n'
  deploy_compose ps -a 2>/dev/null | sed 's/^/  /' || printf '  (compose unavailable)\n'

  api_port="${FLOWER_API_PORT:-4100}"
  bo_port="${FLOWER_BACKOFFICE_PORT:-3100}"
  api_prefix="${API_PREFIX:-api/v1}"
  api_live="$(health_http_code "http://127.0.0.1:${api_port}/${api_prefix}/health/live")"
  api_ready="$(health_http_code "http://127.0.0.1:${api_port}/${api_prefix}/health/ready")"
  bo_code="$(health_http_code "http://127.0.0.1:${bo_port}/health")"
  printf '\nHTTP checks:\n'
  printf '  API live:       %s\n' "${api_live}"
  printf '  API ready:      %s\n' "${api_ready}"
  printf '  Backoffice:     %s (/health)\n' "${bo_code}"

  if deploy_compose ps backoffice 2>/dev/null | grep -q unhealthy; then
    printf '\nBackoffice logs (last 30 lines):\n'
    deploy_compose logs --tail=30 backoffice 2>/dev/null | sed 's/^/  /' || true
  fi
  if deploy_compose ps api 2>/dev/null | grep -q unhealthy; then
    printf '\nAPI logs (last 30 lines):\n'
    deploy_compose logs --tail=30 api 2>/dev/null | sed 's/^/  /' || true
  fi

  if [[ -n "${DATABASE_MIGRATE_URL:-}" ]]; then
    printf '\nPrisma migrations:\n'
    if prisma_refresh_migrate_status 2>/dev/null; then
      case "${PRISMA_MIGRATE_STATUS_CLASS}" in
        up_to_date) printf '  Status: up to date\n' ;;
        pending) printf '  Status: pending\n'; prisma_pending_migration_names | sed 's/^/    /' ;;
        failed)
          printf '  Status: FAILED\n'
          prisma_failed_migration_names | sed 's/^/    /'
          ;;
        *) printf '  Status: %s\n' "${PRISMA_MIGRATE_STATUS_CLASS}" ;;
      esac
    else
      printf '  Status: unreadable\n'
    fi
  fi
fi

backup_dir="${FLOWER_DB_BACKUP_DIR:-${DEPLOY_ROOT}/backups}"
latest_backup="$(ls -t "${backup_dir}/${FLOWER_DB_NAME:-flower_erp}"_*.dump 2>/dev/null | head -1 || true)"
printf '\nBackups:\n'
if [[ -n "${latest_backup}" && -f "${latest_backup}" ]]; then
  printf '  Latest: %s\n' "${latest_backup}"
  printf '  Size:   %s\n' "$(du -h "${latest_backup}" | cut -f1)"
  printf '  Time:   %s\n' "$(date -r "${latest_backup}" -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || stat -c %y "${latest_backup}" 2>/dev/null || echo unknown)"
else
  printf '  Latest: none\n'
fi

state_file="${STATE_DIR}/last-successful-deploy.env"
if [[ -f "${state_file}" ]]; then
  printf '\nLast successful deploy state: %s\n' "${state_file}"
  grep -E '^DEPLOYED_AT=|^FLOWER_API_IMAGE=|^FLOWER_BACKOFFICE_IMAGE=' "${state_file}" | sed 's/^/  /'
fi

printf '\n'
