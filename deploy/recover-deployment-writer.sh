#!/usr/bin/env bash
set -Eeuo pipefail

PATH=/usr/sbin:/usr/bin:/sbin:/bin
LC_ALL=C
export PATH LC_ALL
IFS=$' \t\n'
DEPLOY_ROOT="${DEPLOY_ROOT:-/opt/gshsapp}"
INTENT="${INTENT:-$DEPLOY_ROOT/deployment-restart.json}"
PHASE_FILE="${PHASE_FILE:-$DEPLOY_ROOT/deployment-phase.json}"
LOCK_FILE="${LOCK_FILE:-/run/lock/gshsapp/lifecycle.lock}"
PYTHON_BIN="${PYTHON_BIN:-/usr/bin/python3}"
PROJECT_NAME="${PROJECT_NAME:-gshsapp}"
CONTAINER_NAME="${CONTAINER_NAME:-gshsapp-web}"

read_deployment_phase() {
  "$PYTHON_BIN" - "$PHASE_FILE" <<'PY'
import json
import re
import sys

try:
    with open(sys.argv[1], encoding="utf-8") as source:
        value = json.load(source)
except Exception:
    raise SystemExit(1)
base = {"format", "version", "phase", "imageTag", "imageDigest", "updatedAt"}
if not isinstance(value, dict) or value.get("format") != "gshsapp-deployment-phase":
    raise SystemExit(1)
if re.fullmatch(r"sha-[0-9a-f]{40}", value.get("imageTag") or "") is None or re.fullmatch(r"sha256:[0-9a-f]{64}", value.get("imageDigest") or "") is None:
    raise SystemExit(1)
if value.get("version") == 1:
    if set(value) != base or value.get("phase") not in {
        "pre-migration-validation", "pre-migration-ready", "pre-migration-rollback",
        "schema-transition", "migration-complete", "healthy",
    }:
        raise SystemExit(1)
    print(value["phase"])
elif value.get("version") == 2:
    if set(value) != base | {"containerId", "imageId", "configImage"} or value.get("phase") != "candidate-healthy-pending-promotion":
        raise SystemExit(1)
    if re.fullmatch(r"[0-9a-f]{64}", value.get("containerId") or "") is None or re.fullmatch(r"sha256:[0-9a-f]{64}", value.get("imageId") or "") is None or re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._/@:+-]{0,254}", value.get("configImage") or "") is None:
        raise SystemExit(1)
    print(value["phase"])
    print(value["containerId"])
    print(value["imageId"])
    print(value["configImage"])
else:
    raise SystemExit(1)
PY
}

rewrite_pending_phase() {
  local next_phase="$1" expected_id="$2" expected_image="$3" expected_config="$4"
  [[ "$next_phase" == "healthy" || "$next_phase" == "migration-complete" ]] || return 1
  NEXT_PHASE="$next_phase" EXPECTED_ID="$expected_id" EXPECTED_IMAGE="$expected_image" EXPECTED_CONFIG="$expected_config" \
    "$PYTHON_BIN" - "$PHASE_FILE" <<'PY'
import datetime
import json
import os
import re
import sys
import tempfile

path = os.path.abspath(sys.argv[1])
directory = os.path.dirname(path)
try:
    with open(path, encoding="utf-8") as source:
        value = json.load(source)
except Exception:
    raise SystemExit(1)
keys = {"format", "version", "phase", "imageTag", "imageDigest", "containerId", "imageId", "configImage", "updatedAt"}
if (
    not isinstance(value, dict)
    or set(value) != keys
    or value.get("format") != "gshsapp-deployment-phase"
    or value.get("version") != 2
    or value.get("phase") != "candidate-healthy-pending-promotion"
    or value.get("containerId") != os.environ["EXPECTED_ID"]
    or value.get("imageId") != os.environ["EXPECTED_IMAGE"]
    or value.get("configImage") != os.environ["EXPECTED_CONFIG"]
    or re.fullmatch(r"sha-[0-9a-f]{40}", value.get("imageTag") or "") is None
    or re.fullmatch(r"sha256:[0-9a-f]{64}", value.get("imageDigest") or "") is None
):
    raise SystemExit(1)
updated = {
    "format": "gshsapp-deployment-phase",
    "version": 1,
    "phase": os.environ["NEXT_PHASE"],
    "imageTag": value["imageTag"],
    "imageDigest": value["imageDigest"],
    "updatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
}
descriptor, temporary = tempfile.mkstemp(prefix=".deployment-phase.", dir=directory)
try:
    with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as output:
        json.dump(updated, output, separators=(",", ":"))
        output.write("\n")
        output.flush()
        os.fsync(output.fileno())
    os.chmod(temporary, 0o600)
    os.replace(temporary, path)
    try:
        directory_fd = os.open(directory, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
    except OSError:
        if os.name != "nt":
            raise
    else:
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
except BaseException:
    try:
        os.unlink(temporary)
    except FileNotFoundError:
        pass
    raise
PY
}

quarantine_post_schema_writer() {
  local web_output named_output container_id actual_id actual_name actual_project actual_service
  local actual_image actual_config actual_policy actual_running final_id final_image final_config final_policy final_running
  web_output="$(docker ps --all --no-trunc --quiet \
    --filter "label=com.docker.compose.project=$PROJECT_NAME" \
    --filter "label=com.docker.compose.service=web")" || return 1
  named_output="$(docker ps --all --no-trunc --quiet --filter "name=^/${CONTAINER_NAME}$")" || return 1
  if [[ -z "$web_output" && -z "$named_output" ]]; then
    return 0
  fi
  [[ "$web_output" == "$named_output" && "$web_output" =~ ^[0-9a-f]{64}$ ]] || return 1
  container_id="$web_output"
  actual_id="$(docker inspect --format '{{.Id}}' "$container_id")" || return 1
  actual_name="$(docker inspect --format '{{.Name}}' "$container_id")" || return 1
  actual_project="$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$container_id")" || return 1
  actual_service="$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.service" }}' "$container_id")" || return 1
  actual_image="$(docker inspect --format '{{.Image}}' "$container_id")" || return 1
  actual_config="$(docker inspect --format '{{.Config.Image}}' "$container_id")" || return 1
  actual_policy="$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$container_id")" || return 1
  actual_running="$(docker inspect --format '{{.State.Running}}' "$container_id")" || return 1
  [[ "$actual_id" == "$container_id" && "$actual_name" == "/$CONTAINER_NAME" &&
     "$actual_project" == "$PROJECT_NAME" && "$actual_service" == "web" ]] || return 1
  [[ "$actual_image" =~ ^sha256:[0-9a-f]{64}$ &&
     "$actual_config" =~ ^[A-Za-z0-9][A-Za-z0-9._/@:+-]{0,254}$ ]] || return 1
  [[ "$actual_policy" =~ ^(no|always|unless-stopped)$ && "$actual_running" =~ ^(true|false)$ ]] || return 1
  if [[ "$actual_policy" != "no" ]]; then
    docker update --restart=no "$container_id" >/dev/null || return 1
  fi
  if [[ "$actual_running" == "true" ]]; then
    docker stop --time 30 "$container_id" >/dev/null || return 1
  fi
  final_id="$(docker inspect --format '{{.Id}}' "$container_id")" || return 1
  final_image="$(docker inspect --format '{{.Image}}' "$container_id")" || return 1
  final_config="$(docker inspect --format '{{.Config.Image}}' "$container_id")" || return 1
  final_policy="$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$container_id")" || return 1
  final_running="$(docker inspect --format '{{.State.Running}}' "$container_id")" || return 1
  [[ "$final_id" == "$container_id" && "$final_image" == "$actual_image" &&
     "$final_config" == "$actual_config" && "$final_policy" == "no" && "$final_running" == "false" ]]
}

recover_pending_candidate_promotion() {
  local expected_id="$1" expected_image="$2" expected_config="$3"
  local web_output named_output actual_id actual_name actual_project actual_service
  local actual_image actual_config actual_policy actual_running final_id final_image final_config final_policy final_running
  web_output="$(docker ps --all --no-trunc --quiet \
    --filter "label=com.docker.compose.project=$PROJECT_NAME" \
    --filter "label=com.docker.compose.service=web")" || return 1
  named_output="$(docker ps --all --no-trunc --quiet --filter "name=^/${CONTAINER_NAME}$")" || return 1
  if [[ "$web_output" != "$expected_id" || "$named_output" != "$expected_id" ]]; then
    if quarantine_post_schema_writer; then
      rewrite_pending_phase "migration-complete" "$expected_id" "$expected_image" "$expected_config" || return 1
    fi
    return 1
  fi
  actual_id="$(docker inspect --format '{{.Id}}' "$expected_id")" || return 1
  actual_name="$(docker inspect --format '{{.Name}}' "$expected_id")" || return 1
  actual_project="$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$expected_id")" || return 1
  actual_service="$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.service" }}' "$expected_id")" || return 1
  actual_image="$(docker inspect --format '{{.Image}}' "$expected_id")" || return 1
  actual_config="$(docker inspect --format '{{.Config.Image}}' "$expected_id")" || return 1
  actual_policy="$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$expected_id")" || return 1
  actual_running="$(docker inspect --format '{{.State.Running}}' "$expected_id")" || return 1
  if [[ "$actual_id" != "$expected_id" || "$actual_name" != "/$CONTAINER_NAME" ||
        "$actual_project" != "$PROJECT_NAME" || "$actual_service" != "web" ||
        "$actual_image" != "$expected_image" || "$actual_config" != "$expected_config" ||
        "$actual_running" != "true" || ( "$actual_policy" != "no" && "$actual_policy" != "always" ) ]]; then
    if quarantine_post_schema_writer; then
      rewrite_pending_phase "migration-complete" "$expected_id" "$expected_image" "$expected_config" || return 1
    fi
    return 1
  fi
  if [[ "$actual_policy" == "no" ]]; then
    if ! docker update --restart=always "$expected_id" >/dev/null; then
      quarantine_post_schema_writer || true
      rewrite_pending_phase "migration-complete" "$expected_id" "$expected_image" "$expected_config" || true
      return 1
    fi
  fi
  final_id="$(docker inspect --format '{{.Id}}' "$expected_id")" || return 1
  final_image="$(docker inspect --format '{{.Image}}' "$expected_id")" || return 1
  final_config="$(docker inspect --format '{{.Config.Image}}' "$expected_id")" || return 1
  final_policy="$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$expected_id")" || return 1
  final_running="$(docker inspect --format '{{.State.Running}}' "$expected_id")" || return 1
  if [[ "$final_id" != "$expected_id" || "$final_image" != "$expected_image" ||
        "$final_config" != "$expected_config" || "$final_policy" != "always" || "$final_running" != "true" ]]; then
    quarantine_post_schema_writer || true
    rewrite_pending_phase "migration-complete" "$expected_id" "$expected_image" "$expected_config" || true
    return 1
  fi
  rewrite_pending_phase "healthy" "$expected_id" "$expected_image" "$expected_config"
}

recover_deployment_writer_main() {
  [[ "$(id -u)" == "0" ]] || return 1
  if [[ "${LIFECYCLE_LOCK_HELD:-0}" != "1" ]]; then
    install -d -o root -g root -m 0700 "$(dirname "$LOCK_FILE")"
    exec 8>"$LOCK_FILE"
    flock 8
  fi

  local phase
  local -a phase_values=()
  if [[ ! -e "$INTENT" && ! -L "$INTENT" ]]; then
    if [[ ! -e "$PHASE_FILE" && ! -L "$PHASE_FILE" ]]; then
      return 0
    fi
    [[ -f "$PHASE_FILE" && ! -L "$PHASE_FILE" ]] || return 1
    readarray -t phase_values < <(read_deployment_phase)
    (( ${#phase_values[@]} >= 1 )) || return 1
    for (( index=0; index<${#phase_values[@]}; index++ )); do
      phase_values[$index]="${phase_values[$index]%$'\r'}"
    done
    phase="${phase_values[0]}"
    case "$phase" in
      schema-transition|migration-complete)
        [[ "${#phase_values[@]}" == "1" ]] || return 1
        quarantine_post_schema_writer
        ;;
      candidate-healthy-pending-promotion)
        [[ "${#phase_values[@]}" == "4" ]] || return 1
        recover_pending_candidate_promotion "${phase_values[1]}" "${phase_values[2]}" "${phase_values[3]}"
        ;;
      *) [[ "${#phase_values[@]}" == "1" ]] ;;
    esac
    return
  fi
  [[ -f "$INTENT" && ! -L "$INTENT" ]] || return 1
  [[ -f "$PHASE_FILE" && ! -L "$PHASE_FILE" ]] || return 1

  local -a values=()
  readarray -t values < <("$PYTHON_BIN" - "$INTENT" "$PHASE_FILE" <<'PY'
import json
import re
import sys

try:
    with open(sys.argv[1], encoding="utf-8") as source:
        intent = json.load(source)
    with open(sys.argv[2], encoding="utf-8") as source:
        phase = json.load(source)
except Exception:
    raise SystemExit(1)

intent_keys = {"format", "version", "phase", "containerId", "imageId", "configImage", "restartPolicy", "createdAt"}
phase_keys = {"format", "version", "phase", "imageTag", "imageDigest", "updatedAt"}
if (
    not isinstance(intent, dict)
    or set(intent) != intent_keys
    or intent["format"] != "gshsapp-restart-intent"
    or intent["version"] != 2
    or intent["phase"] != "restart-old-on-failure"
    or re.fullmatch(r"[0-9a-f]{64}", intent["containerId"] or "") is None
    or re.fullmatch(r"sha256:[0-9a-f]{64}", intent["imageId"] or "") is None
    or re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._/@:+-]{0,254}", intent["configImage"] or "") is None
    or intent["restartPolicy"] not in {"no", "always", "unless-stopped"}
):
    raise SystemExit(1)
if (
    not isinstance(phase, dict)
    or set(phase) != phase_keys
    or phase["format"] != "gshsapp-deployment-phase"
    or phase["version"] != 1
    or re.fullmatch(r"sha-[0-9a-f]{40}", phase["imageTag"] or "") is None
    or re.fullmatch(r"sha256:[0-9a-f]{64}", phase["imageDigest"] or "") is None
):
    raise SystemExit(1)

if phase["phase"] in {"pre-migration-validation", "pre-migration-ready", "pre-migration-rollback"}:
    action = "restart"
elif phase["phase"] in {"schema-transition", "migration-complete", "healthy"}:
    action = "do-not-restart"
else:
    raise SystemExit(1)

print(intent["containerId"])
print(intent["imageId"])
print(intent["configImage"])
print(intent["restartPolicy"])
print(action)
PY
  )
  [[ "${#values[@]}" == "5" ]] || return 1
  values[0]="${values[0]%$'\r'}"
  values[1]="${values[1]%$'\r'}"
  values[2]="${values[2]%$'\r'}"
  values[3]="${values[3]%$'\r'}"
  values[4]="${values[4]%$'\r'}"

  local container_id="${values[0]}" expected_image="${values[1]}"
  local expected_config="${values[2]}" expected_restart_policy="${values[3]}" action="${values[4]}"
  local actual_id actual_image actual_config actual_restart_policy running
  actual_id="$(docker inspect --format '{{.Id}}' "$container_id")" || return 1
  actual_image="$(docker inspect --format '{{.Image}}' "$container_id")" || return 1
  actual_config="$(docker inspect --format '{{.Config.Image}}' "$container_id")" || return 1
  running="$(docker inspect --format '{{.State.Running}}' "$container_id")" || return 1
  actual_restart_policy="$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$container_id")" || return 1
  [[ "$actual_id" == "$container_id" && "$actual_image" == "$expected_image" &&
     "$actual_config" == "$expected_config" ]] || return 1

  if [[ "$action" == "restart" ]]; then
    if [[ "$actual_restart_policy" != "$expected_restart_policy" ]]; then
      docker update "--restart=$expected_restart_policy" "$container_id" >/dev/null || return 1
      [[ "$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$container_id")" == "$expected_restart_policy" ]] || return 1
    fi
    if [[ "$running" == "false" ]]; then
      docker start "$container_id" >/dev/null || return 1
      [[ "$(docker inspect --format '{{.State.Running}}' "$container_id")" == "true" ]] || return 1
    elif [[ "$running" != "true" ]]; then
      return 1
    fi
  else
    if [[ "$actual_restart_policy" != "no" ]]; then
      docker update --restart=no "$container_id" >/dev/null || return 1
      [[ "$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$container_id")" == "no" ]] || return 1
    fi
    if [[ "$running" == "true" ]]; then
      docker stop --time 30 "$container_id" >/dev/null || return 1
      [[ "$(docker inspect --format '{{.State.Running}}' "$container_id")" == "false" ]] || return 1
    elif [[ "$running" != "false" ]]; then
      return 1
    fi
  fi

  rm -f -- "$INTENT"
  sync -d "$DEPLOY_ROOT"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  recover_deployment_writer_main "$@"
fi
