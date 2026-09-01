#!/usr/bin/env bash
set -Eeuo pipefail

PATH=/usr/sbin:/usr/bin:/sbin:/bin
LC_ALL=C
export PATH LC_ALL
IFS=$' \t\n'
umask 077

DEPLOY_ROOT="${DEPLOY_ROOT:-/opt/gshsapp}"
CONTROL_ROOT="${CONTROL_ROOT:-/usr/local/lib/gshsapp-operations}"
BACKUP_DIR="${BACKUP_DIR:-$DEPLOY_ROOT/root-backup}"
OFFSITE_DIR="${OFFSITE_DIR:?OFFSITE_DIR is required}"
OFFSITE_RECEIPT_DIR="$OFFSITE_DIR/.gshsapp-receipts"
OFFSITE_MOUNT_SOURCE="${OFFSITE_MOUNT_SOURCE:?OFFSITE_MOUNT_SOURCE is required}"
BACKUP_NAME="${BACKUP_NAME:?BACKUP_NAME is required}"
PYTHON_BIN="${PYTHON_BIN:-/usr/bin/python3}"

[[ "$(id -u)" == "0" ]] || { printf '%s\n' "Offsite export must run as root." >&2; exit 1; }
current_script="$(readlink -f -- "${BASH_SOURCE[0]}")" || { printf '%s\n' "Offsite export control path cannot be resolved." >&2; exit 1; }
[[ "$current_script" == "$CONTROL_ROOT/offsite-backup.sh" ]] || { printf '%s\n' "Run only the installed authenticated offsite export control." >&2; exit 1; }
[[ -f "$current_script" && ! -L "$current_script" && "$(stat -c '%u:%g:%a:%h' "$current_script")" == "0:0:400:1" ]] || {
  printf '%s\n' "Installed offsite export control is unsafe." >&2
  exit 1
}
/bin/bash "$CONTROL_ROOT/install-root-operations.sh" --verify-installed || {
  printf '%s\n' "Installed root controls failed verification." >&2
  exit 1
}
[[ "${GSHSAPP_OFFSITE_PINNED:-}" == manual ]] || {
  printf '%s\n' "Run offsite export through the authenticated pin-offsite-operation.sh helper." >&2
  exit 1
}
[[ "$BACKUP_NAME" =~ ^backup-[0-9]{8}-[0-9]{6}-[a-f0-9]{8}\.tar\.gz$ ]] || {
  printf '%s\n' "Backup name is invalid." >&2
  exit 1
}
[[ -d "$BACKUP_DIR" && ! -L "$BACKUP_DIR" && "$(stat -c '%u:%g:%a' "$BACKUP_DIR")" == "0:0:700" ]] || {
  printf '%s\n' "Root recovery backup directory is unsafe." >&2
  exit 1
}
[[ -f "$CONTROL_ROOT/bootstrap-backup.py" && ! -L "$CONTROL_ROOT/bootstrap-backup.py" && "$(stat -c '%u:%g:%a' "$CONTROL_ROOT/bootstrap-backup.py")" == "0:0:400" ]] || {
  printf '%s\n' "Installed root backup control is unsafe." >&2
  exit 1
}
verify_offsite_mount() {
  "$PYTHON_BIN" "$CONTROL_ROOT/validate-operations-config.py" backup \
    /etc/gshsapp-operations/backup.env --verify-pinned-offsite
}
verify_offsite_mount || { printf '%s\n' "Offsite mount policy is invalid." >&2; exit 1; }
"$PYTHON_BIN" "$CONTROL_ROOT/bootstrap-backup.py" export-offsite \
  --backup-dir "$BACKUP_DIR" --name "$BACKUP_NAME" \
  --offsite-dir "$OFFSITE_DIR" --receipt-dir "$OFFSITE_RECEIPT_DIR" >/dev/null
"$PYTHON_BIN" "$CONTROL_ROOT/bootstrap-backup.py" verify-receipt \
  --offsite-dir "$OFFSITE_DIR" --receipt-dir "$OFFSITE_RECEIPT_DIR" --name "$BACKUP_NAME"
verify_offsite_mount || { printf '%s\n' "Offsite mount changed during export." >&2; exit 1; }
printf '%s\n' "Offsite generation and receipt verified."
