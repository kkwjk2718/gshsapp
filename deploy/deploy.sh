#!/usr/bin/env bash
set -Eeuo pipefail

PATH=/usr/sbin:/usr/bin:/sbin:/bin
LC_ALL=C
export PATH LC_ALL
IFS=$' \t\n'
umask 077

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  CONTROL_ROOT=/usr/local/lib/gshsapp-operations
  resolved_self="$(readlink -f -- "${BASH_SOURCE[0]}")" || { echo "Deployment control path cannot be resolved." >&2; exit 1; }
  [[ "$resolved_self" == "$CONTROL_ROOT/deploy.sh" ]] || { echo "Run only the installed authenticated deployment control." >&2; exit 1; }
  [[ -f "$resolved_self" && ! -L "$resolved_self" && "$(stat -c '%u:%g:%a:%h' "$resolved_self")" == "0:0:400:1" ]] || { echo "Installed deployment control is unsafe." >&2; exit 1; }
  [[ "$(id -u)" == "0" ]] || { echo "Deployment must run from the trusted root console." >&2; exit 1; }
  if [[ -e /run/lock/gshsapp || -L /run/lock/gshsapp ]]; then
    [[ -d /run/lock/gshsapp && ! -L /run/lock/gshsapp &&
       "$(stat -c '%u:%g:%a' /run/lock/gshsapp)" == "0:0:700" ]] || {
      echo "The shared lifecycle lock directory is unsafe." >&2
      exit 1
    }
  else
    install -d -o root -g root -m 0700 /run/lock/gshsapp
  fi
  if [[ -e /run/lock/gshsapp/lifecycle.lock || -L /run/lock/gshsapp/lifecycle.lock ]]; then
    [[ -f /run/lock/gshsapp/lifecycle.lock && ! -L /run/lock/gshsapp/lifecycle.lock &&
       "$(stat -c '%u:%g:%a:%h' /run/lock/gshsapp/lifecycle.lock)" == "0:0:600:1" ]] || {
      echo "The shared lifecycle lock file is unsafe." >&2
      exit 1
    }
  fi
  exec 9>/run/lock/gshsapp/lifecycle.lock
  chown root:root /run/lock/gshsapp/lifecycle.lock
  chmod 0600 /run/lock/gshsapp/lifecycle.lock
  [[ -f /run/lock/gshsapp/lifecycle.lock && ! -L /run/lock/gshsapp/lifecycle.lock &&
     "$(stat -c '%u:%g:%a:%h' /run/lock/gshsapp/lifecycle.lock)" == "0:0:600:1" ]] || {
    echo "The shared lifecycle lock file could not be secured." >&2
    exit 1
  }
  if ! flock -n 9; then
    echo "Another deployment, backup, restore, import, or control installation is already running." >&2
    exit 1
  fi
  export LIFECYCLE_LOCK_HELD=1
else
  CONTROL_ROOT="${CONTROL_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
fi
DEPLOY_ROOT="${DEPLOY_ROOT:-/opt/gshsapp}"
# shellcheck source=deploy-policy.sh
source "$CONTROL_ROOT/deploy-policy.sh"
PROJECT_NAME="${PROJECT_NAME:-gshsapp}"
COMPOSE_FILE="${COMPOSE_FILE:-$CONTROL_ROOT/compose.yml}"
DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-$DEPLOY_ROOT/.deploy.env}"
APP_ENV_FILE="${APP_ENV_FILE:-$DEPLOY_ROOT/.env}"
DATA_DIR="${DATA_DIR:-$DEPLOY_ROOT/data}"
BACKUP_DIR="${BACKUP_DIR:-$DEPLOY_ROOT/root-backup}"
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
OFFSITE_DIR="${OFFSITE_DIR:?OFFSITE_DIR is required}"
OFFSITE_RECEIPT_DIR="$OFFSITE_DIR/.gshsapp-receipts"
OFFSITE_MOUNT_SOURCE="${OFFSITE_MOUNT_SOURCE:?OFFSITE_MOUNT_SOURCE is required}"
OFFSITE_FSTYPE="${OFFSITE_FSTYPE:?OFFSITE_FSTYPE is required}"
OFFSITE_REQUIRED_OPTIONS="${OFFSITE_REQUIRED_OPTIONS:-rw,nodev,nosuid,noexec}"
PHASE_FILE="$DEPLOY_ROOT/deployment-phase.json"
OLD_WEB_ID=""
OLD_WEB_IMAGE_ID=""
OLD_WEB_CONFIG_IMAGE=""
OLD_WEB_RESTART_POLICY=""
OLD_WEB_WAS_RUNNING=false
SCHEMA_TRANSITION_STARTED=false
CANDIDATE_IMAGE_ID=""
CANDIDATE_WEB_ID=""

cleanup_deploy_secrets() {
  local status=$?
  if [[ "$status" -ne 0 && "$SCHEMA_TRANSITION_STARTED" != "true" && "$OLD_WEB_WAS_RUNNING" == "true" && -n "$OLD_WEB_ID" ]]; then
    if LIFECYCLE_LOCK_HELD=1 DEPLOY_ROOT="$DEPLOY_ROOT" \
        PHASE_FILE="$PHASE_FILE" PYTHON_BIN="$PYTHON_BIN" \
        /bin/bash "$CONTROL_ROOT/recover-deployment-writer.sh" >/dev/null 2>&1; then
      local recovered_id recovered_image recovered_config recovered_running
      recovered_id="$(docker inspect --format '{{.Id}}' "$OLD_WEB_ID" 2>/dev/null || true)"
      recovered_image="$(docker inspect --format '{{.Image}}' "$OLD_WEB_ID" 2>/dev/null || true)"
      recovered_config="$(docker inspect --format '{{.Config.Image}}' "$OLD_WEB_ID" 2>/dev/null || true)"
      recovered_running="$(docker inspect --format '{{.State.Running}}' "$OLD_WEB_ID" 2>/dev/null || true)"
      if [[ "$recovered_id" == "$OLD_WEB_ID" && "$recovered_image" == "$OLD_WEB_IMAGE_ID" &&
            "$recovered_config" == "$OLD_WEB_CONFIG_IMAGE" && "$recovered_running" == "true" ]]; then
        OLD_WEB_WAS_RUNNING=false
        write_phase "pre-migration-rollback" || true
      elif [[ "$recovered_id" == "$OLD_WEB_ID" && "$recovered_image" == "$OLD_WEB_IMAGE_ID" &&
              "$recovered_config" == "$OLD_WEB_CONFIG_IMAGE" && "$recovered_running" == "false" ]]; then
        # The durable schema-transition marker won the race with the shell
        # flag. The recovery helper correctly refused to restart legacy code.
        SCHEMA_TRANSITION_STARTED=true
        OLD_WEB_WAS_RUNNING=false
      else
        echo "CRITICAL: preserved application identity changed during failure recovery." >&2
      fi
    else
      echo "CRITICAL: pre-migration failure could not restart the preserved application container." >&2
    fi
  elif [[ "$status" -ne 0 && "$SCHEMA_TRANSITION_STARTED" == "true" ]]; then
    if ! LIFECYCLE_LOCK_HELD=1 DEPLOY_ROOT="$DEPLOY_ROOT" \
        PHASE_FILE="$PHASE_FILE" PYTHON_BIN="$PYTHON_BIN" \
        /bin/bash "$CONTROL_ROOT/recover-deployment-writer.sh" >/dev/null 2>&1; then
      echo "CRITICAL: post-schema deployment state could not be reconciled; service remains quarantined." >&2
    fi
  fi
  return "$status"
}
trap cleanup_deploy_secrets EXIT

write_phase() {
  local phase="$1" container_id="${2:-}" image_id="${3:-}" config_image="${4:-}" temporary phase_version
  [[ "$phase" =~ ^[a-z0-9-]+$ ]] || return 1
  if [[ "$phase" == "candidate-healthy-pending-promotion" ]]; then
    [[ "$container_id" =~ ^[0-9a-f]{64}$ && "$image_id" =~ ^sha256:[0-9a-f]{64}$ ]] || return 1
    [[ "$config_image" =~ ^[A-Za-z0-9][A-Za-z0-9._/@:+-]{0,254}$ ]] || return 1
    phase_version=2
  else
    [[ -z "$container_id" && -z "$image_id" && -z "$config_image" ]] || return 1
    phase_version=1
  fi
  temporary="$(mktemp "$DEPLOY_ROOT/.deployment-phase.XXXXXX")"
  chmod 0600 "$temporary"
  PHASE="$phase" PHASE_VERSION="$phase_version" IMAGE_TAG_VALUE="$IMAGE_TAG" IMAGE_DIGEST_VALUE="$IMAGE_DIGEST" \
    CONTAINER_ID_VALUE="$container_id" IMAGE_ID_VALUE="$image_id" CONFIG_IMAGE_VALUE="$config_image" \
    "$PYTHON_BIN" - "$temporary" <<'PY'
import datetime
import json
import os
import sys

with open(sys.argv[1], "w", encoding="utf-8", newline="\n") as output:
    value = {
        "format": "gshsapp-deployment-phase",
        "version": int(os.environ["PHASE_VERSION"]),
        "phase": os.environ["PHASE"],
        "imageTag": os.environ["IMAGE_TAG_VALUE"],
        "imageDigest": os.environ["IMAGE_DIGEST_VALUE"],
        "updatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
    }
    if value["version"] == 2:
        value.update({
            "containerId": os.environ["CONTAINER_ID_VALUE"],
            "imageId": os.environ["IMAGE_ID_VALUE"],
            "configImage": os.environ["CONFIG_IMAGE_VALUE"],
        })
    json.dump(value, output, separators=(",", ":"))
    output.write("\n")
    output.flush()
    os.fsync(output.fileno())
PY
  mv -fT "$temporary" "$PHASE_FILE"
  sync -d "$PHASE_FILE"
  sync -d "$DEPLOY_ROOT"
}

write_restart_intent() {
  local container_id="$1" image_id="$2" config_hash="$3" restart_policy="$4"
  local temporary actual_id actual_image actual_config current_restart_policy
  actual_id="$(docker inspect --format '{{.Id}}' "$container_id")" || return 1
  actual_image="$(docker inspect --format '{{.Image}}' "$container_id")" || return 1
  actual_config="$(docker inspect --format '{{.Config.Image}}' "$container_id")" || return 1
  current_restart_policy="$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$container_id")" || return 1
  [[ "$actual_id" == "$container_id" && "$actual_id" =~ ^[0-9a-f]{64}$ ]] || return 1
  [[ "$actual_image" == "$image_id" && "$actual_config" == "$config_hash" ]] || return 1
  [[ "$current_restart_policy" == "$restart_policy" ]] || return 1
  [[ "$image_id" =~ ^sha256:[0-9a-f]{64}$ ]] || return 1
  [[ "$config_hash" =~ ^[A-Za-z0-9][A-Za-z0-9._/@:+-]{0,254}$ ]] || return 1
  [[ "$restart_policy" =~ ^(no|always|unless-stopped)$ ]] || return 1
  temporary="$(mktemp "$DEPLOY_ROOT/.deployment-restart.XXXXXX")"
  CONTAINER_ID="$container_id" IMAGE_ID="$image_id" CONFIG_IMAGE="$config_hash" RESTART_POLICY="$restart_policy" "$PYTHON_BIN" - "$temporary" <<'PY'
import datetime,json,os,sys
with open(sys.argv[1],"w",encoding="utf-8",newline="\n") as output:
    json.dump({"format":"gshsapp-restart-intent","version":2,"phase":"restart-old-on-failure","containerId":os.environ["CONTAINER_ID"],"imageId":os.environ["IMAGE_ID"],"configImage":os.environ["CONFIG_IMAGE"],"restartPolicy":os.environ["RESTART_POLICY"],"createdAt":datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00","Z")},output,separators=(",",":"));output.write("\n");output.flush();os.fsync(output.fileno())
PY
  chmod 0600 "$temporary"
  mv -fT "$temporary" "$DEPLOY_ROOT/deployment-restart.json"
  sync -d "$DEPLOY_ROOT/deployment-restart.json"
  sync -d "$DEPLOY_ROOT"
}

clear_restart_intent() {
  rm -f -- "$DEPLOY_ROOT/deployment-restart.json"
  sync -d "$DEPLOY_ROOT"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

compose() {
  docker compose \
    --project-name "$PROJECT_NAME" \
    --project-directory "$DEPLOY_ROOT" \
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

find_web_container() {
  local -a web_container_ids=()
  local web_output named_output
  if ! web_output="$(docker ps --all --no-trunc --quiet \
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
    if ! named_output="$(docker ps --all --no-trunc --quiet --filter "name=^/${CONTAINER_NAME}$")"; then
      echo "Unable to verify the configured container name is unused." >&2
      return 1
    fi
    if [[ -n "$named_output" ]]; then
      echo "Container $CONTAINER_NAME exists outside the expected Compose project/service labels." >&2
      return 1
    fi
    printf '%s' ""
    return 0
  fi

  local container_id="${web_container_ids[0]}"
  local actual_id container_name
  [[ "$container_id" =~ ^[0-9a-f]{64}$ ]] || {
    echo "Docker returned a non-exact Compose web container identity." >&2
    return 1
  }
  actual_id="$(docker inspect --format '{{.Id}}' "$container_id")" || return 1
  container_name="$(docker inspect --format '{{.Name}}' "$container_id")"
  if [[ "$actual_id" != "$container_id" || "$container_name" != "/$CONTAINER_NAME" ]]; then
    echo "Compose web container name does not match the reviewed deployment identity." >&2
    return 1
  fi

  printf '%s\n' "$container_id"
}

quiesce_web_container() {
  if ! OLD_WEB_ID="$(find_web_container)"; then
    return 1
  fi
  [[ -n "$OLD_WEB_ID" ]] || return 0
  local actual_id running remaining_output named_running_output
  actual_id="$(docker inspect --format '{{.Id}}' "$OLD_WEB_ID")" || return 1
  OLD_WEB_IMAGE_ID="$(docker inspect --format '{{.Image}}' "$OLD_WEB_ID")" || return 1
  OLD_WEB_CONFIG_IMAGE="$(docker inspect --format '{{.Config.Image}}' "$OLD_WEB_ID")" || return 1
  OLD_WEB_RESTART_POLICY="$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$OLD_WEB_ID")" || return 1
  running="$(docker inspect --format '{{.State.Running}}' "$OLD_WEB_ID")" || return 1
  [[ "$actual_id" == "$OLD_WEB_ID" && "$OLD_WEB_ID" =~ ^[0-9a-f]{64}$ ]] || return 1
  [[ "$OLD_WEB_IMAGE_ID" =~ ^sha256:[0-9a-f]{64}$ ]] || return 1
  [[ "$OLD_WEB_CONFIG_IMAGE" =~ ^[A-Za-z0-9][A-Za-z0-9._/@:+-]{0,254}$ ]] || return 1
  [[ "$OLD_WEB_RESTART_POLICY" =~ ^(no|always|unless-stopped)$ ]] || return 1
  if [[ "$running" == "true" ]]; then
    echo "Quiescing the current application writer..."
    OLD_WEB_WAS_RUNNING=true
    write_restart_intent "$OLD_WEB_ID" "$OLD_WEB_IMAGE_ID" "$OLD_WEB_CONFIG_IMAGE" "$OLD_WEB_RESTART_POLICY"
    docker update --restart=no "$OLD_WEB_ID" >/dev/null || return 1
    [[ "$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$OLD_WEB_ID")" == "no" ]] || return 1
    docker stop --time 30 "$OLD_WEB_ID" >/dev/null
  elif [[ "$running" == "false" ]]; then
    if [[ "$OLD_WEB_RESTART_POLICY" != "no" ]]; then
      docker update --restart=no "$OLD_WEB_ID" >/dev/null || return 1
      [[ "$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$OLD_WEB_ID")" == "no" ]] || return 1
    fi
  else
    echo "Current application writer state is invalid." >&2
    return 1
  fi
  if ! remaining_output="$(docker ps --no-trunc --quiet \
      --filter "label=com.docker.compose.project=$PROJECT_NAME" \
      --filter "label=com.docker.compose.service=web")"; then
    echo "Unable to verify that all Compose application writers stopped." >&2
    return 1
  fi
  if ! named_running_output="$(docker ps --no-trunc --quiet --filter "name=^/${CONTAINER_NAME}$")"; then
    echo "Unable to verify that the named application writer stopped." >&2
    return 1
  fi
  running="$(docker inspect --format '{{.State.Running}}' "$OLD_WEB_ID")" || return 1
  if [[ -n "$remaining_output" || -n "$named_running_output" || "$running" != "false" ]]; then
    echo "Application writer remained active after quiescence." >&2
    return 1
  fi
}

remove_preserved_web_container() {
  [[ -n "$OLD_WEB_ID" ]] || return 0
  local actual_id actual_image actual_config actual_running actual_name actual_restart_policy remaining_output
  actual_id="$(docker inspect --format '{{.Id}}' "$OLD_WEB_ID")" || return 1
  actual_image="$(docker inspect --format '{{.Image}}' "$OLD_WEB_ID")" || return 1
  actual_config="$(docker inspect --format '{{.Config.Image}}' "$OLD_WEB_ID")" || return 1
  actual_running="$(docker inspect --format '{{.State.Running}}' "$OLD_WEB_ID")" || return 1
  actual_name="$(docker inspect --format '{{.Name}}' "$OLD_WEB_ID")" || return 1
  actual_restart_policy="$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$OLD_WEB_ID")" || return 1
  if [[ "$actual_id" != "$OLD_WEB_ID" || "$actual_image" != "$OLD_WEB_IMAGE_ID" ||
        "$actual_config" != "$OLD_WEB_CONFIG_IMAGE" || "$actual_running" != "false" ||
        "$actual_name" != "/$CONTAINER_NAME" || "$actual_restart_policy" != "no" ]]; then
    echo "The preserved web container identity changed before cutover." >&2
    return 1
  fi
  docker rm "$OLD_WEB_ID" >/dev/null
  remaining_output="$(docker ps --all --no-trunc --quiet --filter "id=$OLD_WEB_ID")" || return 1
  [[ -z "$remaining_output" ]] || { echo "Preserved web container remained after cutover." >&2; return 1; }
}

wait_for_health() {
  local deadline=$((SECONDS + SMOKE_TIMEOUT_SECONDS))
  local health_json remaining request_timeout

  while (( SECONDS < deadline )); do
    remaining=$((deadline - SECONDS))
    (( remaining > 0 )) || break
    request_timeout=$((remaining < 10 ? remaining : 10))
    if health_json="$(curl --disable --silent --show-error --fail --max-redirs 0 --connect-timeout 3 --max-time "$request_timeout" "$HEALTHCHECK_URL" 2>/dev/null | /usr/bin/head -c 16385)" &&
       (( ${#health_json} <= 16384 )); then
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
  PROJECT_NAME="$PROJECT_NAME" \
  CONTAINER_NAME="$CONTAINER_NAME" \
  PYTHON_BIN="$PYTHON_BIN" \
  DOCKER_IMAGE="$DOCKER_IMAGE" \
  IMAGE_DIGEST="$IMAGE_DIGEST" \
  OFFSITE_DIR="$OFFSITE_DIR" \
  OFFSITE_RECEIPT_DIR="$OFFSITE_RECEIPT_DIR" \
  OFFSITE_MOUNT_SOURCE="$OFFSITE_MOUNT_SOURCE" \
  OFFSITE_FSTYPE="$OFFSITE_FSTYPE" \
  OFFSITE_REQUIRED_OPTIONS="$OFFSITE_REQUIRED_OPTIONS" \
  PRESERVED_WEB_ID="$OLD_WEB_ID" \
  PRESERVED_WEB_IMAGE_ID="$OLD_WEB_IMAGE_ID" \
  PRESERVED_WEB_CONFIG_IMAGE="$OLD_WEB_CONFIG_IMAGE" \
  CONTROL_ROOT="$CONTROL_ROOT" \
  DEPLOY_ROOT="$DEPLOY_ROOT" \
    /bin/bash "$CONTROL_ROOT/predeployment-backup.sh"
}

assert_candidate_network() {
  local container_id="$1" expected_network_id networks_json
  [[ "$container_id" =~ ^[0-9a-f]{64}$ ]] || return 1
  expected_network_id="$(docker network inspect --format '{{.Id}}' gshsapp-web)" || return 1
  [[ "$expected_network_id" =~ ^[0-9a-f]{64}$ ]] || return 1
  networks_json="$(docker inspect --format '{{json .NetworkSettings.Networks}}' "$container_id")" || return 1
  NETWORKS_JSON="$networks_json" EXPECTED_NETWORK_ID="$expected_network_id" "$PYTHON_BIN" - <<'PY'
import json, os, sys
try:
    value = json.loads(os.environ["NETWORKS_JSON"])
except Exception:
    raise SystemExit(1)
if set(value) != {"gshsapp-web"} or not isinstance(value["gshsapp-web"], dict):
    raise SystemExit(1)
if value["gshsapp-web"].get("NetworkID") != os.environ["EXPECTED_NETWORK_ID"]:
    raise SystemExit(1)
PY
}

record_candidate_promotion() {
  local actual_id actual_image actual_config actual_running actual_name actual_policy
  CANDIDATE_WEB_ID="$(find_web_container)" || return 1
  [[ "$CANDIDATE_WEB_ID" =~ ^[0-9a-f]{64}$ ]] || return 1
  actual_id="$(docker inspect --format '{{.Id}}' "$CANDIDATE_WEB_ID")" || return 1
  actual_image="$(docker inspect --format '{{.Image}}' "$CANDIDATE_WEB_ID")" || return 1
  actual_config="$(docker inspect --format '{{.Config.Image}}' "$CANDIDATE_WEB_ID")" || return 1
  actual_running="$(docker inspect --format '{{.State.Running}}' "$CANDIDATE_WEB_ID")" || return 1
  actual_name="$(docker inspect --format '{{.Name}}' "$CANDIDATE_WEB_ID")" || return 1
  actual_policy="$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$CANDIDATE_WEB_ID")" || return 1
  assert_candidate_network "$CANDIDATE_WEB_ID" || return 1
  if [[ "$actual_id" != "$CANDIDATE_WEB_ID" || "$actual_image" != "$CANDIDATE_IMAGE_ID" ||
        "$actual_config" != "${DOCKER_IMAGE}@${IMAGE_DIGEST}" || "$actual_running" != "true" ||
        "$actual_name" != "/$CONTAINER_NAME" || "$actual_policy" != "no" ]]; then
    echo "Candidate identity or quarantine policy changed before durable promotion." >&2
    return 1
  fi
  write_phase "candidate-healthy-pending-promotion" \
    "$CANDIDATE_WEB_ID" "$CANDIDATE_IMAGE_ID" "${DOCKER_IMAGE}@${IMAGE_DIGEST}"
}

promote_candidate_restart_policy() {
  local actual_id actual_image actual_config actual_running actual_name actual_policy
  [[ "$CANDIDATE_WEB_ID" =~ ^[0-9a-f]{64}$ ]] || return 1
  actual_id="$(docker inspect --format '{{.Id}}' "$CANDIDATE_WEB_ID")" || return 1
  actual_image="$(docker inspect --format '{{.Image}}' "$CANDIDATE_WEB_ID")" || return 1
  actual_config="$(docker inspect --format '{{.Config.Image}}' "$CANDIDATE_WEB_ID")" || return 1
  actual_running="$(docker inspect --format '{{.State.Running}}' "$CANDIDATE_WEB_ID")" || return 1
  actual_name="$(docker inspect --format '{{.Name}}' "$CANDIDATE_WEB_ID")" || return 1
  actual_policy="$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$CANDIDATE_WEB_ID")" || return 1
  assert_candidate_network "$CANDIDATE_WEB_ID" || return 1
  if [[ "$actual_id" != "$CANDIDATE_WEB_ID" || "$actual_image" != "$CANDIDATE_IMAGE_ID" ||
        "$actual_config" != "${DOCKER_IMAGE}@${IMAGE_DIGEST}" || "$actual_running" != "true" ||
        "$actual_name" != "/$CONTAINER_NAME" || "$actual_policy" != "no" ]]; then
    return 1
  fi
  docker update --restart=always "$CANDIDATE_WEB_ID" >/dev/null || return 1
  actual_id="$(docker inspect --format '{{.Id}}' "$CANDIDATE_WEB_ID")" || return 1
  actual_image="$(docker inspect --format '{{.Image}}' "$CANDIDATE_WEB_ID")" || return 1
  actual_config="$(docker inspect --format '{{.Config.Image}}' "$CANDIDATE_WEB_ID")" || return 1
  actual_running="$(docker inspect --format '{{.State.Running}}' "$CANDIDATE_WEB_ID")" || return 1
  actual_policy="$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$CANDIDATE_WEB_ID")" || return 1
  assert_candidate_network "$CANDIDATE_WEB_ID" || return 1
  [[ "$actual_id" == "$CANDIDATE_WEB_ID" && "$actual_image" == "$CANDIDATE_IMAGE_ID" &&
     "$actual_config" == "${DOCKER_IMAGE}@${IMAGE_DIGEST}" && "$actual_running" == "true" &&
     "$actual_policy" == "always" ]]
}

begin_schema_transition() {
  # This durable phase is the point of no return. Recovery helpers must never
  # restart the legacy writer once this marker has reached stable storage.
  write_phase "schema-transition" || return 1
  SCHEMA_TRANSITION_STARTED=true
  clear_restart_intent || return 1
  echo "Applying reviewed database migrations..."
  if ! compose run --rm --no-deps migrate >/dev/null 2>&1; then
    echo "Migration failed after the durable schema-transition boundary; service remains offline." >&2
    echo "Pre-migration application rollback is disabled after schema transition begins." >&2
    return 1
  fi
  write_phase "migration-complete" || return 1
  remove_preserved_web_container || return 1
  OLD_WEB_WAS_RUNNING=false
}

assert_control_root() {
  [[ "$CONTROL_ROOT" == /usr/local/lib/gshsapp-operations ]] || { echo "Control root must be the fixed authenticated installation." >&2; return 1; }
  /bin/bash "$CONTROL_ROOT/install-root-operations.sh" --verify-installed
}

assert_approved_release() {
  local approval="$DEPLOY_ROOT/approved-release.json"
  local host_role_file=/etc/gshsapp-operations/host-role host_role
  [[ -f "$approval" && ! -L "$approval" && "$(stat -c '%u:%g:%a' "$approval")" == "0:0:400" ]] || {
    echo "Root release approval receipt is missing or unsafe." >&2
    return 1
  }
  [[ -f "$host_role_file" && ! -L "$host_role_file" && "$(stat -c '%u:%g:%a' "$host_role_file")" == "0:0:400" ]] || return 1
  host_role="$(<"$host_role_file")"
  [[ "$host_role" == "test" || "$host_role" == "prod" ]] || return 1
  APPROVAL_FILE="$approval" EXPECTED_SHA="${IMAGE_TAG#sha-}" EXPECTED_DIGEST="$IMAGE_DIGEST" EXPECTED_HOST_ROLE="$host_role" \
    EXPECTED_CONTROL_DIGEST="$(sha256sum "$CONTROL_ROOT/control-assets.sha256" | awk '{print $1}')" \
    "$PYTHON_BIN" - <<'PY'
import datetime,json,os,re,sys
try: value=json.load(open(os.environ["APPROVAL_FILE"],encoding="utf-8"))
except Exception: raise SystemExit(1)
if set(value)!={"format","version","hostRole","candidateSha","imageDigest","controlManifestSha256","preproductionRunId","preproductionRunAttempt","approvedAt"} or value["format"]!="gshsapp-approved-release" or value["version"]!=2: raise SystemExit(1)
if value["hostRole"]!=os.environ["EXPECTED_HOST_ROLE"]: raise SystemExit(1)
if value["candidateSha"]!=os.environ["EXPECTED_SHA"] or value["imageDigest"]!=os.environ["EXPECTED_DIGEST"] or value["controlManifestSha256"]!=os.environ["EXPECTED_CONTROL_DIGEST"]: raise SystemExit(1)
if value["hostRole"]=="prod":
    if not isinstance(value["preproductionRunId"],int) or value["preproductionRunId"]<1 or not isinstance(value["preproductionRunAttempt"],int) or value["preproductionRunAttempt"]<1: raise SystemExit(1)
elif value["preproductionRunId"] is not None or value["preproductionRunAttempt"] is not None: raise SystemExit(1)
try: approved=datetime.datetime.fromisoformat(value["approvedAt"].replace("Z","+00:00"))
except Exception: raise SystemExit(1)
now=datetime.datetime.now(datetime.timezone.utc)
if approved.tzinfo is None or approved>now+datetime.timedelta(minutes=5) or now-approved>datetime.timedelta(hours=24): raise SystemExit(1)
PY
}

assert_production_restore_receipt() {
  local host_role receipt="$DEPLOY_ROOT/restore-drill-receipt.json" approval="$DEPLOY_ROOT/approved-release.json"
  local output backup_name offsite_receipt_sha actual_receipt_sha
  host_role="$(</etc/gshsapp-operations/host-role)" || return 1
  [[ "$host_role" == "prod" ]] || return 0
  [[ -f "$receipt" && ! -L "$receipt" && "$(stat -c '%u:%g:%a:%h' "$receipt")" == "0:0:400:1" ]] || return 1
  output="$(RESTORE_FILE="$receipt" APPROVAL_FILE="$approval" EXPECTED_TAG="$IMAGE_TAG" EXPECTED_DIGEST="$IMAGE_DIGEST" \
    EXPECTED_CONTROL="$(sha256sum "$CONTROL_ROOT/control-assets.sha256" | awk '{print $1}')" "$PYTHON_BIN" - <<'PY'
import datetime,json,os,re
try:
    restore=json.load(open(os.environ["RESTORE_FILE"],encoding="utf-8"))
    approval=json.load(open(os.environ["APPROVAL_FILE"],encoding="utf-8"))
except Exception: raise SystemExit(1)
keys={"format","version","imageTag","imageDigest","controlManifestSha256","backup","offsiteReceiptSha256","completedAt"}
if set(restore)!=keys or restore["format"]!="gshsapp-restore-drill-receipt" or restore["version"]!=1 or restore["imageTag"]!=os.environ["EXPECTED_TAG"] or restore["imageDigest"]!=os.environ["EXPECTED_DIGEST"] or restore["controlManifestSha256"]!=os.environ["EXPECTED_CONTROL"] or re.fullmatch(r"backup-[0-9]{8}-[0-9]{6}-[a-f0-9]{8}\.tar\.gz",restore["backup"] or "") is None or re.fullmatch(r"[0-9a-f]{64}",restore["offsiteReceiptSha256"] or "") is None: raise SystemExit(1)
completed=datetime.datetime.fromisoformat(restore["completedAt"].replace("Z","+00:00")); approved=datetime.datetime.fromisoformat(approval["approvedAt"].replace("Z","+00:00")); now=datetime.datetime.now(datetime.timezone.utc)
if completed.tzinfo is None or approved.tzinfo is None or completed<approved or completed>now+datetime.timedelta(minutes=5) or now-completed>datetime.timedelta(hours=24): raise SystemExit(1)
print(restore["backup"]);print(restore["offsiteReceiptSha256"])
PY
)" || return 1
  output="${output//$'\r'/}"
  readarray -t restored_values <<<"$output"
  [[ "${#restored_values[@]}" == 2 ]] || return 1
  backup_name="${restored_values[0]}"; offsite_receipt_sha="${restored_values[1]}"
  actual_receipt_sha="$(sha256sum "$OFFSITE_RECEIPT_DIR/$backup_name.receipt.json" | awk '{print $1}')" || return 1
  [[ "$actual_receipt_sha" == "$offsite_receipt_sha" ]] || return 1
  "$PYTHON_BIN" "$CONTROL_ROOT/bootstrap-backup.py" verify-receipt \
    --offsite-dir "$OFFSITE_DIR" --receipt-dir "$OFFSITE_RECEIPT_DIR" --name "$backup_name" >/dev/null
}

deploy_main() {
require_command docker
require_command curl
require_command "$PYTHON_BIN"
require_command flock
require_command stat
require_command id
require_command sha256sum
require_command sync
[[ "$(id -u)" == "0" ]] || { echo "Deployment must run from the trusted root console." >&2; exit 1; }
assert_control_root
[[ "${GSHSAPP_OFFSITE_PINNED:-}" == systemd ]] || {
  echo "Deployment requires the authenticated systemd mount namespace." >&2
  exit 1
}
"$PYTHON_BIN" "$CONTROL_ROOT/validate-operations-config.py" deploy \
  /etc/gshsapp-operations/deploy.env \
  --host-role-file /etc/gshsapp-operations/host-role --verify-pinned-offsite || {
  echo "Deployment refused because the pinned offsite mount no longer matches policy." >&2
  exit 1
}
assert_approved_release || { echo "Run approve-release.sh from the trusted root console first." >&2; exit 1; }
assert_production_restore_receipt || { echo "Production deployment requires a fresh root-owned restore-drill receipt for this exact approved candidate." >&2; exit 1; }
[[ -f "$DEPLOY_ROOT/bootstrap-complete.json" && ! -L "$DEPLOY_ROOT/bootstrap-complete.json" && "$(stat -c '%u:%g:%a' "$DEPLOY_ROOT/bootstrap-complete.json")" == "0:0:400" ]] || {
  echo "Deployment is blocked until an independently verified generation is imported." >&2
  exit 1
}
if ! imported_raw="$(BOOTSTRAP_FILE="$DEPLOY_ROOT/bootstrap-complete.json" "$PYTHON_BIN" - <<'PY'
import datetime,json,os,re
try: value=json.load(open(os.environ["BOOTSTRAP_FILE"],encoding="utf-8"))
except Exception: raise SystemExit(1)
if set(value)!={"format","version","backup","receiptSha256","treeSha256","imageTag","imageDigest","completedAt"} or value["format"]!="gshsapp-bootstrap" or value["version"]!=3 or re.fullmatch(r"backup-[0-9]{8}-[0-9]{6}-[a-f0-9]{8}\.tar\.gz",value["backup"] or "") is None or re.fullmatch(r"[0-9a-f]{64}",value["receiptSha256"] or "") is None or re.fullmatch(r"[0-9a-f]{64}",value["treeSha256"] or "") is None or re.fullmatch(r"sha-[0-9a-f]{40}",value["imageTag"] or "") is None or re.fullmatch(r"sha256:[0-9a-f]{64}",value["imageDigest"] or "") is None: raise SystemExit(1)
completed=datetime.datetime.fromisoformat(value["completedAt"].replace("Z","+00:00")); now=datetime.datetime.now(datetime.timezone.utc)
if completed.tzinfo is None or completed>now+datetime.timedelta(minutes=5): raise SystemExit(1)
print(value["backup"])
print(value["receiptSha256"])
PY
)"; then
  echo "Bootstrap marker does not match the approved imported generation." >&2
  exit 1
fi
readarray -t imported_state <<<"$imported_raw"
[[ "${#imported_state[@]}" == "2" ]] || { echo "Bootstrap marker is incomplete." >&2; exit 1; }
imported_generation="${imported_state[0]}"
imported_receipt_sha256="${imported_state[1]}"
[[ -f "$DB_FILE" && ! -L "$DB_FILE" ]] || { echo "Imported live database is missing or unsafe." >&2; exit 1; }
[[ "$(sha256sum "$OFFSITE_RECEIPT_DIR/$imported_generation.receipt.json" | awk '{print $1}')" == "$imported_receipt_sha256" ]] || {
  echo "The imported generation receipt changed after bootstrap." >&2
  exit 1
}
"$PYTHON_BIN" "$CONTROL_ROOT/bootstrap-backup.py" verify-receipt \
  --offsite-dir "$OFFSITE_DIR" --receipt-dir "$OFFSITE_RECEIPT_DIR" --name "$imported_generation" >/dev/null || {
  echo "The imported generation's independent offsite receipt is no longer verifiable." >&2
  exit 1
}
RUNTIME_ENV_TRUST_ROOT="$DEPLOY_ROOT"
export RUNTIME_ENV_TRUST_ROOT
validate_runtime_env_file "$APP_ENV_FILE"
validate_deploy_identity
if [[ "${REQUIRE_EXPLICIT_BIND:-false}" == "true" && -z "$RAW_HOST_BIND_IP" ]]; then
  echo "HOST_BIND_IP must be configured explicitly for this deployment environment." >&2
  exit 1
fi
  validate_bind_policy
  PROXY_SOURCE_CIDR="${PROXY_SOURCE_CIDR:?PROXY_SOURCE_CIDR is required by the root deployment policy}" \
    SSH_SOURCE_CIDR="${SSH_SOURCE_CIDR:?SSH_SOURCE_CIDR is required by the root deployment policy}" \
    HOST_BIND_IP="$HOST_BIND_IP" APP_PORT="$HOST_PORT" \
    ALLOW_NON_RFC1918_INTERNAL="${ALLOW_PUBLIC_BIND:-false}" \
    LIFECYCLE_LOCK_HELD=1 \
    /bin/bash "$CONTROL_ROOT/host-hardening.sh" --verify-firewall >/dev/null || {
      echo "Deployment refused because the active firewall no longer matches the exact proxy and SSH ingress policy." >&2
      exit 1
    }
  PROXY_SOURCE_CIDR="$PROXY_SOURCE_CIDR" HOST_BIND_IP="$HOST_BIND_IP" HOST_PORT="$HOST_PORT" \
    LIFECYCLE_LOCK_HELD=1 \
    /bin/bash "$CONTROL_ROOT/docker-user-firewall.sh" --verify >/dev/null || {
      echo "Deployment refused because the Docker forwarding boundary no longer matches the exact proxy ingress policy." >&2
      exit 1
    }

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin is required." >&2
  exit 1
fi

[[ -d "$DATA_DIR" && ! -L "$DATA_DIR" && "$(stat -c '%u:%g:%a' "$DATA_DIR")" == "61001:61001:700" ]] || {
  echo "Application data root must use the reserved application UID/GID and mode 0700." >&2
  exit 1
}
[[ -d "$BACKUP_DIR" && ! -L "$BACKUP_DIR" && "$(stat -c '%u:%g:%a' "$BACKUP_DIR")" == "0:0:700" ]] || {
  echo "Root recovery backup directory must remain root-private mode 0700." >&2
  exit 1
}
LIFECYCLE_LOCK_HELD=1 DEPLOY_ROOT="$DEPLOY_ROOT" \
  PHASE_FILE="$PHASE_FILE" PYTHON_BIN="$PYTHON_BIN" \
  /bin/bash "$CONTROL_ROOT/recover-deployment-writer.sh"
LIFECYCLE_LOCK_HELD=1 DEPLOY_ROOT="$DEPLOY_ROOT" \
  /bin/bash "$CONTROL_ROOT/recover-backup-writer.sh"
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
CANDIDATE_IMAGE_ID="$(docker image inspect --format '{{.Id}}' "$image_ref")" || exit 1
[[ "$CANDIDATE_IMAGE_ID" =~ ^sha256:[0-9a-f]{64}$ ]] || { echo "Candidate image has an invalid local content identity." >&2; exit 1; }

write_phase "pre-migration-validation"
quiesce_web_container
create_predeployment_backup
write_deploy_env
write_phase "pre-migration-ready"
if ! begin_schema_transition; then
  exit 1
fi

echo "Starting deployment..."
if ! compose up -d --remove-orphans --wait web; then
  echo "Container startup failed; removing the candidate and leaving maintenance mode." >&2
  if ! candidate_id="$(find_web_container)" || { [[ -n "$candidate_id" ]] && ! docker rm -f "$candidate_id" >/dev/null; }; then
    echo "WARNING: candidate container cleanup failed and requires immediate operator isolation." >&2
  fi
  echo "Pre-migration application rollback is disabled after schema transition begins." >&2
  exit 1
fi

candidate_id="$(find_web_container)" || {
  echo "Candidate identity could not be resolved after startup." >&2
  exit 1
}
if ! assert_candidate_network "$candidate_id"; then
  echo "Candidate is not attached exclusively to the authenticated web bridge." >&2
  docker rm -f "$candidate_id" >/dev/null 2>&1 || true
  exit 1
fi

if ! wait_for_health; then
  echo "Health check failed for $HEALTHCHECK_URL" >&2
  compose ps >&2 || true
  echo "Removing the unhealthy candidate and leaving the service offline for reviewed recovery." >&2
  if ! candidate_id="$(find_web_container)" || { [[ -n "$candidate_id" ]] && ! docker rm -f "$candidate_id" >/dev/null; }; then
    echo "WARNING: candidate container cleanup failed and requires immediate operator isolation." >&2
  fi
  echo "Pre-migration application rollback is disabled after schema transition begins." >&2
  exit 1
fi

if ! record_candidate_promotion; then
  echo "Healthy candidate could not publish an exact pending-promotion phase." >&2
  exit 1
fi
if ! promote_candidate_restart_policy; then
  echo "Healthy candidate could not be promoted to the reviewed restart policy." >&2
  exit 1
fi
write_phase "healthy"
echo "Deployment healthy. Current service status:"
compose ps
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  deploy_main "$@"
fi
