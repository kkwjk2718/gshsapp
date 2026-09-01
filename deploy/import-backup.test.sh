#!/usr/bin/env bash
set -Eeuo pipefail

TEST_ROOT="$(mktemp -d)"
trap 'rm -rf -- "$TEST_ROOT"' EXIT
SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -n "${PYTHON_BIN:-}" ]]; then
  PYTHON_BIN="$(command -v "$PYTHON_BIN" 2>/dev/null || printf '%s' "$PYTHON_BIN")"
else
  PYTHON_BIN="$(command -v python3 2>/dev/null || command -v python 2>/dev/null || true)"
fi
[[ -n "$PYTHON_BIN" ]] || { printf '%s\n' "Python is required for import lifecycle tests." >&2; exit 1; }

export CONTROL_ROOT="$TEST_ROOT/control"
export DEPLOY_ROOT="$TEST_ROOT/deploy"
export OFFSITE_DIR="$TEST_ROOT/offsite"
export OFFSITE_RECEIPT_DIR="$OFFSITE_DIR/.gshsapp-receipts"
export OFFSITE_MOUNT_SOURCE=test-source
export OFFSITE_FSTYPE=ext4
export BACKUP_NAME=backup-20260813-120000-abcdef12.tar.gz
export IMAGE_TAG=sha-0123456789abcdef0123456789abcdef01234567
export IMAGE_DIGEST="sha256:$(printf 'a%.0s' {1..64})"
mkdir -p "$CONTROL_ROOT" "$DEPLOY_ROOT/data" "$OFFSITE_DIR" "$OFFSITE_RECEIPT_DIR"

# shellcheck source=import-backup.sh
source "$SCRIPT_ROOT/import-backup.sh"
trap - EXIT

python3() { "$PYTHON_BIN" "$@"; }
chown() { :; }
sync() { :; }
stat() {
  if [[ "$*" == *"%u:%g:%a:%h"* ]]; then
    printf '%s\n' '0:0:600:1'
  elif [[ "$*" == *"%u:%g:%a"* ]]; then
    printf '%s\n' '0:0:700'
  else
    command stat "$@"
  fi
}

cat >"$CONTROL_ROOT/bootstrap-backup.py" <<'PY'
raise SystemExit(0)
PY
cat >"$CONTROL_ROOT/validate-live-database.py" <<'PY'
raise SystemExit(0)
PY

CONTROL_MANIFEST_DIGEST="$(printf 'b%.0s' {1..64})"
WORK="$DEPLOY_ROOT/.offline-import.ABC123"
mkdir -p "$WORK/live-data"
printf '%s\n' 'durably staged database' >"$WORK/live-data/dev.db"
printf '%s\n' '{"receipt":"fixed"}' >"$OFFSITE_RECEIPT_DIR/$BACKUP_NAME.receipt.json"
receipt_sha256="$(sha256sum "$OFFSITE_RECEIPT_DIR/$BACKUP_NAME.receipt.json" | awk '{print $1}')"
tree_sha256="$(tree_digest "$WORK/live-data")"
write_import_phase "$(basename "$WORK")" "$tree_sha256" "$receipt_sha256" "$CONTROL_MANIFEST_DIGEST"

# Recovery must use the identities durably bound in the phase, even when the
# caller has no fresh approval inputs after a reboot or approval expiry.
BACKUP_NAME=""
IMAGE_TAG=""
IMAGE_DIGEST=""
recover_pending_import

[[ -f "$DEPLOY_ROOT/data/dev.db" ]] || { printf '%s\n' "Recovered database was not promoted." >&2; exit 1; }
[[ ! -e "$IMPORT_PHASE_FILE" ]] || { printf '%s\n' "Recovered phase was not consumed." >&2; exit 1; }
[[ -f "$DEPLOY_ROOT/bootstrap-complete.json" ]] || { printf '%s\n' "Bootstrap marker was not durably published." >&2; exit 1; }

IMPORT_SOURCE="$(<"$SCRIPT_ROOT/import-backup.sh")"
[[ "$IMPORT_SOURCE" == *'--memory 1536m --memory-swap 1536m --pids-limit 128 --cpus 2'* ]]
[[ "$IMPORT_SOURCE" == *'--tmpfs /output:rw,noexec,nosuid,nodev,size=768m,nr_inodes=12000,uid=61001,gid=61001,mode=0700'* ]]
[[ "$IMPORT_SOURCE" == *'run_validator_docker create --name "$VALIDATOR_CONTAINER_NAME"'* ]]
[[ "$IMPORT_SOURCE" == *'docker exec "$VALIDATOR_CONTAINER_ID" node -e "$stream_script"'* ]]
[[ "$IMPORT_SOURCE" == *'VALIDATOR_OUTPUT_FILE="$output_file"'* ]]
[[ "$IMPORT_SOURCE" != *'--mount "type=bind,src=$WORK/output,dst=/output"'* ]]
[[ "$IMPORT_SOURCE" != *'docker run --rm --name "$validator_name"'* ]]
[[ "$IMPORT_SOURCE" == *'cleanup_import_validator || status=1'* ]]
[[ "$IMPORT_SOURCE" == *'EXPECTED_OFFSITE_RECEIPT_SHA256'* ]]
[[ "$IMPORT_SOURCE" == *'offsite receipt does not match the authenticated operations record'* ]]
[[ "$IMPORT_SOURCE" == *'write_import_phase "$staging_name" "$live_tree_sha256" "$receipt_sha256" "$CONTROL_MANIFEST_DIGEST"'* ]]
[[ "$IMPORT_SOURCE" == *'validate-operations-config.py" deploy'* ]]
[[ "$IMPORT_SOURCE" == *'--verify-pinned-offsite'* ]]
[[ "$IMPORT_SOURCE" == *'pin-offsite-operation.sh helper'* ]]
[[ "$IMPORT_SOURCE" != *'source_identity="$(findmnt'* ]]

phase_line="$(grep -nF 'if [[ -e "$IMPORT_PHASE_FILE" || -L "$IMPORT_PHASE_FILE" ]]; then' "$SCRIPT_ROOT/import-backup.sh" | tail -1 | cut -d: -f1)"
approval_line="$(grep -nF 'approval="$DEPLOY_ROOT/approved-release.json"' "$SCRIPT_ROOT/import-backup.sh" | cut -d: -f1)"
[[ -n "$phase_line" && -n "$approval_line" && "$phase_line" -lt "$approval_line" ]] || {
  printf '%s\n' "Pending import recovery must precede fresh approval validation." >&2
  exit 1
}

printf '%s\n' "Offline import lifecycle tests passed."
