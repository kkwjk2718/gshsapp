#!/usr/bin/env bash
set -Eeuo pipefail

DEPLOY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_NAME="${PROJECT_NAME:-gshsapp}"
COMPOSE_FILE="${COMPOSE_FILE:-$DEPLOY_ROOT/compose.yml}"
DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-$DEPLOY_ROOT/.deploy.env}"
DATA_DIR="${DATA_DIR:-$DEPLOY_ROOT/data}"
BACKUP_DIR="${BACKUP_DIR:-$DEPLOY_ROOT/backup}"
DB_FILE="${DB_FILE:-$DATA_DIR/dev.db}"

IMAGE_TAG="${IMAGE_TAG:?IMAGE_TAG is required}"
DOCKER_IMAGE="${DOCKER_IMAGE:-kkwjk2718git/gshsapp}"
APP_VERSION="${APP_VERSION:-$IMAGE_TAG}"
HOST_BIND_IP="${HOST_BIND_IP:-0.0.0.0}"
HOST_PORT="${HOST_PORT:-1234}"
CONTAINER_NAME="${CONTAINER_NAME:-gshsapp-web}"
BACKUP_MAX_AGE_HOURS="${BACKUP_MAX_AGE_HOURS:-24}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-http://${HOST_BIND_IP}:${HOST_PORT}/api/health}"
SMOKE_TIMEOUT_SECONDS="${SMOKE_TIMEOUT_SECONDS:-90}"
SMOKE_INTERVAL_SECONDS="${SMOKE_INTERVAL_SECONDS:-3}"
PYTHON_BIN="${PYTHON_BIN:-python3}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

compose() {
  docker compose \
    --project-name "$PROJECT_NAME" \
    --env-file "$DEPLOY_ENV_FILE" \
    -f "$COMPOSE_FILE" \
    "$@"
}

write_deploy_env() {
  cat >"$DEPLOY_ENV_FILE" <<EOF
IMAGE_TAG=$IMAGE_TAG
DOCKER_IMAGE=$DOCKER_IMAGE
APP_VERSION=$APP_VERSION
HOST_BIND_IP=$HOST_BIND_IP
HOST_PORT=$HOST_PORT
CONTAINER_NAME=$CONTAINER_NAME
BACKUP_MAX_AGE_HOURS=$BACKUP_MAX_AGE_HOURS
EOF
}

wait_for_health() {
  local deadline=$((SECONDS + SMOKE_TIMEOUT_SECONDS))
  local health_json

  while (( SECONDS < deadline )); do
    if health_json="$(curl --silent --show-error --fail --location "$HEALTHCHECK_URL" 2>/dev/null)"; then
      if EXPECTED_VERSION="$APP_VERSION" HEALTH_JSON="$health_json" "$PYTHON_BIN" - <<'PY'
import json
import os
import sys

payload = json.loads(os.environ["HEALTH_JSON"])
if payload.get("ok") is not True:
    sys.exit(1)
if payload.get("service") != "gshsapp":
    sys.exit(1)
if payload.get("version") != os.environ["EXPECTED_VERSION"]:
    sys.exit(1)
PY
      then
        return 0
      fi
    fi

    sleep "$SMOKE_INTERVAL_SECONDS"
  done

  return 1
}

require_command docker
require_command curl
require_command "$PYTHON_BIN"

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin is required." >&2
  exit 1
fi

mkdir -p "$DATA_DIR" "$BACKUP_DIR"
write_deploy_env

if [[ -n "${DOCKERHUB_USERNAME:-}" && -n "${DOCKERHUB_TOKEN:-}" ]]; then
  echo "Logging into Docker Hub..."
  printf '%s' "$DOCKERHUB_TOKEN" | docker login -u "$DOCKERHUB_USERNAME" --password-stdin
fi

echo "Pulling image ${DOCKER_IMAGE}:${IMAGE_TAG}..."
docker pull "${DOCKER_IMAGE}:${IMAGE_TAG}"

if [[ -f "$DB_FILE" ]]; then
  timestamp="$(date '+%Y%m%d-%H%M%S')"
  backup_file="$BACKUP_DIR/dev.db.${timestamp}.bak"
  cp "$DB_FILE" "$backup_file"
  echo "Created SQLite backup at $backup_file"
fi

echo "Starting deployment..."
compose up -d --remove-orphans

if ! wait_for_health; then
  echo "Health check failed for $HEALTHCHECK_URL" >&2
  compose ps || true
  compose logs --tail=200 || true
  exit 1
fi

echo "Deployment healthy. Current service status:"
compose ps
