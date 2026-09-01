#!/usr/bin/env bash
set -Eeuo pipefail

PATH=/usr/sbin:/usr/bin:/sbin:/bin
LC_ALL=C
export PATH LC_ALL
IFS=$' \t\n'

LIFECYCLE_LOCK_FILE="${LIFECYCLE_LOCK_FILE:-/run/lock/gshsapp/lifecycle.lock}"
umask 077

CONTROL_ROOT=/usr/local/lib/gshsapp-operations
DEPLOY_ROOT="${DEPLOY_ROOT:-/opt/gshsapp}"
OFFSITE_DIR="${OFFSITE_DIR:?OFFSITE_DIR is required}"
OFFSITE_RECEIPT_DIR="$OFFSITE_DIR/.gshsapp-receipts"
OFFSITE_MOUNT_SOURCE="${OFFSITE_MOUNT_SOURCE:?OFFSITE_MOUNT_SOURCE is required}"

IMAGE_TAG="${IMAGE_TAG:?IMAGE_TAG is required}"
IMAGE_DIGEST="${IMAGE_DIGEST:?IMAGE_DIGEST is required}"
DOCKER_IMAGE="${DOCKER_IMAGE:-kkwjk2718git/gshsapp}"
APP_VERSION="${APP_VERSION:-$IMAGE_TAG}"
BACKUP_MAX_AGE_HOURS="${BACKUP_MAX_AGE_HOURS:-24}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
TIMEOUT_BIN="${TIMEOUT_BIN:-timeout}"
DOCKER_TIMEOUT_SECONDS="${DOCKER_TIMEOUT_SECONDS:-300}"
SMOKE_TIMEOUT_SECONDS="${SMOKE_TIMEOUT_SECONDS:-90}"
RESTORE_DRILL_OUTPUT_FILE="${RESTORE_DRILL_OUTPUT_FILE:-}"
E2E_ADMIN_USER="${E2E_ADMIN_USER:?E2E_ADMIN_USER is required}"
E2E_ADMIN_PASSWORD="${E2E_ADMIN_PASSWORD:?E2E_ADMIN_PASSWORD is required}"

readonly DRILL_LABEL_KEY="io.gshsapp.restore-drill"
readonly DRILL_LABEL_VALUE="managed-v1"
readonly DRILL_LABEL="$DRILL_LABEL_KEY=$DRILL_LABEL_VALUE"
readonly APP_UID=61001
readonly APP_GID=61001

RESTORE_BASE_URL=""
TEMP_DIR=""
PROJECT_NAME=""
CONTAINER_NAME=""
DEPLOY_ENV_FILE=""
COMPOSE_FILE=""
RUNTIME_ENV_FILE=""
RESTORE_SOURCE_NAME=""
RESTORE_SOURCE_RECEIPT_SHA256=""
LATEST_BACKUP_NAME="none"
MAIN_SUCCEEDED=0
CLEANUP_ARMED=0
RESTORE_RECEIPT_TARGET="$DEPLOY_ROOT/restore-drill-receipt.json"
RESTORE_PHASE_FILE="$DEPLOY_ROOT/restore-drill-phase.json"
RESTORE_DATA_MOUNT=""
readonly RESTORE_DATA_TMPFS_MIB=768

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "A required restore-drill command is unavailable."
}

require_bounded_integer() {
  local value="$1" minimum="$2" maximum="$3"
  [[ "$value" =~ ^[0-9]+$ ]] && (( value >= minimum && value <= maximum ))
}

run_timed() {
  "$TIMEOUT_BIN" "${DOCKER_TIMEOUT_SECONDS}s" "$@"
}

compose() {
  run_timed docker compose \
    --project-name "$PROJECT_NAME" \
    --env-file "$DEPLOY_ENV_FILE" \
    -f "$COMPOSE_FILE" \
    "$@"
}

enumerate_managed() {
  local resource="$1" output
  case "$resource" in
    container)
      if ! output="$(run_timed docker container ls --all --quiet --filter "label=$DRILL_LABEL" 2>/dev/null)"; then
        printf '%s\n' "Unable to enumerate managed restore-drill containers." >&2
        return 1
      fi
      ;;
    network)
      if ! output="$(run_timed docker network ls --quiet --filter "label=$DRILL_LABEL" 2>/dev/null)"; then
        printf '%s\n' "Unable to enumerate managed restore-drill networks." >&2
        return 1
      fi
      ;;
    volume)
      if ! output="$(run_timed docker volume ls --quiet --filter "label=$DRILL_LABEL" 2>/dev/null)"; then
        printf '%s\n' "Unable to enumerate managed restore-drill volumes." >&2
        return 1
      fi
      ;;
    *) return 1 ;;
  esac
  printf '%s' "$output"
}

remove_managed_kind() {
  local resource="$1" output id
  local -a ids=()
  output="$(enumerate_managed "$resource")" || return 1
  if [[ -n "$output" ]]; then
    mapfile -t ids <<<"$output"
  fi
  for id in "${ids[@]}"; do
    if [[ "$resource" == "volume" ]]; then
      [[ "$id" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]{0,254}$ ]]
    else
      [[ "$id" =~ ^[a-f0-9]{12,64}$ ]]
    fi || {
      printf '%s\n' "Docker returned an unsafe managed restore-drill resource identifier." >&2
      return 1
    }
  done
  if (( ${#ids[@]} > 0 )); then
    case "$resource" in
      container) run_timed docker container rm --force "${ids[@]}" >/dev/null 2>&1 || return 1 ;;
      network) run_timed docker network rm "${ids[@]}" >/dev/null 2>&1 || return 1 ;;
      volume) run_timed docker volume rm --force "${ids[@]}" >/dev/null 2>&1 || return 1 ;;
    esac
  fi
  output="$(enumerate_managed "$resource")" || return 1
  [[ -z "$output" ]] || {
    printf '%s\n' "Managed restore-drill resources remain after synchronous cleanup." >&2
    return 1
  }
}

sweep_managed_resources() {
  remove_managed_kind container &&
    remove_managed_kind network &&
    remove_managed_kind volume
}

invalidate_restore_receipt() {
  if [[ -e "$RESTORE_RECEIPT_TARGET" || -L "$RESTORE_RECEIPT_TARGET" ]]; then
    [[ -f "$RESTORE_RECEIPT_TARGET" && ! -L "$RESTORE_RECEIPT_TARGET" &&
       "$(stat -c '%u:%g:%a:%h' "$RESTORE_RECEIPT_TARGET")" == "0:0:400:1" ]] || return 1
    rm -f -- "$RESTORE_RECEIPT_TARGET" || return 1
    sync -d "$DEPLOY_ROOT" || return 1
  fi
}

write_restore_phase() {
  local temporary basename_value
  basename_value="$(basename -- "$TEMP_DIR")"
  [[ "$basename_value" =~ ^\.restore-drill\.[A-Za-z0-9]{6,32}$ ]] || return 1
  temporary="$(mktemp "$DEPLOY_ROOT/.restore-drill-phase.XXXXXX")" || return 1
  TEMP_BASENAME="$basename_value" "$PYTHON_BIN" - "$temporary" <<'PY' || return 1
import datetime,json,os,sys
with open(sys.argv[1],"w",encoding="utf-8",newline="\n") as output:
    json.dump({"format":"gshsapp-restore-drill-phase","version":1,"workspace":os.environ["TEMP_BASENAME"],"mountSource":"gshsapp-restore-drill-data","createdAt":datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00","Z")},output,separators=(",",":"));output.write("\n");output.flush();os.fsync(output.fileno())
PY
  chown root:root "$temporary" && chmod 0600 "$temporary" || return 1
  mv -fT "$temporary" "$RESTORE_PHASE_FILE" || return 1
  sync -d "$RESTORE_PHASE_FILE" && sync -d "$DEPLOY_ROOT"
}

remove_restore_phase() {
  [[ -e "$RESTORE_PHASE_FILE" || -L "$RESTORE_PHASE_FILE" ]] || return 0
  [[ -f "$RESTORE_PHASE_FILE" && ! -L "$RESTORE_PHASE_FILE" &&
     "$(stat -c '%u:%g:%a:%h' "$RESTORE_PHASE_FILE")" == "0:0:600:1" ]] || return 1
  rm -f -- "$RESTORE_PHASE_FILE" && sync -d "$DEPLOY_ROOT"
}

recover_stale_restore_workspace() {
  local output workspace mount_path mount_state stale
  local -a values=() stale_paths=()
  if [[ -e "$RESTORE_PHASE_FILE" || -L "$RESTORE_PHASE_FILE" ]]; then
    [[ -f "$RESTORE_PHASE_FILE" && ! -L "$RESTORE_PHASE_FILE" &&
       "$(stat -c '%u:%g:%a:%h' "$RESTORE_PHASE_FILE")" == "0:0:600:1" ]] || return 1
    output="$(PHASE_FILE_VALUE="$RESTORE_PHASE_FILE" "$PYTHON_BIN" - <<'PY'
import json,os,re
try: value=json.load(open(os.environ["PHASE_FILE_VALUE"],encoding="utf-8"))
except Exception: raise SystemExit(1)
if set(value)!={"format","version","workspace","mountSource","createdAt"} or value["format"]!="gshsapp-restore-drill-phase" or value["version"]!=1 or value["mountSource"]!="gshsapp-restore-drill-data" or re.fullmatch(r"\.restore-drill\.[A-Za-z0-9]{6,32}",value["workspace"] or "") is None: raise SystemExit(1)
print(value["workspace"]);print(value["mountSource"])
PY
    )" || return 1
    output="${output//$'\r'/}"
    readarray -t values <<<"$output"
    [[ "${#values[@]}" == 2 ]] || return 1
    workspace="${values[0]}"; mount_path="$DEPLOY_ROOT/$workspace/validated"
    if [[ ! -e "$DEPLOY_ROOT/$workspace" && ! -L "$DEPLOY_ROOT/$workspace" ]]; then
      if findmnt --noheadings --raw --output SOURCE,FSTYPE,OPTIONS --mountpoint "$mount_path" >/dev/null 2>&1; then
        return 1
      fi
      remove_restore_phase || return 1
      return 0
    fi
    [[ -d "$DEPLOY_ROOT/$workspace" && ! -L "$DEPLOY_ROOT/$workspace" &&
       "$(stat -c '%u:%g:%a' "$DEPLOY_ROOT/$workspace")" == "0:0:700" ]] || return 1
    if mount_state="$(findmnt --noheadings --raw --output SOURCE,FSTYPE,OPTIONS --mountpoint "$mount_path" 2>/dev/null)"; then
      MOUNT_STATE="$mount_state" EXPECTED_SOURCE="${values[1]}" EXPECTED_SIZE_MIB="$RESTORE_DATA_TMPFS_MIB" "$PYTHON_BIN" - <<'PY' || return 1
import os
parts=os.environ["MOUNT_STATE"].split(None,2)
if len(parts)!=3 or parts[0]!=os.environ["EXPECTED_SOURCE"] or parts[1]!="tmpfs": raise SystemExit(1)
options=set(parts[2].split(","))
required={"rw","nosuid","nodev","noexec","nr_inodes=12000","uid=61001","gid=61001","mode=700"}
if not required.issubset(options): raise SystemExit(1)
sizes=[value[5:] for value in options if value.startswith("size=")]
if len(sizes)!=1: raise SystemExit(1)
raw=sizes[0].lower()
multiplier=1
if raw.endswith("k"): multiplier=1024; raw=raw[:-1]
elif raw.endswith("m"): multiplier=1024*1024; raw=raw[:-1]
if not raw.isdigit() or int(raw)*multiplier != int(os.environ["EXPECTED_SIZE_MIB"])*1024*1024: raise SystemExit(1)
PY
      umount -- "$mount_path" || return 1
    fi
    rm -rf -- "$DEPLOY_ROOT/$workspace" || return 1
    [[ ! -e "$DEPLOY_ROOT/$workspace" && ! -L "$DEPLOY_ROOT/$workspace" ]] || return 1
    remove_restore_phase || return 1
  fi
  output="$(find "$DEPLOY_ROOT" -mindepth 1 -maxdepth 1 -type d -name '.restore-drill.*' ! -name '.restore-drill-receipt.*' ! -name '.restore-drill-phase.*' -print)" || return 1
  [[ -z "$output" ]] || mapfile -t stale_paths <<<"$output"
  for stale in "${stale_paths[@]}"; do
    [[ "$stale" == "$DEPLOY_ROOT"/.restore-drill.* && ! -L "$stale" &&
       "$(stat -c '%u:%g:%a' "$stale")" == "0:0:700" &&
       -z "$(find "$stale" -mindepth 1 -maxdepth 1 -print -quit)" ]] || return 1
    rmdir -- "$stale" || return 1
  done
}

cleanup_runtime() {
  local cleanup_failed=0
  if [[ "$CLEANUP_ARMED" == "1" ]]; then
    if [[ -n "$PROJECT_NAME" && -n "$COMPOSE_FILE" && -n "$DEPLOY_ENV_FILE" ]]; then
      if ! compose down --remove-orphans --volumes >/dev/null 2>&1; then
        cleanup_failed=1
      fi
    fi
    if ! sweep_managed_resources; then
      cleanup_failed=1
    fi
    if [[ -n "$RESTORE_DATA_MOUNT" ]]; then
      case "$RESTORE_DATA_MOUNT" in
        "$DEPLOY_ROOT"/.restore-drill.*/validated)
          if ! umount -- "$RESTORE_DATA_MOUNT"; then
            cleanup_failed=1
          else
            RESTORE_DATA_MOUNT=""
          fi
          ;;
        *) cleanup_failed=1 ;;
      esac
    fi
    if [[ -n "$TEMP_DIR" ]]; then
      case "$TEMP_DIR" in
        "$DEPLOY_ROOT"/.restore-drill.*)
          if [[ -L "$TEMP_DIR" ]] || ! rm -rf -- "$TEMP_DIR"; then
            cleanup_failed=1
          elif [[ -e "$TEMP_DIR" || -L "$TEMP_DIR" ]]; then
            cleanup_failed=1
          fi
          ;;
        *) cleanup_failed=1 ;;
      esac
    fi
  fi
  if [[ "$cleanup_failed" == "0" ]]; then
    CLEANUP_ARMED=0
    TEMP_DIR=""
    remove_restore_phase || cleanup_failed=1
  fi
  [[ "$cleanup_failed" == "0" ]]
}

cleanup() {
  local original_status=$?
  local cleanup_failed=0
  trap - EXIT

  cleanup_runtime || cleanup_failed=1
  if [[ "$original_status" != "0" || "$MAIN_SUCCEEDED" != "1" || "$cleanup_failed" != "0" ]]; then
    invalidate_restore_receipt || cleanup_failed=1
  fi

  if [[ "$cleanup_failed" != "0" ]]; then
    printf '%s\n' "Restore drill cleanup failed." >&2
    exit 1
  fi
  if [[ "$original_status" == "0" && "$MAIN_SUCCEEDED" == "1" ]]; then
    printf '%s\n' "Restore drill succeeded."
    exit 0
  fi
  exit "$original_status"
}

validate_inputs() {
  [[ "$IMAGE_TAG" =~ ^sha-[0-9a-f]{40}$ ]] || fail "Restore-drill image identity is malformed."
  [[ "$IMAGE_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]] || fail "Restore-drill image identity is malformed."
  [[ "$APP_VERSION" == "$IMAGE_TAG" ]] || fail "Restore-drill application version must equal its immutable image tag."
  [[ "$DOCKER_IMAGE" =~ ^[a-z0-9][a-z0-9./_-]*[a-z0-9]$ ]] || fail "Restore-drill image repository is malformed."
  require_bounded_integer "$BACKUP_MAX_AGE_HOURS" 1 168 || fail "Restore-drill backup freshness limit is invalid."
  require_bounded_integer "$DOCKER_TIMEOUT_SECONDS" 30 900 || fail "Restore-drill Docker timeout is invalid."
  require_bounded_integer "$SMOKE_TIMEOUT_SECONDS" 10 300 || fail "Restore-drill smoke timeout is invalid."
  # This URL exists only inside the candidate container's network namespace.
  # The host never publishes the restore-drill HTTP port.
  RESTORE_BASE_URL="http://127.0.0.1:3000"
}

validate_offsite_boundary() {
  [[ -d "$DEPLOY_ROOT" && ! -L "$DEPLOY_ROOT" ]] || fail "Deployment state root is unavailable or unsafe."
  [[ "$(stat -c '%u:%g:%a' "$DEPLOY_ROOT")" == "0:0:755" ]] || fail "Deployment state root metadata does not match policy."
  [[ -d "$OFFSITE_DIR" && ! -L "$OFFSITE_DIR" ]] || fail "Offsite restore source is unavailable or unsafe."
  [[ -d "$OFFSITE_RECEIPT_DIR" && ! -L "$OFFSITE_RECEIPT_DIR" ]] || fail "Root receipt directory is unavailable or unsafe."
  [[ "$(stat -c '%u:%g:%a' "$OFFSITE_DIR")" == "0:0:700" ]] || fail "Offsite restore source must be root-private."
  [[ "$(stat -c '%u:%g:%a' "$OFFSITE_RECEIPT_DIR")" == "0:0:700" ]] || fail "Offsite receipts must be root-private."
  "$PYTHON_BIN" "$CONTROL_ROOT/validate-operations-config.py" deploy \
    /etc/gshsapp-operations/deploy.env \
    --host-role-file /etc/gshsapp-operations/host-role --verify-pinned-offsite || {
    fail "Offsite restore mount identity, ownership, or hardening does not match policy."
  }
}

write_runtime_env() {
  local auth_secret
  if ! auth_secret="$(env -i PATH="$PATH" LC_ALL=C "$PYTHON_BIN" -c 'import secrets; print(secrets.token_hex(48))' 2>/dev/null)"; then
    fail "Unable to generate the isolated restore-drill secret."
  fi
  [[ "$auth_secret" =~ ^[a-f0-9]{96}$ ]] || fail "Unable to generate the isolated restore-drill secret."
  cat >"$RUNTIME_ENV_FILE" <<EOF
AUTH_SECRET=$auth_secret
AUTH_TRUST_HOST=true
AUTH_URL=$RESTORE_BASE_URL
DATABASE_URL=file:/app/data/dev.db
NEXTAUTH_URL=$RESTORE_BASE_URL
NEXT_PUBLIC_APP_URL=$RESTORE_BASE_URL
TRUSTED_PROXY_HOPS=1
EOF
  chmod 0600 "$RUNTIME_ENV_FILE"
}

write_compose_env() {
  cat >"$DEPLOY_ENV_FILE" <<EOF
APP_VERSION=$APP_VERSION
DOCKER_IMAGE=$DOCKER_IMAGE
IMAGE_DIGEST=$IMAGE_DIGEST
CONTAINER_NAME=$CONTAINER_NAME
EOF
  chmod 0600 "$DEPLOY_ENV_FILE"
}

write_isolated_compose() {
  cat >"$COMPOSE_FILE" <<'YAML'
services:
  migrate:
    image: ${DOCKER_IMAGE:?DOCKER_IMAGE is required}@${IMAGE_DIGEST:?IMAGE_DIGEST is required}
    restart: "no"
    logging:
      driver: none
    user: "61001:61001"
    read_only: true
    init: true
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
    pids_limit: 128
    mem_limit: 1536m
    memswap_limit: 1536m
    cpus: 2.0
    network_mode: none
    labels:
      io.gshsapp.restore-drill: managed-v1
    env_file:
      - ./.env
    environment:
      NODE_ENV: production
      NODE_OPTIONS: ""
      NODE_PATH: ""
      DATA_ROOT: /app/data
      DATABASE_URL: file:/app/data/dev.db
      TMPDIR: /tmp
      TZ: Asia/Seoul
    volumes:
      - ./validated/data:/app/data:rw
    tmpfs:
      - /tmp:rw,noexec,nosuid,nodev,size=32m,uid=61001,gid=61001,mode=1700
    command:
      - node
      - scripts/migrate-production.mjs

  web:
    container_name: ${CONTAINER_NAME:?CONTAINER_NAME is required}
    image: ${DOCKER_IMAGE:?DOCKER_IMAGE is required}@${IMAGE_DIGEST:?IMAGE_DIGEST is required}
    restart: "no"
    logging:
      driver: none
    user: "61001:61001"
    read_only: true
    init: true
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
    pids_limit: 256
    mem_limit: 1024m
    memswap_limit: 1024m
    cpus: 2.0
    labels:
      io.gshsapp.restore-drill: managed-v1
    network_mode: none
    env_file:
      - ./.env
    environment:
      NODE_ENV: production
      NODE_OPTIONS: ""
      NODE_PATH: ""
      PORT: "3000"
      HOSTNAME: 0.0.0.0
      TZ: Asia/Seoul
      TMPDIR: /tmp
      APP_VERSION: ${APP_VERSION:?APP_VERSION is required}
      APP_IMAGE_DIGEST: ${IMAGE_DIGEST:?IMAGE_DIGEST is required}
      DATA_ROOT: /app/data
      DATABASE_URL: file:/app/data/dev.db
      BACKUP_DIR: /app/data/backup
      RESTORE_ROOT: /app/data/restore
      WEATHER_CACHE_PATH: /app/data/weather-cache.json
    volumes:
      - ./validated/data:/app/data:rw
    tmpfs:
      - /tmp:rw,noexec,nosuid,nodev,size=64m,uid=61001,gid=61001,mode=1700
      - /app/.next/cache:rw,noexec,nosuid,nodev,size=128m,uid=61001,gid=61001,mode=1700
    healthcheck:
      test:
        - CMD
        - node
        - -e
        - "fetch('http://127.0.0.1:3000/api/health').then(async r=>{const b=await r.json();if(!r.ok||b.ok!==true)process.exit(1)}).catch(()=>process.exit(1))"
      interval: 5s
      timeout: 3s
      start_period: 20s
      retries: 12
YAML
  chmod 0600 "$COMPOSE_FILE"
}

prepare_restore_source() {
  local selection receipt_sha256 receipt_size receipt_created_at
  local -a receipt_fields=()
  mkdir -m 0700 "$TEMP_DIR/input"
  if ! selection="$(env -i PATH="$PATH" LC_ALL=C \
    RECEIPT_DIR="$OFFSITE_RECEIPT_DIR" BACKUP_MAX_AGE_HOURS="$BACKUP_MAX_AGE_HOURS" \
    "$PYTHON_BIN" - <<'PY' 2>/dev/null
import datetime as dt
import json
import os
from pathlib import Path
import re
import stat

NAME = re.compile(r"(backup-\d{8}-\d{6}-[a-f0-9]{8}\.tar\.gz)\.receipt\.json\Z")
TIMESTAMP = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\Z")
SHA256 = re.compile(r"[a-f0-9]{64}\Z")
KEYS = {"format", "version", "file", "createdAt", "exportedAt", "size", "sha256"}
receipt_dir = Path(os.path.abspath(os.environ["RECEIPT_DIR"]))
maximum_age = int(os.environ["BACKUP_MAX_AGE_HOURS"]) * 60 * 60
now = dt.datetime.now(dt.timezone.utc)

def strict_json(path):
    details = path.lstat()
    if path.is_symlink() or not stat.S_ISREG(details.st_mode) or details.st_nlink != 1 or details.st_size <= 0 or details.st_size > 64 * 1024:
        raise ValueError("unsafe receipt")
    def pairs(items):
        output = {}
        for key, value in items:
            if key in output:
                raise ValueError("duplicate receipt key")
            output[key] = value
        return output
    return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=pairs)

def timestamp(value):
    if not isinstance(value, str) or TIMESTAMP.fullmatch(value) is None:
        raise ValueError("timestamp")
    return dt.datetime.strptime(value, "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=dt.timezone.utc)

candidates = []
for path in receipt_dir.iterdir():
    match = NAME.fullmatch(path.name)
    if match is None:
        continue
    try:
        value = strict_json(path)
        created = timestamp(value.get("createdAt"))
        exported = timestamp(value.get("exportedAt"))
        age = (now - created).total_seconds()
        if (
            not isinstance(value, dict)
            or set(value) != KEYS
            or value.get("format") != "gshsapp-offsite-receipt"
            or value.get("version") != 1
            or value.get("file") != match.group(1)
            or type(value.get("size")) is not int
            or value["size"] <= 0
            or not isinstance(value.get("sha256"), str)
            or SHA256.fullmatch(value["sha256"]) is None
            or age < -300
            or age > maximum_age
            or exported < created
            or (exported - now).total_seconds() > 300
        ):
            continue
        candidates.append((created, exported, match.group(1), value["sha256"], value["size"], value["createdAt"]))
    except (OSError, UnicodeError, ValueError, json.JSONDecodeError):
        continue
if not candidates:
    raise SystemExit(1)
selected = max(candidates, key=lambda item: (item[0], item[1], item[2]))
print(selected[2])
print(selected[3])
print(selected[4])
print(selected[5])
PY
  )"; then
    fail "No fresh root-receipted offsite backup is available."
  fi
  selection="${selection//$'\r'/}"
  mapfile -t receipt_fields <<<"$selection"
  [[ "${#receipt_fields[@]}" == "4" ]] || fail "No fresh root-receipted offsite backup is available."
  selection="${receipt_fields[0]}"
  receipt_sha256="${receipt_fields[1]}"
  receipt_size="${receipt_fields[2]}"
  receipt_created_at="${receipt_fields[3]}"
  [[ "$selection" =~ ^backup-[0-9]{8}-[0-9]{6}-[a-f0-9]{8}\.tar\.gz$ ]] || fail "No fresh root-receipted offsite backup is available."
  [[ "$receipt_sha256" =~ ^[a-f0-9]{64}$ && "$receipt_size" =~ ^[1-9][0-9]*$ && "$receipt_created_at" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$ ]] || fail "No fresh root-receipted offsite backup is available."
  if ! env -i PATH="$PATH" LC_ALL=C "$PYTHON_BIN" "$CONTROL_ROOT/bootstrap-backup.py" verify-receipt \
    --offsite-dir "$OFFSITE_DIR" --receipt-dir "$OFFSITE_RECEIPT_DIR" --name "$selection" >/dev/null 2>&1; then
    fail "Root offsite receipt verification failed."
  fi
  if ! selection="$(env -i PATH="$PATH" LC_ALL=C \
    BACKUP_DIR="$OFFSITE_DIR" BACKUP_MAX_AGE_HOURS="$BACKUP_MAX_AGE_HOURS" SELECTED_NAME="$selection" \
    EXPECTED_SHA256="$receipt_sha256" EXPECTED_SIZE="$receipt_size" EXPECTED_CREATED_AT="$receipt_created_at" \
    STAGING_DIR="$TEMP_DIR/input" "$PYTHON_BIN" - <<'PY' 2>/dev/null
import datetime as dt
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import stat

NAME = re.compile(r"backup-\d{8}-\d{6}-[a-f0-9]{8}\.tar\.gz\Z")
TIMESTAMP = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\Z")
SHA256 = re.compile(r"[a-f0-9]{64}\Z")
KEYS = {"format", "version", "file", "createdAt", "reason", "size", "sha256"}
MAX_ARCHIVE = 512 * 1024 * 1024
MAX_METADATA = 64 * 1024

backup_dir = Path(os.path.abspath(os.environ["BACKUP_DIR"]))
staging_dir = Path(os.path.abspath(os.environ["STAGING_DIR"]))
maximum_age = int(os.environ["BACKUP_MAX_AGE_HOURS"]) * 60 * 60
expected_sha256 = os.environ["EXPECTED_SHA256"]
expected_size = int(os.environ["EXPECTED_SIZE"])
expected_created_at = os.environ["EXPECTED_CREATED_AT"]
listed = backup_dir.lstat()
if not stat.S_ISDIR(listed.st_mode) or backup_dir.is_symlink():
    raise SystemExit(1)

use_directory_fd = os.open in os.supports_dir_fd and os.listdir in os.supports_fd
directory_fd = os.open(backup_dir, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0)) if use_directory_fd else None

def unchanged(before, after):
    return (before.st_dev, before.st_ino, before.st_mode, before.st_nlink, before.st_size, before.st_mtime_ns, before.st_ctime_ns) == (
        after.st_dev, after.st_ino, after.st_mode, after.st_nlink, after.st_size, after.st_mtime_ns, after.st_ctime_ns
    )

def open_regular(name, maximum):
    target = name if use_directory_fd else backup_dir / name
    options = {"dir_fd": directory_fd} if use_directory_fd else {}
    descriptor = os.open(target, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0), **options)
    details = os.fstat(descriptor)
    if not stat.S_ISREG(details.st_mode) or details.st_nlink != 1 or details.st_size <= 0 or details.st_size > maximum:
        os.close(descriptor)
        raise ValueError("unsafe file")
    return descriptor, details

def strict_json(raw):
    def pairs(items):
        output = {}
        for key, value in items:
            if key in output:
                raise ValueError("duplicate key")
            output[key] = value
        return output
    return json.loads(raw.decode("utf-8"), object_pairs_hook=pairs)

def validate(name, destination=None):
    metadata_name = name + ".json"
    metadata_fd, metadata_before = open_regular(metadata_name, MAX_METADATA)
    try:
        metadata_raw = b""
        while True:
            block = os.read(metadata_fd, 65536)
            if not block:
                break
            metadata_raw += block
        metadata_after = os.fstat(metadata_fd)
    finally:
        os.close(metadata_fd)
    if not unchanged(metadata_before, metadata_after):
        raise ValueError("metadata changed")
    value = strict_json(metadata_raw)
    if not isinstance(value, dict) or set(value) != KEYS:
        raise ValueError("metadata shape")
    created_at = value.get("createdAt")
    if not isinstance(created_at, str) or TIMESTAMP.fullmatch(created_at) is None:
        raise ValueError("timestamp shape")
    created = dt.datetime.strptime(created_at, "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=dt.timezone.utc)
    now = dt.datetime.now(dt.timezone.utc)
    age = (now - created).total_seconds()
    size = value.get("size")
    digest = value.get("sha256")
    if (
        value.get("format") != "gshsapp-backup"
        or value.get("version") != 2
        or value.get("file") != name
        or not isinstance(value.get("reason"), str)
        or not value["reason"]
        or type(size) is not int
        or not isinstance(digest, str)
        or SHA256.fullmatch(digest) is None
        or created_at != expected_created_at
        or size != expected_size
        or digest != expected_sha256
        or age < -300
        or age > maximum_age
    ):
        raise ValueError("metadata identity")

    archive_fd, archive_before = open_regular(name, MAX_ARCHIVE)
    output_fd = None
    try:
        if destination is not None:
            output_fd = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        calculated = hashlib.sha256()
        copied = 0
        while True:
            block = os.read(archive_fd, 1024 * 1024)
            if not block:
                break
            copied += len(block)
            calculated.update(block)
            if output_fd is not None:
                os.write(output_fd, block)
        if output_fd is not None:
            os.fsync(output_fd)
        archive_after = os.fstat(archive_fd)
    finally:
        os.close(archive_fd)
        if output_fd is not None:
            os.close(output_fd)
    if not unchanged(archive_before, archive_after) or copied != size or size != archive_before.st_size:
        raise ValueError("archive changed")
    if not hmac.compare_digest(calculated.hexdigest(), digest):
        raise ValueError("checksum")
    return created

try:
    selected = os.environ["SELECTED_NAME"]
    if NAME.fullmatch(selected) is None:
        raise SystemExit(1)
    archive_target = staging_dir / selected
    validate(selected, archive_target)
    metadata_source = selected + ".json"
    metadata_fd, metadata_before = open_regular(metadata_source, MAX_METADATA)
    try:
        raw = b""
        while True:
            block = os.read(metadata_fd, 65536)
            if not block:
                break
            raw += block
        metadata_after = os.fstat(metadata_fd)
    finally:
        os.close(metadata_fd)
    if not unchanged(metadata_before, metadata_after):
        raise SystemExit(1)
    metadata_target = staging_dir / metadata_source
    with metadata_target.open("xb") as output:
        output.write(raw)
        output.flush()
        os.fsync(output.fileno())
    print(selected)
finally:
    if directory_fd is not None:
        os.close(directory_fd)
PY
  )"; then
    fail "No fresh validated backup pair is available."
  fi
  [[ "$selection" =~ ^backup-[0-9]{8}-[0-9]{6}-[a-f0-9]{8}\.tar\.gz$ ]] || fail "No fresh validated backup pair is available."
  RESTORE_SOURCE_NAME="$selection"
  RESTORE_SOURCE_RECEIPT_SHA256="$(
    env -i PATH="$PATH" LC_ALL=C RECEIPT_PATH="$OFFSITE_RECEIPT_DIR/$selection.receipt.json" \
      "$PYTHON_BIN" - <<'PY'
import hashlib
import os
from pathlib import Path

path = Path(os.environ["RECEIPT_PATH"])
digest = hashlib.sha256()
with path.open("rb") as source:
    for block in iter(lambda: source.read(1024 * 1024), b""):
        digest.update(block)
print(digest.hexdigest())
PY
  )" || fail "Root offsite receipt digest could not be captured."
  [[ "$RESTORE_SOURCE_RECEIPT_SHA256" =~ ^[a-f0-9]{64}$ ]] || fail "Root offsite receipt digest is malformed."
  LATEST_BACKUP_NAME="$selection"
  chown -R "$APP_UID:$APP_GID" "$TEMP_DIR/input"
  chmod 0500 "$TEMP_DIR/input"
  chmod 0400 "$TEMP_DIR/input/$RESTORE_SOURCE_NAME" "$TEMP_DIR/input/$RESTORE_SOURCE_NAME.json"

  mkdir -m 0700 "$TEMP_DIR/validated"
  if ! mount -t tmpfs \
    -o "rw,nosuid,nodev,noexec,size=${RESTORE_DATA_TMPFS_MIB}m,nr_inodes=12000,uid=$APP_UID,gid=$APP_GID,mode=0700" \
      gshsapp-restore-drill-data "$TEMP_DIR/validated"; then
    fail "Unable to create the bounded restore-drill data filesystem."
  fi
  RESTORE_DATA_MOUNT="$TEMP_DIR/validated"
  mount_state="$(findmnt --noheadings --raw --output FSTYPE,OPTIONS --mountpoint "$RESTORE_DATA_MOUNT")" || \
    fail "Unable to verify the bounded restore-drill data filesystem."
  MOUNT_STATE="$mount_state" "$PYTHON_BIN" - <<'PY' || fail "Restore-drill data filesystem limits do not match policy."
import os
parts=os.environ["MOUNT_STATE"].split(None,1)
if len(parts)!=2 or parts[0]!="tmpfs": raise SystemExit(1)
options=set(parts[1].split(","))
required={"rw","nosuid","nodev","noexec","size=786432k","nr_inodes=12000","uid=61001","gid=61001","mode=700"}
if not required.issubset(options): raise SystemExit(1)
PY
  if ! run_timed docker run --rm \
    --log-driver none \
    --label "$DRILL_LABEL" \
    --network none \
    --read-only \
    --cap-drop ALL \
    --security-opt no-new-privileges \
    --memory 1536m \
    --memory-swap 1536m \
    --pids-limit 128 \
    --cpus 2 \
    --user "$APP_UID:$APP_GID" \
    --tmpfs /tmp:rw,noexec,nosuid,nodev,size=64m,uid=$APP_UID,gid=$APP_GID,mode=1700 \
    --mount "type=bind,src=$TEMP_DIR/input,dst=/input,readonly" \
    --mount "type=bind,src=$TEMP_DIR/validated,dst=/output" \
    "${DOCKER_IMAGE}@${IMAGE_DIGEST}" \
    node .next/ops/validate-backup.mjs "/input/$RESTORE_SOURCE_NAME" /output --migrate-reviewed-input \
    >/dev/null 2>&1; then
    fail "Isolated backup validation failed."
  fi

  env -i PATH="$PATH" LC_ALL=C VALIDATED_ROOT="$TEMP_DIR/validated" "$PYTHON_BIN" - <<'PY' 2>/dev/null || fail "Isolated backup validation failed."
import os
from pathlib import Path
import stat

root = Path(os.environ["VALIDATED_ROOT"])
data = root / "data"
database = data / "dev.db"
for path, expected in ((root, "directory"), (data, "directory"), (database, "file")):
    details = path.lstat()
    if path.is_symlink() or (expected == "directory" and not stat.S_ISDIR(details.st_mode)) or (expected == "file" and (not stat.S_ISREG(details.st_mode) or details.st_nlink != 1)):
        raise SystemExit(1)
PY
}

verify_effective_isolation() {
  local container_id inspect_state
  if ! container_id="$(compose ps -q web 2>/dev/null)"; then
    fail "Unable to inspect the restore-drill container."
  fi
  [[ "$container_id" =~ ^[a-f0-9]{12,64}$ ]] || fail "Unable to inspect the restore-drill container."
  if ! inspect_state="$(run_timed docker inspect --format '{{.Config.User}}|{{index .Config.Labels "io.gshsapp.restore-drill"}}|{{.HostConfig.NetworkMode}}|{{.HostConfig.ReadonlyRootfs}}|{{json .HostConfig.SecurityOpt}}|{{json .HostConfig.CapDrop}}|{{.HostConfig.RestartPolicy.Name}}|{{.HostConfig.Privileged}}|{{json .HostConfig.PortBindings}}|{{.HostConfig.PublishAllPorts}}|{{json .NetworkSettings.Networks}}|{{json .NetworkSettings.Ports}}|{{.HostConfig.LogConfig.Type}}' "$container_id" 2>/dev/null)"; then
    fail "Unable to inspect the restore-drill container."
  fi
  env -i PATH="$PATH" LC_ALL=C \
    INSPECT_STATE="$inspect_state" \
    "$PYTHON_BIN" - <<'PY' 2>/dev/null || fail "Restore-drill network isolation did not match policy."
import json
import os

parts = os.environ["INSPECT_STATE"].split("|", 12)
if len(parts) != 13:
    raise SystemExit(1)
user, label, mode, read_only, security, caps, restart, privileged, bindings_raw, publish_all, networks_raw, ports_raw, log_driver = parts
if (user, label, mode, read_only, restart, privileged, log_driver) != (
    "61001:61001", "managed-v1", "none", "true", "no", "false", "none"
):
    raise SystemExit(1)
if "no-new-privileges:true" not in json.loads(security) or "ALL" not in json.loads(caps):
    raise SystemExit(1)
if publish_all != "false" or json.loads(bindings_raw) not in (None, {}):
    raise SystemExit(1)
networks = json.loads(networks_raw)
ports = json.loads(ports_raw)
if networks not in (None, {}) and (set(networks) != {"none"} or any(value.get("IPAddress") or value.get("Gateway") for value in networks.values())):
    raise SystemExit(1)
if ports not in (None, {}) and (not isinstance(ports, dict) or any(value is not None for value in ports.values())):
    raise SystemExit(1)
PY
}

verify_container_probe() {
  local container_id probe_script
  container_id="$(compose ps -q web 2>/dev/null)" || fail "Unable to inspect the restore-drill container."
  [[ "$container_id" =~ ^[a-f0-9]{12,64}$ ]] || fail "Unable to inspect the restore-drill container."
  read -r -d '' probe_script <<'JS' || :
const origin = "http://127.0.0.1:3000";
const expectedVersion = process.env.EXPECTED_VERSION;
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const credentials = JSON.parse(Buffer.concat(chunks).toString("utf8"));
if (typeof credentials.userId !== "string" || typeof credentials.password !== "string") process.exit(1);

const cookies = new Map();
function absorbCookies(response) {
  const raw = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : (response.headers.get("set-cookie") || "").split(/,(?=\s*[^;,=]+=)/u);
  for (const line of raw) {
    const pair = line.split(";", 1)[0];
    const separator = pair.indexOf("=");
    if (separator > 0) cookies.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
  }
}
function cookieHeader() {
  return [...cookies].map(([key, value]) => `${key}=${value}`).join("; ");
}
async function localFetch(path, options = {}) {
  let url = new URL(path, origin);
  let method = options.method || "GET";
  let body = options.body;
  for (let redirect = 0; redirect < 6; redirect += 1) {
    const headers = new Headers(options.headers || {});
    headers.set("x-forwarded-for", "127.0.0.1");
    if (cookies.size) headers.set("Cookie", cookieHeader());
    const response = await fetch(url, { method, body, headers, redirect: "manual", signal: AbortSignal.timeout(10000) });
    absorbCookies(response);
    if (![301, 302, 303, 307, 308].includes(response.status)) return { response, url };
    const location = response.headers.get("location");
    if (!location) process.exit(1);
    url = new URL(location, url);
    if (url.origin !== origin) process.exit(1);
    if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === "POST")) {
      method = "GET";
      body = undefined;
    }
  }
  process.exit(1);
}

const healthResult = await localFetch("/api/health");
if (!healthResult.response.ok) process.exit(1);
const health = await healthResult.response.json();
if (health.ok !== true || health.service !== "gshsapp" || health.version !== expectedVersion || typeof health.memberServiceSuspended !== "boolean") process.exit(1);

const csrfResult = await localFetch("/api/auth/csrf");
if (!csrfResult.response.ok) process.exit(1);
const csrf = await csrfResult.response.json();
if (typeof csrf.csrfToken !== "string" || !csrf.csrfToken) process.exit(1);
const loginBody = new URLSearchParams({
  csrfToken: csrf.csrfToken,
  userId: credentials.userId,
  password: credentials.password,
  callbackUrl: origin + "/admin",
  json: "true",
});
await localFetch("/api/auth/callback/credentials", {
  method: "POST",
  body: loginBody,
  headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: origin, Referer: origin + "/login" },
});
const adminResult = await localFetch("/admin");
const adminBody = Buffer.from(await adminResult.response.arrayBuffer());
if (adminBody.length > 2 * 1024 * 1024 || adminBody.includes(Buffer.from("Application error"))) process.exit(1);
if (health.memberServiceSuspended) {
  if (adminResult.url.pathname.startsWith("/admin")) process.exit(1);
} else if (!adminResult.response.ok || !adminResult.url.pathname.startsWith("/admin")) {
  process.exit(1);
}
JS
  if ! env -i PATH="$PATH" LC_ALL=C \
    E2E_ADMIN_USER="$E2E_ADMIN_USER" E2E_ADMIN_PASSWORD="$E2E_ADMIN_PASSWORD" \
    "$PYTHON_BIN" -c 'import json,os; print(json.dumps({"userId": os.environ["E2E_ADMIN_USER"], "password": os.environ["E2E_ADMIN_PASSWORD"]}, separators=(",", ":")))' \
    | run_timed docker exec -i --env "EXPECTED_VERSION=$APP_VERSION" "$container_id" node -e "$probe_script" \
      >/dev/null 2>&1; then
    fail "Restore-drill health and authentication verification failed."
  fi
}

write_output_file() {
  [[ -n "$RESTORE_DRILL_OUTPUT_FILE" ]] || return 0
  cat >"$RESTORE_DRILL_OUTPUT_FILE" <<EOF
RESTORE_SOURCE_NAME=$RESTORE_SOURCE_NAME
LATEST_BACKUP_NAME=$LATEST_BACKUP_NAME
RESTORE_BASE_URL=$RESTORE_BASE_URL
RESTORE_VERSION=$APP_VERSION
EOF
  chmod 0600 "$RESTORE_DRILL_OUTPUT_FILE"
}

publish_restore_receipt() {
  local control_digest temporary target="$RESTORE_RECEIPT_TARGET"
  control_digest="$(sha256sum "$CONTROL_ROOT/control-assets.sha256" | awk '{print $1}')" || fail "Control manifest digest could not be captured."
  [[ "$control_digest" =~ ^[a-f0-9]{64}$ && "$RESTORE_SOURCE_RECEIPT_SHA256" =~ ^[a-f0-9]{64}$ ]] || fail "Restore receipt identity is malformed."
  temporary="$(mktemp "$DEPLOY_ROOT/.restore-drill-receipt.XXXXXX")" || fail "Restore receipt staging failed."
  IMAGE_TAG_VALUE="$IMAGE_TAG" IMAGE_DIGEST_VALUE="$IMAGE_DIGEST" CONTROL_DIGEST_VALUE="$control_digest" \
    BACKUP_NAME_VALUE="$RESTORE_SOURCE_NAME" BACKUP_RECEIPT_VALUE="$RESTORE_SOURCE_RECEIPT_SHA256" \
    "$PYTHON_BIN" - "$temporary" <<'PY' || fail "Restore receipt generation failed."
import datetime,json,os,sys
with open(sys.argv[1],"w",encoding="utf-8",newline="\n") as output:
    json.dump({"format":"gshsapp-restore-drill-receipt","version":1,"imageTag":os.environ["IMAGE_TAG_VALUE"],"imageDigest":os.environ["IMAGE_DIGEST_VALUE"],"controlManifestSha256":os.environ["CONTROL_DIGEST_VALUE"],"backup":os.environ["BACKUP_NAME_VALUE"],"offsiteReceiptSha256":os.environ["BACKUP_RECEIPT_VALUE"],"completedAt":datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00","Z")},output,separators=(",",":"));output.write("\n");output.flush();os.fsync(output.fileno())
PY
  chown root:root "$temporary"
  chmod 0400 "$temporary"
  mv -fT "$temporary" "$target"
  sync -d "$target"
  sync -d "$DEPLOY_ROOT"
}

assert_restore_candidate_approval() {
  local approval="$DEPLOY_ROOT/approved-release.json" role_file=/etc/gshsapp-operations/host-role role control_digest
  [[ -f "$approval" && ! -L "$approval" && "$(stat -c '%u:%g:%a:%h' "$approval")" == "0:0:400:1" ]] || fail "Fresh root release approval is required before a restore drill."
  [[ -f "$role_file" && ! -L "$role_file" && "$(stat -c '%u:%g:%a:%h' "$role_file")" == "0:0:400:1" ]] || fail "Immutable host role is unavailable."
  role="$(<"$role_file")"
  [[ "$role" == "test" || "$role" == "prod" ]] || fail "Immutable host role is invalid."
  control_digest="$(sha256sum "$CONTROL_ROOT/control-assets.sha256" | awk '{print $1}')" || fail "Control manifest digest could not be resolved."
  APPROVAL_FILE="$approval" EXPECTED_ROLE="$role" EXPECTED_SHA="${IMAGE_TAG#sha-}" EXPECTED_DIGEST="$IMAGE_DIGEST" EXPECTED_CONTROL="$control_digest" \
    "$PYTHON_BIN" - <<'PY' || fail "Root release approval does not authorize this restore candidate."
import datetime,json,os
try: value=json.load(open(os.environ["APPROVAL_FILE"],encoding="utf-8"))
except Exception: raise SystemExit(1)
keys={"format","version","hostRole","candidateSha","imageDigest","controlManifestSha256","preproductionRunId","preproductionRunAttempt","approvedAt"}
if set(value)!=keys or value["format"]!="gshsapp-approved-release" or value["version"]!=2 or value["hostRole"]!=os.environ["EXPECTED_ROLE"] or value["candidateSha"]!=os.environ["EXPECTED_SHA"] or value["imageDigest"]!=os.environ["EXPECTED_DIGEST"] or value["controlManifestSha256"]!=os.environ["EXPECTED_CONTROL"]: raise SystemExit(1)
if value["hostRole"]=="prod" and (not isinstance(value["preproductionRunId"],int) or value["preproductionRunId"]<1 or not isinstance(value["preproductionRunAttempt"],int) or value["preproductionRunAttempt"]<1): raise SystemExit(1)
if value["hostRole"]=="test" and (value["preproductionRunId"] is not None or value["preproductionRunAttempt"] is not None): raise SystemExit(1)
approved=datetime.datetime.fromisoformat(value["approvedAt"].replace("Z","+00:00")); now=datetime.datetime.now(datetime.timezone.utc)
if approved.tzinfo is None or approved>now+datetime.timedelta(minutes=5) or now-approved>datetime.timedelta(hours=24): raise SystemExit(1)
PY
}

[[ "$(id -u)" == "0" ]] || fail "Restore drill must run from the trusted root console."
current_script="$(readlink -f -- "${BASH_SOURCE[0]}")" || fail "Restore-drill control path cannot be resolved."
[[ "$current_script" == "$CONTROL_ROOT/restore-drill.sh" ]] || fail "Run only the installed authenticated restore-drill control."
[[ -f "$current_script" && ! -L "$current_script" && "$(stat -c '%u:%g:%a:%h' "$current_script")" == "0:0:400:1" ]] || fail "Installed restore-drill control is unsafe."
/bin/bash "$CONTROL_ROOT/install-root-operations.sh" --verify-installed || fail "Installed root controls failed verification."
[[ "${GSHSAPP_OFFSITE_PINNED:-}" == manual ]] || fail "Run restore through the authenticated pin-offsite-operation.sh helper."
assert_restore_candidate_approval
validate_inputs
require_command docker
require_command "$PYTHON_BIN"
require_command "$TIMEOUT_BIN"
require_command findmnt
require_command stat
require_command flock
require_command mount
require_command umount
require_command find
install -d -o root -g root -m 0700 "$(dirname "$LIFECYCLE_LOCK_FILE")"
exec 9>"$LIFECYCLE_LOCK_FILE"
flock -n 9 || fail "Deployment, backup, import, or another restore drill is active."
invalidate_restore_receipt || fail "A prior restore-drill receipt could not be safely invalidated."
LIFECYCLE_LOCK_HELD=1 DEPLOY_ROOT="$DEPLOY_ROOT" \
  /bin/bash "$CONTROL_ROOT/recover-backup-writer.sh" || fail "Pending backup writer recovery failed."
LIFECYCLE_LOCK_HELD=1 DEPLOY_ROOT="$DEPLOY_ROOT" \
  /bin/bash "$CONTROL_ROOT/recover-deployment-writer.sh" || fail "Pending deployment writer recovery failed."
run_timed docker info >/dev/null 2>&1 || fail "Docker daemon is unavailable."
run_timed docker compose version >/dev/null 2>&1 || fail "Docker Compose plugin is required."
validate_offsite_boundary

printf '%s\n' "Restore drill started."
sweep_managed_resources || fail "Unable to remove stale managed restore-drill resources."
recover_stale_restore_workspace || fail "Unable to recover a stale restore-drill workspace."

TEMP_DIR="$(mktemp -d "$DEPLOY_ROOT/.restore-drill.XXXXXX")" || fail "Unable to create the private restore-drill workspace."
chmod 0700 "$TEMP_DIR"
write_restore_phase || fail "Unable to durably record the restore-drill workspace."
CLEANUP_ARMED=1
trap cleanup EXIT

project_nonce="$(env -i PATH="$PATH" LC_ALL=C "$PYTHON_BIN" -c 'import secrets; print(secrets.token_hex(4))' 2>/dev/null)" || fail "Unable to generate the restore-drill project identity."
[[ "$project_nonce" =~ ^[a-f0-9]{8}$ ]] || fail "Unable to generate the restore-drill project identity."
PROJECT_NAME="gshsapp-restore-$(date '+%s')-$project_nonce"
CONTAINER_NAME="${PROJECT_NAME}-web"
DEPLOY_ENV_FILE="$TEMP_DIR/.deploy.env"
COMPOSE_FILE="$TEMP_DIR/compose.yml"
RUNTIME_ENV_FILE="$TEMP_DIR/.env"
write_runtime_env
write_compose_env
write_isolated_compose

image_ref="${DOCKER_IMAGE}@${IMAGE_DIGEST}"
run_timed docker pull "$image_ref" >/dev/null 2>&1 || fail "Unable to pull the immutable restore-drill image."
image_revision="$(run_timed docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$image_ref" 2>/dev/null)" || fail "Unable to inspect the immutable restore-drill image."
[[ "$image_revision" == "${IMAGE_TAG#sha-}" ]] || fail "Restore-drill image revision does not match its immutable tag."

prepare_restore_source
validate_offsite_boundary

compose config --quiet >/dev/null 2>&1 || fail "Generated restore-drill Compose configuration is invalid."
compose run --rm --no-deps migrate >/dev/null 2>&1 || fail "Restore-drill migration failed."
compose up -d --remove-orphans --wait --wait-timeout "$SMOKE_TIMEOUT_SECONDS" web >/dev/null 2>&1 || fail "Restore-drill container startup failed."
verify_effective_isolation
verify_container_probe
write_output_file
cleanup_runtime || fail "Restore drill cleanup failed."
publish_restore_receipt
MAIN_SUCCEEDED=1
