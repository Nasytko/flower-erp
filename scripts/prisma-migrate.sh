#!/usr/bin/env bash
set -euo pipefail

# Runs Prisma migrations using DATABASE_MIGRATE_URL when set.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR/apps/api"

if [[ -n "${DATABASE_MIGRATE_URL:-}" ]]; then
  export DATABASE_URL="$DATABASE_MIGRATE_URL"
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL or DATABASE_MIGRATE_URL is required" >&2
  exit 1
fi

pnpm exec prisma migrate "$@"
