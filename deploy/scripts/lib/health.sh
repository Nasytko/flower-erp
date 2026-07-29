#!/usr/bin/env bash
# Container and HTTP readiness checks.

health_http_code() {
  local url="$1"
  curl -sf -o /dev/null -w '%{http_code}' "${url}" 2>/dev/null || printf '000'
}

health_code_ok() {
  local code="$1"
  [[ "${code}" =~ ^[0-9]+$ ]] || return 1
  (( 10#${code} >= 200 && 10#${code} < 400 ))
}

health_wait_compose_service() {
  local service="$1"
  local timeout="${2:-120}"
  local deadline=$((SECONDS + timeout))
  until deploy_compose ps "${service}" 2>/dev/null | grep -q "(healthy)"; do
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

health_smoke_production() {
  local api_port="${FLOWER_API_PORT:-4100}"
  local bo_port="${FLOWER_BACKOFFICE_PORT:-3100}"
  local bo_code

  deploy_log "Waiting for API container health (up to 120s)..."
  health_wait_compose_service api 120 \
    || { health_show_service_logs api; deploy_die "API did not become healthy within 120s."; }

  deploy_log "Waiting for Backoffice container health (up to 120s)..."
  health_wait_compose_service backoffice 120 \
    || { health_show_service_logs backoffice; deploy_die "Backoffice did not become healthy within 120s."; }

  curl -sf "http://127.0.0.1:${api_port}/api/v1/health/live" >/dev/null \
    || deploy_die "API /health/live failed."
  curl -sf "http://127.0.0.1:${api_port}/api/v1/health/ready" >/dev/null \
    || deploy_die "API /health/ready failed."

  deploy_log "Backoffice HTTP smoke check..."
  if ! health_wait_http "http://127.0.0.1:${bo_port}/health" 120; then
    bo_code="$(health_http_code "http://127.0.0.1:${bo_port}/health")"
    health_show_service_logs backoffice
    deploy_die "Backoffice HTTP check failed (status ${bo_code})."
  fi
}

health_any_unhealthy() {
  local unhealthy
  unhealthy="$(deploy_compose ps --format json 2>/dev/null | grep -c '"Health":"unhealthy"' || true)"
  [[ "${unhealthy}" -gt 0 ]]
}
