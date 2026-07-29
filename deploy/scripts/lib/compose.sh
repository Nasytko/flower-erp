#!/usr/bin/env bash
# Docker Compose wrappers.

deploy_compose() {
  docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" "$@"
}

deploy_compose_migrate() {
  deploy_compose --profile migrate "$@"
}

deploy_compose_validate() {
  deploy_compose config >/dev/null \
    || deploy_die "docker compose config validation failed."
}

deploy_save_deploy_state() {
  local api_id bo_id
  mkdir -p "${STATE_DIR}"
  api_id="$(deploy_compose images -q api 2>/dev/null | head -1 || true)"
  bo_id="$(deploy_compose images -q backoffice 2>/dev/null | head -1 || true)"
  cat > "${STATE_DIR}/last-successful-deploy.env" <<EOF
# Written by deploy.sh after successful rollout. No secrets.
DEPLOYED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
GIT_COMMIT=$(deploy_git_info | awk '{print $1}')
GIT_BRANCH=$(deploy_git_info | awk '{print $2}')
FLOWER_API_IMAGE=${FLOWER_API_IMAGE:-flower-erp-api:production}
FLOWER_BACKOFFICE_IMAGE=${FLOWER_BACKOFFICE_IMAGE:-flower-erp-backoffice:production}
FLOWER_API_IMAGE_ID=${api_id}
FLOWER_BACKOFFICE_IMAGE_ID=${bo_id}
EOF
  chmod 600 "${STATE_DIR}/last-successful-deploy.env"
}

deploy_load_previous_state() {
  local state_file="${STATE_DIR}/previous-deploy.env"
  if [[ ! -f "${state_file}" ]]; then
    state_file="${STATE_DIR}/last-successful-deploy.env"
  fi
  [[ -f "${state_file}" ]] || deploy_die "No previous deploy state (deploy successfully at least once)."
  # shellcheck disable=SC1090
  source "${state_file}"
}

deploy_snapshot_previous_state() {
  mkdir -p "${STATE_DIR}"
  if [[ -f "${STATE_DIR}/last-successful-deploy.env" ]]; then
    cp "${STATE_DIR}/last-successful-deploy.env" "${STATE_DIR}/previous-deploy.env"
  fi
}
