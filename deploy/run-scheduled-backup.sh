#!/usr/bin/env bash
set -Eeuo pipefail

PATH=/usr/sbin:/usr/bin:/sbin:/bin
LC_ALL=C
export PATH LC_ALL
IFS=$' \t\n'
umask 077

DEPLOY_ROOT="${DEPLOY_ROOT:-/opt/gshsapp}"
CONTROL_ROOT="${CONTROL_ROOT:-/usr/local/lib/gshsapp-operations}"
DATA_DIR="${DATA_DIR:-$DEPLOY_ROOT/data}"
BACKUP_DIR="${BACKUP_DIR:-$DEPLOY_ROOT/root-backup}"
DB_FILE="${DB_FILE:-$DATA_DIR/dev.db}"
OFFSITE_DIR="${OFFSITE_DIR:?OFFSITE_DIR is required in the root-owned service environment}"
OFFSITE_RECEIPT_DIR="$OFFSITE_DIR/.gshsapp-receipts"
OFFSITE_MOUNT_SOURCE="${OFFSITE_MOUNT_SOURCE:?OFFSITE_MOUNT_SOURCE is required}"
OFFSITE_FSTYPE="${OFFSITE_FSTYPE:?OFFSITE_FSTYPE is required}"
OFFSITE_REQUIRED_OPTIONS="${OFFSITE_REQUIRED_OPTIONS:-rw,nodev,nosuid,noexec}"
MINIMUM_GENERATIONS="${MINIMUM_GENERATIONS:-3}"
MAXIMUM_GENERATIONS="${MAXIMUM_GENERATIONS:-14}"
MAXIMUM_AGE_DAYS="${MAXIMUM_AGE_DAYS:-30}"
MAXIMUM_TOTAL_BYTES="${MAXIMUM_TOTAL_BYTES:-21474836480}"
BACKUP_FRESHNESS_HOURS="${BACKUP_FRESHNESS_HOURS:-23}"
CONTAINER_NAME="${CONTAINER_NAME:-gshsapp-web}"
PROJECT_NAME="${PROJECT_NAME:-gshsapp}"
PYTHON_BIN="${PYTHON_BIN:-/usr/bin/python3}"
LOCK_FILE="${LOCK_FILE:-/run/lock/gshsapp/lifecycle.lock}"
recovery_required=false
PHASE_FILE="${PHASE_FILE:-$DEPLOY_ROOT/backup-phase.json}"

write_phase() {
  local phase="$1" container_id="${2:-}" image_id="${3:-}" config_image="${4:-}" restart_policy="${5:-}" container_name="${6:-}" was_running="${7:-false}" temporary
  temporary="$(mktemp "$DEPLOY_ROOT/.backup-phase.XXXXXX")"
  PHASE="$phase" CONTAINER_ID="$container_id" IMAGE_ID="$image_id" CONFIG_IMAGE="$config_image" RESTART_POLICY="$restart_policy" CONTAINER_NAME_VALUE="$container_name" WAS_RUNNING="$was_running" "$PYTHON_BIN" - "$temporary" <<'PY'
import datetime, json, os, sys
was_running=os.environ.get("WAS_RUNNING","false")
if was_running not in {"true","false"}: raise SystemExit(1)
with open(sys.argv[1], "w", encoding="utf-8", newline="\n") as output:
    json.dump({"format":"gshsapp-backup-phase","version":3,"phase":os.environ["PHASE"],"containerId":os.environ.get("CONTAINER_ID",""),"imageId":os.environ.get("IMAGE_ID",""),"configImage":os.environ.get("CONFIG_IMAGE",""),"restartPolicy":os.environ.get("RESTART_POLICY",""),"containerName":os.environ.get("CONTAINER_NAME_VALUE",""),"wasRunning":was_running=="true","updatedAt":datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00","Z")}, output, separators=(",",":"))
    output.write("\n"); output.flush(); os.fsync(output.fileno())
PY
  chmod 0600 "$temporary"
  mv -fT "$temporary" "$PHASE_FILE"
  sync -d "$PHASE_FILE"
  sync -d "$DEPLOY_ROOT"
}

finish() {
  local status=$?
  if [[ "$recovery_required" == "true" ]]; then
    LIFECYCLE_LOCK_HELD=1 DEPLOY_ROOT="$DEPLOY_ROOT" PHASE_FILE="$PHASE_FILE" LOCK_FILE="$LOCK_FILE" \
      /bin/bash "$CONTROL_ROOT/recover-backup-writer.sh" || {
        printf '%s\n' "Scheduled backup could not prove that the exact application writer recovered healthy." >&2
        status=1
      }
  fi
  exit "$status"
}
trap finish EXIT INT TERM

for command in docker findmnt flock stat "$PYTHON_BIN"; do
  command -v "$command" >/dev/null 2>&1 || { printf '%s\n' "Missing backup command: $command" >&2; exit 1; }
done
[[ "$(id -u)" == "0" ]] || { printf '%s\n' "Scheduled backup must run as root." >&2; exit 1; }
[[ "${GSHSAPP_OFFSITE_PINNED:-}" == systemd ]] || {
  printf '%s\n' "Scheduled backup requires the authenticated systemd mount namespace." >&2
  exit 1
}
[[ -f "$DB_FILE" && ! -L "$DB_FILE" ]] || { printf '%s\n' "Scheduled backup database is missing or unsafe." >&2; exit 1; }
[[ -d "$BACKUP_DIR" && ! -L "$BACKUP_DIR" && "$(stat -c '%u:%g:%a' "$BACKUP_DIR")" == "0:0:700" ]] || { printf '%s\n' "Root recovery backup directory is unsafe." >&2; exit 1; }
[[ -d "$OFFSITE_DIR" && ! -L "$OFFSITE_DIR" ]] || { printf '%s\n' "Offsite directory is unsafe." >&2; exit 1; }

verify_offsite_mount() {
  "$PYTHON_BIN" "$CONTROL_ROOT/validate-operations-config.py" backup \
    /etc/gshsapp-operations/backup.env --verify-pinned-offsite
}
verify_offsite_mount || { printf '%s\n' "Offsite mount policy is invalid." >&2; exit 1; }

exec 9>"$LOCK_FILE"
flock -n 9 || { printf '%s\n' "Deployment, restore, or backup is already active." >&2; exit 1; }
LIFECYCLE_LOCK_HELD=1 PHASE_FILE="$PHASE_FILE" DEPLOY_ROOT="$DEPLOY_ROOT" \
  /bin/bash "$CONTROL_ROOT/recover-backup-writer.sh"
LIFECYCLE_LOCK_HELD=1 DEPLOY_ROOT="$DEPLOY_ROOT" \
  /bin/bash "$CONTROL_ROOT/recover-deployment-writer.sh"
verify_offsite_mount || { printf '%s\n' "Offsite mount policy changed before backup." >&2; exit 1; }

[[ -f "$CONTROL_ROOT/bootstrap-backup.py" && ! -L "$CONTROL_ROOT/bootstrap-backup.py" && "$(stat -c '%u:%g:%a' "$CONTROL_ROOT/bootstrap-backup.py")" == "0:0:400" ]] || {
  printf '%s\n' "Installed root backup control is unsafe." >&2
  exit 1
}
# Do all mount reconciliation and the verified freshness gate while the
# application writer is still running. The hourly retry timer can therefore
# recover promptly from an absent offsite mount without stopping a healthy
# site on each retry tick.
"$PYTHON_BIN" "$CONTROL_ROOT/bootstrap-backup.py" reconcile \
  --backup-dir "$BACKUP_DIR" \
  --offsite-dir "$OFFSITE_DIR" \
  --receipt-dir "$OFFSITE_RECEIPT_DIR" >/dev/null
verify_offsite_mount || { printf '%s\n' "Offsite mount policy changed before retention." >&2; exit 1; }
"$PYTHON_BIN" "$CONTROL_ROOT/bootstrap-backup.py" prune \
  --backup-dir "$BACKUP_DIR" --offsite-dir "$OFFSITE_DIR" --receipt-dir "$OFFSITE_RECEIPT_DIR" \
  --minimum-generations "$MINIMUM_GENERATIONS" --maximum-generations "$MAXIMUM_GENERATIONS" \
  --maximum-age-days "$MAXIMUM_AGE_DAYS" --maximum-total-bytes "$MAXIMUM_TOTAL_BYTES" >/dev/null
freshness_status=0
if "$PYTHON_BIN" "$CONTROL_ROOT/bootstrap-backup.py" fresh-offsite \
  --offsite-dir "$OFFSITE_DIR" --receipt-dir "$OFFSITE_RECEIPT_DIR" \
  --freshness-hours "$BACKUP_FRESHNESS_HOURS"; then
  printf '%s\n' "Committed local generations were reconciled and the newest offsite pair is verified and fresh."
  exit 0
else
  freshness_status=$?
fi
[[ "$freshness_status" == 10 ]] || {
  printf '%s\n' "Offsite freshness verification failed integrity or I/O checks." >&2
  exit "$freshness_status"
}

if ! writer_ids="$(docker ps --all --no-trunc --quiet --filter "name=^/${CONTAINER_NAME}$")"; then
  printf '%s\n' "Unable to enumerate the application writer." >&2
  exit 1
fi
if [[ -n "$writer_ids" ]]; then
  [[ "$(wc -w <<<"$writer_ids")" == "1" ]] || { printf '%s\n' "Multiple application writers were found." >&2; exit 1; }
  writer_id="$(docker inspect --format '{{.Id}}' "$writer_ids")" || exit 1
  writer_image="$(docker inspect --format '{{.Image}}' "$writer_id")" || exit 1
  writer_config_image="$(docker inspect --format '{{.Config.Image}}' "$writer_id")" || exit 1
  writer_name="$(docker inspect --format '{{.Name}}' "$writer_id")" || exit 1
  writer_restart_policy="$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$writer_id")" || exit 1
  writer_running="$(docker inspect --format '{{.State.Running}}' "$writer_id")" || exit 1
  writer_project="$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$writer_id")" || exit 1
  writer_service="$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.service" }}' "$writer_id")" || exit 1
  [[ "$writer_id" =~ ^[0-9a-f]{64}$ && "$writer_image" =~ ^sha256:[0-9a-f]{64}$ &&
     "$writer_name" == "/$CONTAINER_NAME" && "$writer_restart_policy" =~ ^(always|unless-stopped|no|on-failure)$ &&
     "$writer_running" =~ ^(true|false)$ && "$writer_project" == "$PROJECT_NAME" && "$writer_service" == "web" &&
     "$writer_config_image" =~ ^[A-Za-z0-9][A-Za-z0-9._/@:+-]{0,254}$ ]] || exit 1
  recovery_required=true
  write_phase "restart-required" "$writer_id" "$writer_image" "$writer_config_image" "$writer_restart_policy" "$CONTAINER_NAME" "$writer_running"
  docker update --restart=no "$writer_id" >/dev/null
  [[ "$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$writer_id")" == "no" ]] || exit 1
  if [[ "$writer_running" == "true" ]]; then
    docker stop --time 30 "$writer_id" >/dev/null
  fi
fi
if ! remaining="$(docker ps --quiet --filter "name=^/${CONTAINER_NAME}$")" || [[ -n "$remaining" ]]; then
  printf '%s\n' "Application writer did not quiesce." >&2
  exit 1
fi

name="$("$PYTHON_BIN" "$CONTROL_ROOT/bootstrap-backup.py" create \
  --database "$DB_FILE" --data-root "$DATA_DIR" --backup-dir "$BACKUP_DIR" --reason scheduled)"
[[ "$name" =~ ^backup-[0-9]{8}-[0-9]{6}-[a-f0-9]{8}\.tar\.gz$ ]] || {
  printf '%s\n' "Root backup helper returned an invalid generation name." >&2
  exit 1
}
for local_pair_file in "$BACKUP_DIR/$name" "$BACKUP_DIR/$name.json"; do
  [[ -f "$local_pair_file" && ! -L "$local_pair_file" && "$(stat -c '%h' "$local_pair_file")" == "1" ]] || {
    printf '%s\n' "Scheduled backup pair is unsafe." >&2
    exit 1
  }
  chown --no-dereference root:root "$local_pair_file"
  chmod 0600 "$local_pair_file"
  [[ "$(stat -c '%u:%g:%a:%h' "$local_pair_file")" == "0:0:600:1" ]] || exit 1
done
# The local pair is durable and independently verifiable. Restore the exact
# writer before any potentially slow remote mount I/O; a later timer tick can
# idempotently reconcile an interrupted export.
"$PYTHON_BIN" "$CONTROL_ROOT/bootstrap-backup.py" verify \
  --backup-dir "$BACKUP_DIR" --name "$name"
if [[ "$recovery_required" == true ]]; then
  LIFECYCLE_LOCK_HELD=1 DEPLOY_ROOT="$DEPLOY_ROOT" PHASE_FILE="$PHASE_FILE" LOCK_FILE="$LOCK_FILE" \
    /bin/bash "$CONTROL_ROOT/recover-backup-writer.sh"
  recovery_required=false
fi
verify_offsite_mount || { printf '%s\n' "Offsite mount policy changed before export." >&2; exit 1; }
"$PYTHON_BIN" "$CONTROL_ROOT/bootstrap-backup.py" export-offsite \
  --backup-dir "$BACKUP_DIR" --name "$name" \
  --offsite-dir "$OFFSITE_DIR" --receipt-dir "$OFFSITE_RECEIPT_DIR" >/dev/null
"$PYTHON_BIN" "$CONTROL_ROOT/bootstrap-backup.py" verify-receipt \
  --offsite-dir "$OFFSITE_DIR" --receipt-dir "$OFFSITE_RECEIPT_DIR" --name "$name"
verify_offsite_mount || { printf '%s\n' "Offsite mount policy changed before retention." >&2; exit 1; }
"$PYTHON_BIN" "$CONTROL_ROOT/bootstrap-backup.py" prune \
  --backup-dir "$BACKUP_DIR" --offsite-dir "$OFFSITE_DIR" --receipt-dir "$OFFSITE_RECEIPT_DIR" \
  --minimum-generations "$MINIMUM_GENERATIONS" --maximum-generations "$MAXIMUM_GENERATIONS" \
  --maximum-age-days "$MAXIMUM_AGE_DAYS" --maximum-total-bytes "$MAXIMUM_TOTAL_BYTES" >/dev/null

printf '%s\n' "Scheduled complete backup and offsite receipt verified."
