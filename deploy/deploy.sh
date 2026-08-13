#!/usr/bin/env bash
set -Eeuo pipefail

DEPLOY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy-policy.sh
source "$DEPLOY_ROOT/deploy-policy.sh"
PROJECT_NAME="${PROJECT_NAME:-gshsapp}"
COMPOSE_FILE="${COMPOSE_FILE:-$DEPLOY_ROOT/compose.yml}"
DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-$DEPLOY_ROOT/.deploy.env}"
APP_ENV_FILE="${APP_ENV_FILE:-$DEPLOY_ROOT/.env}"
DATA_DIR="${DATA_DIR:-$DEPLOY_ROOT/data}"
BACKUP_DIR="${BACKUP_DIR:-$DEPLOY_ROOT/backup}"
DB_FILE="${DB_FILE:-$DATA_DIR/dev.db}"

RAW_HOST_BIND_IP="${HOST_BIND_IP:-}"
EXPECTED_APP_ORIGIN="${EXPECTED_APP_ORIGIN:?EXPECTED_APP_ORIGIN is required}"
IMAGE_TAG="${IMAGE_TAG:?IMAGE_TAG is required}"
IMAGE_DIGEST="${IMAGE_DIGEST:?IMAGE_DIGEST is required}"
DOCKER_IMAGE="${DOCKER_IMAGE:-kkwjk2718git/gshsapp}"
APP_VERSION="${APP_VERSION:-$IMAGE_TAG}"
HOST_BIND_IP="${HOST_BIND_IP:-127.0.0.1}"
HOST_PORT="${HOST_PORT:-1234}"
CONTAINER_NAME="${CONTAINER_NAME:-gshsapp-web}"
BACKUP_MAX_AGE_HOURS="${BACKUP_MAX_AGE_HOURS:-24}"
HEALTHCHECK_HOST="$HOST_BIND_IP"
case "$HEALTHCHECK_HOST" in
  0.0.0.0|::|"[::]") HEALTHCHECK_HOST=127.0.0.1 ;;
esac
HEALTHCHECK_URL="${HEALTHCHECK_URL:-http://${HEALTHCHECK_HOST}:${HOST_PORT}/api/health}"
SMOKE_TIMEOUT_SECONDS="${SMOKE_TIMEOUT_SECONDS:-90}"
SMOKE_INTERVAL_SECONDS="${SMOKE_INTERVAL_SECONDS:-3}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
TEMP_DOCKER_CONFIG=""

cleanup_deploy_secrets() {
  if [[ -n "$TEMP_DOCKER_CONFIG" && "$TEMP_DOCKER_CONFIG" == "$DEPLOY_ROOT"/.docker-config.* &&
        -d "$TEMP_DOCKER_CONFIG" && ! -L "$TEMP_DOCKER_CONFIG" ]]; then
    rm -rf -- "$TEMP_DOCKER_CONFIG"
  fi
}
trap cleanup_deploy_secrets EXIT

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
  local temporary_env
  temporary_env="$(mktemp "$DEPLOY_ROOT/.deploy.env.new.XXXXXX")"
  chmod 600 "$temporary_env"
  cat >"$temporary_env" <<EOF
IMAGE_TAG=$IMAGE_TAG
IMAGE_DIGEST=$IMAGE_DIGEST
DOCKER_IMAGE=$DOCKER_IMAGE
APP_VERSION=$APP_VERSION
HOST_BIND_IP=$HOST_BIND_IP
HOST_PORT=$HOST_PORT
CONTAINER_NAME=$CONTAINER_NAME
BACKUP_MAX_AGE_HOURS=$BACKUP_MAX_AGE_HOURS
EOF
  mv -f "$temporary_env" "$DEPLOY_ENV_FILE"
}

read_deploy_env_value() {
  local key="$1"
  local file="$2"
  sed -n "s/^${key}=//p" "$file" | tail -n 1
}

rollback_application() {
  if [[ -z "${previous_env:-}" || ! -f "$previous_env" ]]; then
    echo "No digest-pinned previous deployment is available for automatic application rollback." >&2
    return 1
  fi

  local old_tag old_digest old_image old_version old_bind old_port old_container old_backup_age
  old_tag="$(read_deploy_env_value IMAGE_TAG "$previous_env")"
  old_digest="$(read_deploy_env_value IMAGE_DIGEST "$previous_env")"
  old_image="$(read_deploy_env_value DOCKER_IMAGE "$previous_env")"
  old_version="$(read_deploy_env_value APP_VERSION "$previous_env")"
  old_bind="$(read_deploy_env_value HOST_BIND_IP "$previous_env")"
  old_port="$(read_deploy_env_value HOST_PORT "$previous_env")"
  old_container="$(read_deploy_env_value CONTAINER_NAME "$previous_env")"
  old_backup_age="$(read_deploy_env_value BACKUP_MAX_AGE_HOURS "$previous_env")"

  IMAGE_TAG="$old_tag" IMAGE_DIGEST="$old_digest" DOCKER_IMAGE="$old_image" APP_VERSION="$old_version" \
  HOST_BIND_IP="$old_bind" HOST_PORT="$old_port" CONTAINER_NAME="$old_container" \
  BACKUP_MAX_AGE_HOURS="$old_backup_age"
  export IMAGE_TAG IMAGE_DIGEST DOCKER_IMAGE APP_VERSION HOST_BIND_IP HOST_PORT CONTAINER_NAME BACKUP_MAX_AGE_HOURS
  validate_deploy_identity
  validate_bind_policy
  cp "$previous_env" "$DEPLOY_ENV_FILE"
  compose pull web
  compose up -d --remove-orphans --wait web
}

wait_for_health() {
  local deadline=$((SECONDS + SMOKE_TIMEOUT_SECONDS))
  local health_json

  while (( SECONDS < deadline )); do
    if health_json="$(curl --silent --show-error --fail --location "$HEALTHCHECK_URL" 2>/dev/null)"; then
      if EXPECTED_VERSION="$APP_VERSION" EXPECTED_IMAGE_DIGEST="$IMAGE_DIGEST" HEALTH_JSON="$health_json" "$PYTHON_BIN" - <<'PY'
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
if payload.get("imageDigest") != os.environ["EXPECTED_IMAGE_DIGEST"]:
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

create_predeployment_backup() {
  DATA_DIR="$DATA_DIR" \
  BACKUP_DIR="$BACKUP_DIR" \
  DB_FILE="$DB_FILE" \
  CONTAINER_NAME="$CONTAINER_NAME" \
  PYTHON_BIN="$PYTHON_BIN" \
  DOCKER_IMAGE="$DOCKER_IMAGE" \
  IMAGE_DIGEST="$IMAGE_DIGEST" \
    "$DEPLOY_ROOT/predeployment-backup.sh"
}

require_command docker
require_command curl
require_command "$PYTHON_BIN"
require_command flock
require_command stat
require_command id
RUNTIME_ENV_TRUST_ROOT="$DEPLOY_ROOT"
export RUNTIME_ENV_TRUST_ROOT
validate_runtime_env_file "$APP_ENV_FILE"
validate_deploy_identity
if [[ "${REQUIRE_EXPLICIT_BIND:-false}" == "true" && -z "$RAW_HOST_BIND_IP" ]]; then
  echo "HOST_BIND_IP must be configured explicitly for this deployment environment." >&2
  exit 1
fi
validate_bind_policy

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin is required." >&2
  exit 1
fi

mkdir -p "$DATA_DIR" "$BACKUP_DIR"
chmod 700 "$DATA_DIR" "$BACKUP_DIR"
exec 9>"$DEPLOY_ROOT/.deploy.lock"
if ! flock -n 9; then
  echo "Another deployment or backup operation is already running." >&2
  exit 1
fi
previous_env=""
had_previous_env=false
if [[ -f "$DEPLOY_ENV_FILE" ]]; then
  had_previous_env=true
  previous_env="$(mktemp "$DEPLOY_ROOT/.deploy.env.previous.XXXXXX")"
  cp --preserve=mode "$DEPLOY_ENV_FILE" "$previous_env"
fi

if [[ -n "${DOCKERHUB_USERNAME:-}" && -n "${DOCKERHUB_TOKEN:-}" ]]; then
  echo "Logging into Docker Hub..."
  TEMP_DOCKER_CONFIG="$(mktemp -d "$DEPLOY_ROOT/.docker-config.XXXXXX")"
  chmod 700 "$TEMP_DOCKER_CONFIG"
  DOCKER_CONFIG="$TEMP_DOCKER_CONFIG"
  export DOCKER_CONFIG
  printf '%s' "$DOCKERHUB_TOKEN" | docker login -u "$DOCKERHUB_USERNAME" --password-stdin
fi

image_ref="${DOCKER_IMAGE}@${IMAGE_DIGEST}"
echo "Pulling immutable image ${image_ref}..."
docker pull "$image_ref"

pulled_digests="$(docker image inspect --format '{{join .RepoDigests "\n"}}' "$image_ref")"
if ! grep -Fxq "${DOCKER_IMAGE}@${IMAGE_DIGEST}" <<<"$pulled_digests"; then
  echo "Pulled image did not verify against IMAGE_DIGEST." >&2
  exit 1
fi
image_revision="$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$image_ref")"
if [[ "$image_revision" != "${IMAGE_TAG#sha-}" ]]; then
  echo "Image revision label does not match IMAGE_TAG." >&2
  exit 1
fi

create_predeployment_backup

write_deploy_env
echo "Applying reviewed database migrations..."
if ! compose run --rm --no-deps migrate; then
  echo "Migration failed; the running application was not replaced." >&2
  if [[ "$had_previous_env" == "true" ]]; then
    cp "$previous_env" "$DEPLOY_ENV_FILE"
  else
    rm -f -- "$DEPLOY_ENV_FILE"
  fi
  exit 1
fi

echo "Starting deployment..."
if ! compose up -d --remove-orphans --wait web; then
  echo "Container startup failed; attempting application rollback." >&2
  rollback_application || true
  exit 1
fi

if ! wait_for_health; then
  echo "Health check failed for $HEALTHCHECK_URL" >&2
  compose ps || true
  compose logs --tail=200 || true
  echo "Restoring last known-good application image (database is not auto-restored)..." >&2
  rollback_application || true
  exit 1
fi

rm -f -- "$previous_env"

echo "Deployment healthy. Current service status:"
compose ps
