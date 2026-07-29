#!/usr/bin/env bash
# Bootstrap first organization + store + warehouse + DIRECTOR on empty database.
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=lib/compose.sh
source "${SCRIPT_DIR}/lib/compose.sh"

export DEPLOY_ROOT
deploy_common_init
deploy_load_env

deploy_log "Bootstrap first organization (interactive)"
deploy_log "Requires ALLOW_OWNER_BOOTSTRAP=true and applied migrations."

deploy_compose run --rm --no-deps -it \
  -e ALLOW_OWNER_BOOTSTRAP=true \
  api node dist/scripts/create-initial-director.js

deploy_log "After success, set ALLOW_OWNER_BOOTSTRAP=false in .env.production and redeploy."
