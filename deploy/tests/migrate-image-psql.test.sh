#!/usr/bin/env bash
# Verify migrate image includes psql (requires Docker + .env.production).
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ENV_FILE="${DEPLOY_ROOT}/.env.production"
COMPOSE_FILE="${DEPLOY_ROOT}/docker-compose.production.yml"

if ! command -v docker >/dev/null 2>&1; then
  echo "SKIP: docker not available"
  exit 0
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "SKIP: .env.production not found (local dev)"
  exit 0
fi

docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" --profile migrate build migrate
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" --profile migrate \
  run --rm --no-deps --entrypoint psql migrate --version | grep -qE ' 16\.'
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" --profile migrate \
  run --rm --no-deps --entrypoint pg_dump migrate --version | grep -qE ' 16\.'

echo "OK: migrate image provides PostgreSQL 16 psql and pg_dump"
