#!/usr/bin/env bash
# Run Prisma migrations against production database (safe, idempotent).
# Must complete successfully before rolling out new API containers.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

ENV_FILE="${ENV_FILE:-${DEPLOY_ROOT}/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-${DEPLOY_ROOT}/docker-compose.production.yml}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: ${ENV_FILE} not found. Copy .env.production.example and configure secrets." >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "${ENV_FILE}"
set +a

if [[ -z "${DATABASE_MIGRATE_URL:-}" ]]; then
  echo "ERROR: DATABASE_MIGRATE_URL is not set in ${ENV_FILE}" >&2
  exit 1
fi

echo "==> Flower ERP: running database migrations (project=${COMPOSE_PROJECT_NAME:-flower-erp})"

cd "${DEPLOY_ROOT}"

# Ensure migrate target image is built (must not reuse flower-erp-api:production).
docker compose \
  -f "${COMPOSE_FILE}" \
  --env-file "${ENV_FILE}" \
  --profile migrate \
  build migrate

docker compose \
  -f "${COMPOSE_FILE}" \
  --env-file "${ENV_FILE}" \
  --profile migrate \
  run --rm migrate

echo "==> Migrations completed successfully."
