#!/usr/bin/env bash
set -Eeuo pipefail

PATH=/usr/sbin:/usr/bin:/sbin:/bin
LC_ALL=C
export PATH LC_ALL
IFS=$' \t\n'
umask 077

readonly CONTROL_ROOT=/usr/local/lib/gshsapp-operations
readonly FIXED_DEPLOY_ROOT=/opt/gshsapp
readonly LOCK_ROOT=/run/lock/gshsapp
readonly LOCK_FILE=$LOCK_ROOT/lifecycle.lock

fail() { printf '%s\n' "Boot writer recovery refused: $1" >&2; exit 1; }

bash_command() { /bin/bash "$@"; }
validate_lifecycle_command() { /usr/bin/python3 "$@"; }

recover_writers_under_lock() {
  local deploy_root="$1" control_root="$2"
  LIFECYCLE_LOCK_HELD=1 DEPLOY_ROOT="$deploy_root" PHASE_FILE="$deploy_root/deployment-phase.json" \
    bash_command "$control_root/recover-deployment-writer.sh" || return 1
  LIFECYCLE_LOCK_HELD=1 DEPLOY_ROOT="$deploy_root" PHASE_FILE="$deploy_root/backup-phase.json" \
    bash_command "$control_root/recover-backup-writer.sh" || return 1
  validate_lifecycle_command "$control_root/validate-operations-config.py" assert-lifecycle-quiescent "$deploy_root"
}

recover_writers_at_boot_main() {

[[ "$(/usr/bin/id -u)" == 0 ]] || fail "root is required"
[[ -d "$LOCK_ROOT" && ! -L "$LOCK_ROOT" && "$(/usr/bin/stat -c '%u:%g:%a' -- "$LOCK_ROOT")" == "0:0:700" ]] || {
  fail "shared lifecycle lock directory is unsafe"
}
if [[ -e "$LOCK_FILE" || -L "$LOCK_FILE" ]]; then
  [[ -f "$LOCK_FILE" && ! -L "$LOCK_FILE" && "$(/usr/bin/stat -c '%u:%g:%a:%h' -- "$LOCK_FILE")" == "0:0:600:1" ]] || {
    fail "shared lifecycle lock file is unsafe"
  }
fi
if [[ "${LIFECYCLE_LOCK_HELD:-0}" == 0 ]]; then
  exec 9>"$LOCK_FILE"
  /usr/bin/chown root:root "$LOCK_FILE"
  /usr/bin/chmod 0600 "$LOCK_FILE"
  [[ "$(/usr/bin/stat -c '%u:%g:%a:%h' -- "$LOCK_FILE")" == "0:0:600:1" ]] || fail "shared lifecycle lock file could not be secured"
  /usr/bin/flock 9
  # Re-open the installed control only after the shared lock is held. This
  # prevents a control-root exchange between script open and manifest verify.
  exec /usr/bin/env LIFECYCLE_LOCK_HELD=1 /bin/bash "$CONTROL_ROOT/recover-writers-at-boot.sh"
elif [[ "${LIFECYCLE_LOCK_HELD:-0}" == 1 ]]; then
  [[ "$(/usr/bin/readlink -f -- /proc/self/fd/9 2>/dev/null || true)" == "$LOCK_FILE" ]] || fail "inherited lifecycle lock descriptor is missing"
  /usr/bin/flock -n 9 || fail "inherited lifecycle lock is not held"
else
  fail "lifecycle lock inheritance marker is invalid"
fi

current_script="$(/usr/bin/readlink -f -- "${BASH_SOURCE[0]}")" || fail "control path cannot be resolved"
[[ "$current_script" == "$CONTROL_ROOT/recover-writers-at-boot.sh" && -f "$current_script" && ! -L "$current_script" &&
   "$(/usr/bin/stat -c '%u:%g:%a:%h' -- "$current_script")" == "0:0:400:1" ]] || {
  fail "run only the installed authenticated control"
}
/bin/bash "$CONTROL_ROOT/install-root-operations.sh" --verify-installed || fail "installed control verification failed"

recover_writers_under_lock "$FIXED_DEPLOY_ROOT" "$CONTROL_ROOT" || {
  fail "writer recovery left pending lifecycle state"
}
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  recover_writers_at_boot_main "$@"
fi
