#!/usr/bin/env bash
# Create or attach a DIRECTOR for an existing organization.
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

deploy_log "Create director user (interactive; password hidden)"
deploy_warn "Prefer DIRECTOR_PASSWORD_FILE over DIRECTOR_PASSWORD in environment."

deploy_compose run --rm --no-deps -it \
  -e ALLOW_OWNER_BOOTSTRAP=true \
  -e DIRECTOR_ORGANIZATION_ID \
  -e DIRECTOR_LOGIN \
  -e DIRECTOR_DISPLAY_NAME \
  -e DIRECTOR_EMAIL \
  -e DIRECTOR_PASSWORD_FILE \
  -e DIRECTOR_ATTACH_EXISTING \
  -e DIRECTOR_RESET_PASSWORD \
  api node dist/scripts/create-director.js
