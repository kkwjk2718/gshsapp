#!/usr/bin/env bash
set -Eeuo pipefail

PATH=/usr/sbin:/usr/bin:/sbin:/bin
LC_ALL=C
export PATH LC_ALL
IFS=$' \t\n'
umask 077

CONTROL_ROOT="${CONTROL_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
DEPLOY_ROOT="${DEPLOY_ROOT:-/opt/gshsapp}"
DATA_DIR="${DATA_DIR:-$DEPLOY_ROOT/data}"
BACKUP_DIR="${BACKUP_DIR:-$DEPLOY_ROOT/root-backup}"
DB_FILE="${DB_FILE:-$DATA_DIR/dev.db}"
PROJECT_NAME="${PROJECT_NAME:-gshsapp}"
CONTAINER_NAME="${CONTAINER_NAME:-gshsapp-web}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
TIMEOUT_BIN="${TIMEOUT_BIN:-timeout}"
CANDIDATE_VALIDATION_TIMEOUT_SECONDS="${CANDIDATE_VALIDATION_TIMEOUT_SECONDS:-600}"
CANDIDATE_OUTPUT_STREAM_TIMEOUT_SECONDS="${CANDIDATE_OUTPUT_STREAM_TIMEOUT_SECONDS:-180}"
VALIDATOR_DOCKER_TIMEOUT_SECONDS="${VALIDATOR_DOCKER_TIMEOUT_SECONDS:-60}"
DOCKER_IMAGE="${DOCKER_IMAGE:?DOCKER_IMAGE is required}"
IMAGE_DIGEST="${IMAGE_DIGEST:?IMAGE_DIGEST is required}"
VALIDATION_ROOT=""
BOOTSTRAP_NAME=""
BOOTSTRAP_COMMITTED=false
VALIDATION_CONTAINER_ID=""
VALIDATION_CONTAINER_NAME=""
VALIDATION_CONTAINER_NONCE=""
OFFSITE_DIR="${OFFSITE_DIR:?OFFSITE_DIR is required}"
OFFSITE_RECEIPT_DIR="$OFFSITE_DIR/.gshsapp-receipts"
OFFSITE_MOUNT_SOURCE="${OFFSITE_MOUNT_SOURCE:?OFFSITE_MOUNT_SOURCE is required}"
OFFSITE_FSTYPE="${OFFSITE_FSTYPE:?OFFSITE_FSTYPE is required}"
OFFSITE_REQUIRED_OPTIONS="${OFFSITE_REQUIRED_OPTIONS:-rw,nodev,nosuid,noexec}"
PRESERVED_WEB_ID="${PRESERVED_WEB_ID:-}"
PRESERVED_WEB_IMAGE_ID="${PRESERVED_WEB_IMAGE_ID:-}"
PRESERVED_WEB_CONFIG_IMAGE="${PRESERVED_WEB_CONFIG_IMAGE:-}"
readonly VALIDATOR_UID=61001
readonly VALIDATOR_GID=61001
readonly VALIDATOR_OUTPUT_LIMIT_BYTES=536870912
readonly VALIDATOR_HOST_RESERVE_BYTES=268435456

cleanup() {
  local status=$?
  if ! cleanup_validation_container; then
    status=1
  fi
  if [[ -n "$VALIDATION_ROOT" && "$VALIDATION_ROOT" == "$DEPLOY_ROOT"/.bootstrap-validate.* &&
        -d "$VALIDATION_ROOT" && ! -L "$VALIDATION_ROOT" ]]; then
    rm -rf -- "$VALIDATION_ROOT"
  fi
  if [[ "$status" -ne 0 && "$BOOTSTRAP_COMMITTED" != "true" &&
        "$BOOTSTRAP_NAME" =~ ^backup-[0-9]{8}-[0-9]{6}-[a-f0-9]{8}\.tar\.gz$ ]]; then
    rm -f -- "$BACKUP_DIR/$BOOTSTRAP_NAME" "$BACKUP_DIR/$BOOTSTRAP_NAME.json"
  fi
  return "$status"
}

cleanup_validation_container() {
  local by_label by_name actual_id actual_name actual_label actual_config
  local remaining_by_id remaining_by_label remaining_by_name cleanup_id="$VALIDATION_CONTAINER_ID"
  [[ -n "$VALIDATION_CONTAINER_NONCE" && -n "$VALIDATION_CONTAINER_NAME" ]] || {
    [[ -z "$cleanup_id" ]]
    return
  }
  by_label="$(run_validator_docker ps --all --no-trunc --quiet \
    --filter "label=io.gshsapp.backup-validator=$VALIDATION_CONTAINER_NONCE")" || return 1
  by_name="$(run_validator_docker ps --all --no-trunc --quiet --filter "name=^/${VALIDATION_CONTAINER_NAME}$")" || return 1
  if [[ -z "$by_label" && -z "$by_name" ]]; then
    VALIDATION_CONTAINER_ID=""
    VALIDATION_CONTAINER_NAME=""
    VALIDATION_CONTAINER_NONCE=""
    return 0
  fi
  [[ "$by_label" == "$by_name" && "$by_label" =~ ^[0-9a-f]{64}$ ]] || return 1
  if [[ -n "$cleanup_id" && "$cleanup_id" != "$by_label" ]]; then
    return 1
  fi
  cleanup_id="$by_label"
  actual_id="$(run_validator_docker inspect --format '{{.Id}}' "$cleanup_id")" || return 1
  actual_name="$(run_validator_docker inspect --format '{{.Name}}' "$cleanup_id")" || return 1
  actual_label="$(run_validator_docker inspect --format '{{ index .Config.Labels "io.gshsapp.backup-validator" }}' "$cleanup_id")" || return 1
  actual_config="$(run_validator_docker inspect --format '{{.Config.Image}}' "$cleanup_id")" || return 1
  [[ "$actual_id" == "$cleanup_id" && "$actual_name" == "/$VALIDATION_CONTAINER_NAME" &&
     "$actual_label" == "$VALIDATION_CONTAINER_NONCE" &&
     "$actual_config" == "${DOCKER_IMAGE}@${IMAGE_DIGEST}" ]] || return 1
  run_validator_docker rm --force "$cleanup_id" >/dev/null || return 1
  remaining_by_id="$(run_validator_docker ps --all --no-trunc --quiet --filter "id=$cleanup_id")" || return 1
  remaining_by_label="$(run_validator_docker ps --all --no-trunc --quiet \
    --filter "label=io.gshsapp.backup-validator=$VALIDATION_CONTAINER_NONCE")" || return 1
  remaining_by_name="$(run_validator_docker ps --all --no-trunc --quiet --filter "name=^/${VALIDATION_CONTAINER_NAME}$")" || return 1
  [[ -z "$remaining_by_id" && -z "$remaining_by_label" && -z "$remaining_by_name" ]] || return 1
  VALIDATION_CONTAINER_ID=""
  VALIDATION_CONTAINER_NAME=""
  VALIDATION_CONTAINER_NONCE=""
}

run_validator_docker() {
  "$TIMEOUT_BIN" --signal=TERM --kill-after=10s \
    "${VALIDATOR_DOCKER_TIMEOUT_SECONDS}s" docker "$@"
}

sweep_stale_validation_containers() {
  local output id actual_id actual_name actual_label network_mode read_only
  local -a ids=()
  output="$(run_validator_docker ps --all --no-trunc --quiet \
    --filter 'label=io.gshsapp.backup-validator')" || return 1
  [[ -z "$output" ]] || mapfile -t ids <<<"$output"
  for id in "${ids[@]}"; do
    [[ "$id" =~ ^[0-9a-f]{64}$ ]] || return 1
    actual_id="$(run_validator_docker inspect --format '{{.Id}}' "$id")" || return 1
    actual_name="$(run_validator_docker inspect --format '{{.Name}}' "$id")" || return 1
    actual_label="$(run_validator_docker inspect --format '{{ index .Config.Labels "io.gshsapp.backup-validator" }}' "$id")" || return 1
    network_mode="$(run_validator_docker inspect --format '{{.HostConfig.NetworkMode}}' "$id")" || return 1
    read_only="$(run_validator_docker inspect --format '{{.HostConfig.ReadonlyRootfs}}' "$id")" || return 1
    [[ "$actual_id" == "$id" && "$actual_label" =~ ^[a-f0-9]{16}$ &&
       "$actual_name" == "/gshsapp-backup-validator-$actual_label" &&
       "$network_mode" == "none" && "$read_only" == "true" ]] || return 1
    run_validator_docker rm --force "$id" >/dev/null || return 1
  done
  output="$(run_validator_docker ps --all --no-trunc --quiet \
    --filter 'label=io.gshsapp.backup-validator')" || return 1
  [[ -z "$output" ]]
}

run_candidate_backup_validation() {
  local create_output actual_id actual_name actual_label actual_config mounts_json tmpfs_json validation_status=0
  local running exit_code deadline output_proof database_output wrapper_script tree_script stream_script
  local available_kib required_kib
  VALIDATION_ROOT_VALUE="$VALIDATION_ROOT" "$PYTHON_BIN" - <<'PY' || return 1
import os
import stat

root = os.environ["VALIDATION_ROOT_VALUE"]
details = os.lstat(root)
if not stat.S_ISDIR(details.st_mode) or stat.S_ISLNK(details.st_mode) or os.listdir(root):
    raise SystemExit(1)
PY
  available_kib="$(df -Pk -- "$VALIDATION_ROOT" | awk 'NR==2 {print $4}')" || return 1
  [[ "$available_kib" =~ ^[0-9]+$ ]] || return 1
  required_kib=$(( (VALIDATOR_OUTPUT_LIMIT_BYTES + VALIDATOR_HOST_RESERVE_BYTES + 1023) / 1024 ))
  (( available_kib >= required_kib )) || return 1
  VALIDATION_CONTAINER_NONCE="$("$PYTHON_BIN" -c 'import secrets; print(secrets.token_hex(8))')" || return 1
  [[ "$VALIDATION_CONTAINER_NONCE" =~ ^[a-f0-9]{16}$ ]] || return 1
  VALIDATION_CONTAINER_NAME="gshsapp-backup-validator-$VALIDATION_CONTAINER_NONCE"
  read -r -d '' wrapper_script <<'JS' || :
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const child = spawn(process.execPath, [
  ".next/ops/validate-backup.mjs",
  "/input/bootstrap.tar.gz",
  "/output",
  "--migrate-reviewed-input",
], {
  stdio: "inherit",
  env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" },
});
child.once("error", () => process.exit(1));
child.once("exit", (code, signal) => {
  if (code !== 0 || signal !== null) process.exit(1);
  const descriptor = fs.openSync("/tmp/gshsapp-validator-complete", "wx", 0o400);
  fs.writeSync(descriptor, "ok\n");
  fs.fsyncSync(descriptor);
  fs.closeSync(descriptor);
  setInterval(() => {}, 1073741824);
});
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal);
    process.exit(signal === "SIGTERM" ? 143 : 130);
  });
}
JS
  if ! create_output="$(run_validator_docker create \
      --name "$VALIDATION_CONTAINER_NAME" \
      --label "io.gshsapp.backup-validator=$VALIDATION_CONTAINER_NONCE" \
      --log-driver none \
      --network none \
      --read-only \
      --cap-drop ALL \
      --security-opt no-new-privileges \
      --memory 1536m \
      --memory-swap 1536m \
      --pids-limit 128 \
      --cpus 2 \
      --user "$VALIDATOR_UID:$VALIDATOR_GID" \
      --env NODE_OPTIONS= \
      --env NODE_PATH= \
      --tmpfs "/tmp:rw,noexec,nosuid,nodev,size=64m,uid=$VALIDATOR_UID,gid=$VALIDATOR_GID,mode=1700" \
      --tmpfs "/output:rw,noexec,nosuid,nodev,size=768m,nr_inodes=12000,uid=$VALIDATOR_UID,gid=$VALIDATOR_GID,mode=0700" \
      --mount "type=bind,src=$archive_path,dst=/input/bootstrap.tar.gz,readonly" \
      "${DOCKER_IMAGE}@${IMAGE_DIGEST}" \
      node -e "$wrapper_script")"; then
    cleanup_validation_container || true
    return 1
  fi
  create_output="${create_output%$'\r'}"
  [[ "$create_output" =~ ^[0-9a-f]{64}$ ]] || {
    cleanup_validation_container || true
    return 1
  }
  VALIDATION_CONTAINER_ID="$create_output"
  actual_id="$(run_validator_docker inspect --format '{{.Id}}' "$VALIDATION_CONTAINER_ID")" || validation_status=1
  actual_name="$(run_validator_docker inspect --format '{{.Name}}' "$VALIDATION_CONTAINER_ID")" || validation_status=1
  actual_label="$(run_validator_docker inspect --format '{{ index .Config.Labels "io.gshsapp.backup-validator" }}' "$VALIDATION_CONTAINER_ID")" || validation_status=1
  actual_config="$(run_validator_docker inspect --format '{{.Config.Image}}' "$VALIDATION_CONTAINER_ID")" || validation_status=1
  mounts_json="$(run_validator_docker inspect --format '{{json .Mounts}}' "$VALIDATION_CONTAINER_ID")" || validation_status=1
  tmpfs_json="$(run_validator_docker inspect --format '{{json .HostConfig.Tmpfs}}' "$VALIDATION_CONTAINER_ID")" || validation_status=1
  if [[ "$validation_status" != 0 || "$actual_id" != "$VALIDATION_CONTAINER_ID" ||
        "$actual_name" != "/$VALIDATION_CONTAINER_NAME" || "$actual_label" != "$VALIDATION_CONTAINER_NONCE" ||
        "$actual_config" != "${DOCKER_IMAGE}@${IMAGE_DIGEST}" ]]; then
    validation_status=1
  elif ! MOUNTS_JSON="$mounts_json" TMPFS_JSON="$tmpfs_json" "$PYTHON_BIN" - <<'PY'
import json
import os

try:
    mounts = json.loads(os.environ["MOUNTS_JSON"])
    tmpfs = json.loads(os.environ["TMPFS_JSON"])
except Exception:
    raise SystemExit(1)
outputs = [item for item in mounts if isinstance(item, dict) and item.get("Destination") == "/output"]
if len(outputs) != 1 or outputs[0].get("Type") != "tmpfs" or outputs[0].get("RW") is not True:
    raise SystemExit(1)
if not isinstance(tmpfs, dict) or set(tmpfs) != {"/tmp", "/output"}:
    raise SystemExit(1)
expected = {"rw", "noexec", "nosuid", "nodev", "size=768m", "nr_inodes=12000", "uid=61001", "gid=61001", "mode=0700"}
if set(tmpfs["/output"].split(",")) != expected:
    raise SystemExit(1)
PY
  then
    validation_status=1
  elif ! run_validator_docker start "$VALIDATION_CONTAINER_ID" >/dev/null 2>&1; then
    validation_status=1
  else
    deadline=$((SECONDS + CANDIDATE_VALIDATION_TIMEOUT_SECONDS))
    while (( SECONDS < deadline )); do
      running="$(run_validator_docker inspect --format '{{.State.Running}}' "$VALIDATION_CONTAINER_ID")" || {
        validation_status=1
        break
      }
      if [[ "$running" != "true" ]]; then
        exit_code="$(run_validator_docker inspect --format '{{.State.ExitCode}}' "$VALIDATION_CONTAINER_ID" 2>/dev/null || true)"
        printf '%s\n' "Candidate validator exited before publishing success (exit=${exit_code:-unknown})." >&2
        validation_status=1
        break
      fi
      if run_validator_docker exec "$VALIDATION_CONTAINER_ID" \
          node -e 'require("node:fs").accessSync(process.argv[1], require("node:fs").constants.R_OK)' \
          /tmp/gshsapp-validator-complete >/dev/null 2>&1; then
        break
      fi
      sleep 1
    done
    if (( SECONDS >= deadline )); then
      validation_status=1
    fi
  fi
  if [[ "$validation_status" == 0 ]]; then
    read -r -d '' tree_script <<'JS' || :
const fs = require("node:fs");
const path = require("node:path");
const root = "/output";
const maximumBytes = Number(process.argv[1]);
const maximumEntries = 12000;
let entries = 0;
let bytes = 0;
let database = false;
const stack = [root];
while (stack.length > 0) {
  const current = stack.pop();
  const details = fs.lstatSync(current);
  if (details.isSymbolicLink()) process.exit(1);
  if (details.isDirectory()) {
    const names = fs.readdirSync(current).sort().reverse();
    for (const name of names) {
      if (!name || name === "." || name === ".." || name.includes("\0")) process.exit(1);
      entries += 1;
      if (entries > maximumEntries) process.exit(1);
      stack.push(path.join(current, name));
    }
  } else if (details.isFile() && details.nlink === 1) {
    bytes += details.size;
    if (!Number.isSafeInteger(bytes) || bytes > maximumBytes) process.exit(1);
    if (current === "/output/data/dev.db" && details.size > 0) database = true;
  } else {
    process.exit(1);
  }
}
if (!database) process.exit(1);
process.stdout.write("ok\n");
JS
    output_proof="$(
      run_validator_docker exec "$VALIDATION_CONTAINER_ID" \
        node -e "$tree_script" "$VALIDATOR_OUTPUT_LIMIT_BYTES" 2>/dev/null \
        | "$PYTHON_BIN" -c 'import sys; raw=sys.stdin.buffer.read(4); sys.exit(1) if raw != b"ok\n" else sys.stdout.write("ok\n")'
    )" || validation_status=1
    output_proof="${output_proof%$'\r'}"
    [[ "$output_proof" == "ok" ]] || validation_status=1
  fi
  if [[ "$validation_status" == 0 ]]; then
    mkdir -m 0700 "$VALIDATION_ROOT/data" || validation_status=1
  fi
  if [[ "$validation_status" == 0 ]]; then
    database_output="$VALIDATION_ROOT/data/dev.db"
    read -r -d '' stream_script <<'JS' || :
const fs = require("node:fs");
const file = process.argv[1];
const maximum = Number(process.argv[2]);
const details = fs.lstatSync(file);
if (!details.isFile() || details.isSymbolicLink() || details.nlink !== 1 || details.size < 1 || details.size > maximum) process.exit(1);
const source = fs.createReadStream(file);
source.on("error", () => process.exit(1));
process.stdout.on("error", () => process.exit(1));
source.pipe(process.stdout);
JS
    if ! "$TIMEOUT_BIN" --signal=TERM --kill-after=10s \
        "${CANDIDATE_OUTPUT_STREAM_TIMEOUT_SECONDS}s" \
        docker exec "$VALIDATION_CONTAINER_ID" node -e "$stream_script" \
          /output/data/dev.db "$VALIDATOR_OUTPUT_LIMIT_BYTES" 2>/dev/null \
      | OUTPUT_FILE="$database_output" MAXIMUM_BYTES="$VALIDATOR_OUTPUT_LIMIT_BYTES" "$PYTHON_BIN" -c '
import os, sys
path = os.environ["OUTPUT_FILE"]
maximum = int(os.environ["MAXIMUM_BYTES"])
flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
if hasattr(os, "O_NOFOLLOW"):
    flags |= os.O_NOFOLLOW
descriptor = os.open(path, flags, 0o600)
total = 0
try:
    with os.fdopen(descriptor, "wb", closefd=True) as output:
        while True:
            block = sys.stdin.buffer.read(1024 * 1024)
            if not block:
                break
            total += len(block)
            if total > maximum:
                raise ValueError("candidate database exceeded output limit")
            output.write(block)
        if total < 1:
            raise ValueError("candidate database was empty")
        output.flush()
        os.fsync(output.fileno())
except BaseException:
    try:
        os.unlink(path)
    except FileNotFoundError:
        pass
    raise
'; then
      validation_status=1
    fi
  fi
  if ! cleanup_validation_container; then
    validation_status=1
  fi
  [[ "$validation_status" == 0 ]]
}

assert_quiesced_writer() {
  local running_compose running_named all_compose all_named
  local actual_id actual_image actual_config actual_running actual_name actual_restart_policy

  if ! running_compose="$(docker ps --no-trunc --quiet \
      --filter "label=com.docker.compose.project=$PROJECT_NAME" \
      --filter "label=com.docker.compose.service=web")"; then
    echo "Unable to enumerate running Compose application writers." >&2
    return 1
  fi
  if ! running_named="$(docker ps --no-trunc --quiet --filter "name=^/${CONTAINER_NAME}$")"; then
    echo "Unable to enumerate the running named application writer." >&2
    return 1
  fi
  if [[ -n "$running_compose" || -n "$running_named" ]]; then
    echo "Pre-deployment backup requires zero running application writers." >&2
    return 1
  fi

  if ! all_compose="$(docker ps --all --no-trunc --quiet \
      --filter "label=com.docker.compose.project=$PROJECT_NAME" \
      --filter "label=com.docker.compose.service=web")"; then
    echo "Unable to enumerate preserved Compose containers." >&2
    return 1
  fi
  if ! all_named="$(docker ps --all --no-trunc --quiet --filter "name=^/${CONTAINER_NAME}$")"; then
    echo "Unable to enumerate the preserved named container." >&2
    return 1
  fi

  if [[ -z "$PRESERVED_WEB_ID" && -z "$PRESERVED_WEB_IMAGE_ID" && -z "$PRESERVED_WEB_CONFIG_IMAGE" ]]; then
    if [[ -n "$all_compose" || -n "$all_named" ]]; then
      echo "An unbound preserved application container is present." >&2
      return 1
    fi
    return 0
  fi
  [[ "$PRESERVED_WEB_ID" =~ ^[0-9a-f]{64}$ ]] || return 1
  [[ "$PRESERVED_WEB_IMAGE_ID" =~ ^sha256:[0-9a-f]{64}$ ]] || return 1
  [[ "$PRESERVED_WEB_CONFIG_IMAGE" =~ ^[A-Za-z0-9][A-Za-z0-9._/@:+-]{0,254}$ ]] || return 1
  [[ "$all_compose" == "$PRESERVED_WEB_ID" && "$all_named" == "$PRESERVED_WEB_ID" ]] || {
    echo "The preserved application container does not match the captured exact identity." >&2
    return 1
  }

  actual_id="$(docker inspect --format '{{.Id}}' "$PRESERVED_WEB_ID")" || return 1
  actual_image="$(docker inspect --format '{{.Image}}' "$PRESERVED_WEB_ID")" || return 1
  actual_config="$(docker inspect --format '{{.Config.Image}}' "$PRESERVED_WEB_ID")" || return 1
  actual_running="$(docker inspect --format '{{.State.Running}}' "$PRESERVED_WEB_ID")" || return 1
  actual_name="$(docker inspect --format '{{.Name}}' "$PRESERVED_WEB_ID")" || return 1
  actual_restart_policy="$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$PRESERVED_WEB_ID")" || return 1
  if [[ "$actual_id" != "$PRESERVED_WEB_ID" || "$actual_image" != "$PRESERVED_WEB_IMAGE_ID" ||
        "$actual_config" != "$PRESERVED_WEB_CONFIG_IMAGE" || "$actual_running" != "false" ||
        "$actual_name" != "/$CONTAINER_NAME" || "$actual_restart_policy" != "no" ]]; then
    echo "The preserved application container changed before backup." >&2
    return 1
  fi
}

predeployment_backup_main() {
trap cleanup EXIT
[[ "${LIFECYCLE_LOCK_HELD:-0}" == "1" ]] || {
  echo "Pre-deployment backup requires the shared root lifecycle lock." >&2
  exit 1
}
[[ "${GSHSAPP_OFFSITE_PINNED:-}" == systemd ]] || {
  echo "Pre-deployment backup requires the authenticated systemd mount namespace." >&2
  exit 1
}
if [[ "$IMAGE_DIGEST" != sha256:* || ! "$IMAGE_DIGEST" =~ ^sha256:[a-f0-9]{64}$ ]]; then
  echo "IMAGE_DIGEST must be an exact sha256 digest." >&2
  exit 1
fi
if ! [[ "$CANDIDATE_VALIDATION_TIMEOUT_SECONDS" =~ ^[0-9]+$ ]] ||
   (( CANDIDATE_VALIDATION_TIMEOUT_SECONDS < 30 || CANDIDATE_VALIDATION_TIMEOUT_SECONDS > 1800 )); then
  echo "Candidate validation timeout is outside the reviewed range." >&2
  exit 1
fi
if ! [[ "$CANDIDATE_OUTPUT_STREAM_TIMEOUT_SECONDS" =~ ^[0-9]+$ ]] ||
   (( CANDIDATE_OUTPUT_STREAM_TIMEOUT_SECONDS < 30 || CANDIDATE_OUTPUT_STREAM_TIMEOUT_SECONDS > 300 )); then
  echo "Candidate output stream timeout is outside the reviewed range." >&2
  exit 1
fi
if ! [[ "$VALIDATOR_DOCKER_TIMEOUT_SECONDS" =~ ^[0-9]+$ ]] ||
   (( VALIDATOR_DOCKER_TIMEOUT_SECONDS < 10 || VALIDATOR_DOCKER_TIMEOUT_SECONDS > 120 )); then
  echo "Validator Docker control timeout is outside the reviewed range." >&2
  exit 1
fi
command -v "$TIMEOUT_BIN" >/dev/null 2>&1 || { echo "A bounded timeout command is required." >&2; exit 1; }
command -v df >/dev/null 2>&1 || { echo "Filesystem capacity inspection is required." >&2; exit 1; }
if [[ -L "$DATA_DIR" || ! -d "$DATA_DIR" || -L "$BACKUP_DIR" || ! -d "$BACKUP_DIR" ]]; then
  echo "Data and backup roots must be real directories." >&2
  exit 1
fi
[[ "$(stat -c '%u:%g:%a' "$BACKUP_DIR")" == "0:0:700" ]] || {
  echo "Root recovery backup directory is not root-private." >&2
  exit 1
}
verify_offsite_mount() {
  "$PYTHON_BIN" "$CONTROL_ROOT/validate-operations-config.py" deploy \
    /etc/gshsapp-operations/deploy.env \
    --host-role-file /etc/gshsapp-operations/host-role --verify-pinned-offsite
}
verify_offsite_mount || { echo "The configured offsite mount boundary is invalid." >&2; exit 1; }
if [[ -L "$DB_FILE" ]]; then
  echo "Refusing to back up a symbolic-link database." >&2
  exit 1
fi
if [[ ! -f "$DB_FILE" ]]; then
  echo "Established deployment database is missing or not a regular file; refusing an empty migration." >&2
  exit 1
fi

echo "Creating a SQLite-consistent pre-deployment backup..."
assert_quiesced_writer
sweep_stale_validation_containers || {
  echo "Stale managed backup validators could not be safely removed." >&2
  exit 1
}

echo "Using the reviewed offline host snapshot path for the quiesced database."
"$PYTHON_BIN" "$CONTROL_ROOT/bootstrap-backup.py" reconcile \
  --backup-dir "$BACKUP_DIR" \
  --offsite-dir "$OFFSITE_DIR" \
  --receipt-dir "$OFFSITE_RECEIPT_DIR" >/dev/null
BOOTSTRAP_NAME="$(
  "$PYTHON_BIN" "$CONTROL_ROOT/bootstrap-backup.py" create \
    --database "$DB_FILE" \
    --data-root "$DATA_DIR" \
    --backup-dir "$BACKUP_DIR"
)"
if [[ ! "$BOOTSTRAP_NAME" =~ ^backup-[0-9]{8}-[0-9]{6}-[a-f0-9]{8}\.tar\.gz$ ]]; then
  echo "Bootstrap backup returned an invalid artifact name." >&2
  exit 1
fi
"$PYTHON_BIN" "$CONTROL_ROOT/bootstrap-backup.py" verify \
  --backup-dir "$BACKUP_DIR" \
  --name "$BOOTSTRAP_NAME"

archive_path="$BACKUP_DIR/$BOOTSTRAP_NAME"
metadata_path="$archive_path.json"
for published_file in "$archive_path" "$metadata_path"; do
  [[ -f "$published_file" && ! -L "$published_file" && "$(stat -c '%h' "$published_file")" == "1" ]] || {
    echo "Published bootstrap backup file is unsafe." >&2
    exit 1
  }
  chown --no-dereference root:root "$published_file"
  chmod 0600 "$published_file"
  [[ "$(stat -c '%u:%g:%a:%h' "$published_file")" == "0:0:600:1" ]] || {
    echo "Published backup ownership did not remain in the root recovery boundary." >&2
    exit 1
  }
done

if [[ -L "$archive_path" || ! -f "$archive_path" ]]; then
  echo "Bootstrap backup artifact changed before isolated validation." >&2
  exit 1
fi
archive_path="$(cd "$(dirname "$archive_path")" && pwd -P)/$(basename "$archive_path")"
VALIDATION_ROOT="$(mktemp -d "$DEPLOY_ROOT/.bootstrap-validate.XXXXXX")"
chmod 700 "$VALIDATION_ROOT"

# The candidate receives only the immutable backup artifact read-only. It has
# no runtime secrets, network, live DB, data-root, or backup-directory mount.
# It is pre-created with strict resource bounds so a killed CLI cannot leave an
# anonymous validator behind; cleanup always targets and verifies its full ID.
if ! run_candidate_backup_validation; then
  echo "Isolated bootstrap backup validation failed." >&2
  exit 1
fi

if [[ -L "$VALIDATION_ROOT/data/dev.db" || ! -f "$VALIDATION_ROOT/data/dev.db" ]]; then
  echo "Isolated bootstrap validation did not produce a reviewed migrated database." >&2
  exit 1
fi
if ! "$PYTHON_BIN" "$CONTROL_ROOT/validate-live-database.py" "$VALIDATION_ROOT/data/dev.db" >/dev/null; then
  echo "Candidate migration output failed root-reviewed database invariants." >&2
  exit 1
fi
"$PYTHON_BIN" "$CONTROL_ROOT/bootstrap-backup.py" verify \
  --backup-dir "$BACKUP_DIR" \
  --name "$BOOTSTRAP_NAME"
verify_offsite_mount || { echo "The offsite mount changed before export." >&2; exit 1; }
"$PYTHON_BIN" "$CONTROL_ROOT/bootstrap-backup.py" export-offsite \
  --backup-dir "$BACKUP_DIR" \
  --name "$BOOTSTRAP_NAME" \
  --offsite-dir "$OFFSITE_DIR" \
  --receipt-dir "$OFFSITE_RECEIPT_DIR" >/dev/null
"$PYTHON_BIN" "$CONTROL_ROOT/bootstrap-backup.py" verify-receipt \
  --offsite-dir "$OFFSITE_DIR" \
  --receipt-dir "$OFFSITE_RECEIPT_DIR" \
  --name "$BOOTSTRAP_NAME"
verify_offsite_mount || { echo "The offsite mount changed after export." >&2; exit 1; }
BOOTSTRAP_COMMITTED=true
echo "Complete backup generation and independent offsite receipt were verified without exposing live data to candidate code."
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  predeployment_backup_main "$@"
fi
