#!/usr/bin/env bash
# Container and HTTP readiness checks.

health_api_prefix() {
  printf '%s' "${API_PREFIX:-api/v1}"
}

health_api_url() {
  local suffix="$1"
  local port="${FLOWER_API_PORT:-4100}"
  printf 'http://127.0.0.1:%s/%s/%s' "${port}" "$(health_api_prefix)" "${suffix}"
}

health_backoffice_url() {
  local port="${FLOWER_BACKOFFICE_PORT:-3100}"
  printf 'http://127.0.0.1:%s/health' "${port}"
}

health_http_code() {
  local url="$1"
  if command -v curl >/dev/null 2>&1; then
    curl -sf -o /dev/null -w '%{http_code}' "${url}" 2>/dev/null || printf '000'
    return 0
  fi
  if command -v node >/dev/null 2>&1; then
    node -e "
      const http = require('http');
      const url = new URL(process.argv[1]);
      const req = http.get(url, (res) => {
        process.stdout.write(String(res.statusCode));
        res.resume();
      });
      req.on('error', () => process.stdout.write('000'));
    " "${url}" 2>/dev/null || printf '000'
    return 0
  fi
  printf '000'
}

health_code_ok() {
  local code="$1"
  [[ "${code}" =~ ^[0-9]+$ ]] || return 1
  (( 10#${code} >= 200 && 10#${code} < 400 ))
}

health_assert_http_ok() {
  local url="$1"
  local label="$2"
  local code
  code="$(health_http_code "${url}")"
  if ! health_code_ok "${code}"; then
    deploy_die "${label} failed (HTTP ${code})."
  fi
}

health_compose_health_status() {
  local service="$1"
  local cid
  cid="$(deploy_compose ps -q "${service}" 2>/dev/null | head -1 || true)"
  if [[ -z "${cid}" ]]; then
    printf 'missing'
    return 0
  fi
  docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${cid}" 2>/dev/null \
    || printf 'unknown'
}

health_wait_compose_service() {
  local service="$1"
  local timeout="${2:-120}"
  local deadline=$((SECONDS + timeout))
  until [[ "$(health_compose_health_status "${service}")" == "healthy" ]]; do
    if (( SECONDS > deadline )); then
      return 1
    fi
    sleep 3
  done
  return 0
}

health_wait_http() {
  local url="$1"
  local timeout="${2:-120}"
  local deadline=$((SECONDS + timeout))
  local code
  while (( SECONDS <= deadline )); do
    code="$(health_http_code "${url}")"
    if health_code_ok "${code}"; then
      return 0
    fi
    sleep 3
  done
  return 1
}

health_show_service_logs() {
  local service="$1"
  local lines="${2:-150}"
  deploy_warn "Last ${lines} log lines for ${service}:"
  deploy_compose logs --tail="${lines}" "${service}" 2>/dev/null || true
}

health_wait_service_or_http() {
  local service="$1"
  local http_url="$2"
  local timeout="${3:-120}"
  if health_wait_compose_service "${service}" "${timeout}"; then
    return 0
  fi
  deploy_warn "${service} Docker health label not green yet; trying HTTP (${http_url})..."
  health_wait_http "${http_url}" 30
}

health_smoke_production() {
  local bo_code
  local api_live_url api_ready_url bo_url

  api_live_url="$(health_api_url health/live)"
  api_ready_url="$(health_api_url health/ready)"
  bo_url="$(health_backoffice_url)"

  deploy_log "Waiting for API container health (up to 120s)..."
  if ! health_wait_service_or_http api "${api_live_url}" 120; then
    health_show_service_logs api
    deploy_die "API did not become healthy within 120s."
  fi

  health_assert_http_ok "${api_live_url}" "API /health/live"
  health_assert_http_ok "${api_ready_url}" "API /health/ready"

  deploy_log "Waiting for Backoffice container health (up to 120s)..."
  if ! health_wait_service_or_http backoffice "${bo_url}" 120; then
    health_show_service_logs backoffice
    deploy_die "Backoffice did not become healthy within 120s."
  fi

  deploy_log "Backoffice HTTP smoke check..."
  if ! health_wait_http "${bo_url}" 30; then
    bo_code="$(health_http_code "${bo_url}")"
    health_show_service_logs backoffice
    deploy_die "Backoffice HTTP check failed (status ${bo_code})."
  fi
}

health_any_unhealthy() {
  local service status
  for service in api backoffice; do
    status="$(health_compose_health_status "${service}")"
    if [[ "${status}" == "unhealthy" ]]; then
      return 0
    fi
  done
  return 1
}
