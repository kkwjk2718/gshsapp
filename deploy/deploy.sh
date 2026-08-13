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
TRUSTED_BACKUP_IMAGE_ID=""
TRUSTED_BACKUP_HAS_OPS="false"

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

remove_web_container() {
  local reason="$1"
  local -a web_container_ids=()
  local web_output named_output remaining_output
  if ! web_output="$(docker ps --all --quiet \
      --filter "label=com.docker.compose.project=$PROJECT_NAME" \
      --filter "label=com.docker.compose.service=web")"; then
    echo "Unable to enumerate Compose web containers; refusing deployment mutation." >&2
    return 1
  fi
  if [[ -n "$web_output" ]]; then mapfile -t web_container_ids <<<"$web_output"; fi

  if (( ${#web_container_ids[@]} > 1 )); then
    echo "Refusing to mutate multiple web containers for project $PROJECT_NAME." >&2
    return 1
  fi
  if (( ${#web_container_ids[@]} == 0 )); then
    if ! named_output="$(docker ps --all --quiet --filter "name=^/${CONTAINER_NAME}$")"; then
      echo "Unable to verify the configured container name is unused." >&2
      return 1
    fi
    if [[ -n "$named_output" ]]; then
      echo "Container $CONTAINER_NAME exists outside the expected Compose project/service labels." >&2
      return 1
    fi
    return 0
  fi

  local container_id="${web_container_ids[0]}"
  local container_name
  container_name="$(docker inspect --format '{{.Name}}' "$container_id")"
  if [[ "$container_name" != "/$CONTAINER_NAME" ]]; then
    echo "Compose web container name does not match the reviewed deployment identity." >&2
    return 1
  fi

  echo "Quiescing and removing web container for $reason..."
  docker stop --time 30 "$container_id"
  docker rm "$container_id"
  if ! remaining_output="$(docker ps --all --quiet --filter "id=$container_id")"; then
    echo "Unable to verify web container removal." >&2
    return 1
  fi
  if [[ -n "$remaining_output" ]]; then
    echo "Web container remained present after quiescence." >&2
    return 1
  fi
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
  TRUSTED_BACKUP_IMAGE_ID="$TRUSTED_BACKUP_IMAGE_ID" \
  TRUSTED_BACKUP_HAS_OPS="$TRUSTED_BACKUP_HAS_OPS" \
    "$DEPLOY_ROOT/predeployment-backup.sh"
}

capture_trusted_backup_runtime() {
  local -a web_container_ids=()
  local web_output named_output
  if ! web_output="$(docker ps --all --quiet \
      --filter "label=com.docker.compose.project=$PROJECT_NAME" \
      --filter "label=com.docker.compose.service=web")"; then
    echo "Unable to enumerate the current Compose web container." >&2
    return 1
  fi
  if [[ -n "$web_output" ]]; then mapfile -t web_container_ids <<<"$web_output"; fi
  if (( ${#web_container_ids[@]} > 1 )); then
    echo "Refusing to trust multiple web containers for pre-deployment backup." >&2
    return 1
  fi
  if (( ${#web_container_ids[@]} == 0 )); then
    if ! named_output="$(docker ps --all --quiet --filter "name=^/${CONTAINER_NAME}$")"; then
      echo "Unable to verify the configured container name is unused." >&2
      return 1
    fi
    if [[ -n "$named_output" ]]; then
      echo "Container $CONTAINER_NAME exists outside the expected Compose identity." >&2
      return 1
    fi
    return 0
  fi

  local container_id="${web_container_ids[0]}"
  local container_name running
  container_name="$(docker inspect --format '{{.Name}}' "$container_id")"
  running="$(docker inspect --format '{{.State.Running}}' "$container_id")"
  if [[ "$container_name" != "/$CONTAINER_NAME" ]]; then
    echo "The existing Compose web container has an unexpected name." >&2
    return 1
  fi
  if [[ "$running" != "true" ]]; then
    # A prior interrupted deployment may have already stopped the expected
    # writer. Do not execute that image; remove it and use the reviewed offline
    # host snapshot path so a retry remains recoverable.
    return 0
  fi
  TRUSTED_BACKUP_IMAGE_ID="$(docker inspect --format '{{.Image}}' "$container_id")"
  if [[ ! "$TRUSTED_BACKUP_IMAGE_ID" =~ ^sha256:[a-f0-9]{64}$ ]]; then
    echo "Existing web container has an invalid immutable image identity." >&2
    return 1
  fi
  if docker exec "$container_id" test -f /app/.next/ops/run-scheduled-backup.mjs; then
    TRUSTED_BACKUP_HAS_OPS="true"
  fi
}

deploy_main() {
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

capture_trusted_backup_runtime
remove_web_container "pre-migration"
create_predeployment_backup
write_deploy_env
echo "Applying reviewed database migrations..."
if ! compose run --rm --no-deps migrate; then
  echo "Migration failed after the legacy application was removed; service remains offline." >&2
  echo "Pre-migration application rollback is disabled after schema transition begins." >&2
  exit 1
fi

echo "Starting deployment..."
if ! compose up -d --remove-orphans --wait web; then
  echo "Container startup failed; removing the candidate and leaving maintenance mode." >&2
  if ! remove_web_container "candidate-failure"; then
    echo "WARNING: candidate container cleanup failed and requires immediate operator isolation." >&2
  fi
  echo "Pre-migration application rollback is disabled after schema transition begins." >&2
  exit 1
fi

if ! wait_for_health; then
  echo "Health check failed for $HEALTHCHECK_URL" >&2
  compose ps || true
  compose logs --tail=200 || true
  echo "Removing the unhealthy candidate and leaving the service offline for reviewed recovery." >&2
  if ! remove_web_container "candidate-failure"; then
    echo "WARNING: candidate container cleanup failed and requires immediate operator isolation." >&2
  fi
  echo "Pre-migration application rollback is disabled after schema transition begins." >&2
  exit 1
fi

echo "Deployment healthy. Current service status:"
compose ps
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  deploy_main "$@"
fi
