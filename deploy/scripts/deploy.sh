#!/usr/bin/env bash
# Production deploy: build → migrate → rolling recreate (ORVIX-safe).
# Does NOT touch other compose projects, volumes, or networks.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

ENV_FILE="${ENV_FILE:-${DEPLOY_ROOT}/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-${DEPLOY_ROOT}/docker-compose.production.yml}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: ${ENV_FILE} not found." >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "${ENV_FILE}"
set +a

export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-flower-erp}"

echo "==> Flower ERP deploy (project=${COMPOSE_PROJECT_NAME})"
echo "    Root: ${DEPLOY_ROOT}"
echo "    Env:  ${ENV_FILE}"

cd "${DEPLOY_ROOT}"

echo "==> [1/4] Building images (api, migrate, backoffice)..."
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" build api backoffice
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" --profile migrate build migrate

echo "==> [2/4] Running migrations (must succeed before app rollout)..."
"${SCRIPT_DIR}/migrate.sh"

echo "==> [3/4] Starting / updating API..."
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" up -d --no-deps --force-recreate api

echo "==> Waiting for API health..."
deadline=$((SECONDS + 120))
until docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" ps api | grep -q "(healthy)"; do
  if (( SECONDS > deadline )); then
    echo "ERROR: API did not become healthy within 120s" >&2
    docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" logs --tail=80 api
    exit 1
  fi
  sleep 3
done

echo "==> [4/4] Starting / updating Backoffice..."
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" up -d --force-recreate backoffice

echo "==> Deploy complete."
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" ps

echo ""
echo "Local bindings:"
echo "  API:        http://127.0.0.1:${FLOWER_API_PORT:-4100}/api/v1/health/live"
echo "  Backoffice: http://127.0.0.1:${FLOWER_BACKOFFICE_PORT:-3100}/"
