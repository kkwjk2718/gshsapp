#!/usr/bin/env bash
set +x
set -Eeuo pipefail

PATH=/usr/sbin:/usr/bin:/sbin:/bin
LC_ALL=C
export PATH LC_ALL
IFS=$' \t\n'
umask 077

# Remove functions imported by an ambient Bash environment before invoking any
# external helper. The installed helper is the only executable policy here.
builtin readarray -t inherited_functions < <(builtin compgen -A function)
for inherited_function in "${inherited_functions[@]}"; do
  builtin unset -f -- "$inherited_function" 2>/dev/null || :
done
unset inherited_function inherited_functions

CONTROL_ROOT=/usr/local/lib/gshsapp-operations
CONFIG_ROOT=/etc/gshsapp-operations

fail() { printf '%s\n' "Pinned offsite operation refused: $1" >&2; exit 1; }

[[ "$#" == 1 ]] || fail "usage: pin-offsite-operation.sh import|restore|offsite"
verb="$1"
case "$verb" in
  import)
    config_kind=deploy
    config_file=$CONFIG_ROOT/deploy.env
    target=$CONTROL_ROOT/import-backup.sh
    ;;
  restore)
    config_kind=deploy
    config_file=$CONFIG_ROOT/deploy.env
    target=$CONTROL_ROOT/restore-drill.sh
    ;;
  offsite)
    config_kind=backup
    config_file=$CONFIG_ROOT/backup.env
    target=$CONTROL_ROOT/offsite-backup.sh
    ;;
  *) fail "operation must be exactly import, restore, or offsite" ;;
esac

pin_stage=${GSHSAPP_OFFSITE_PIN_STAGE:-}
pin_marker=${GSHSAPP_OFFSITE_PINNED:-}
requested_backup_name=${BACKUP_NAME:-}
requested_receipt_digest=${EXPECTED_OFFSITE_RECEIPT_SHA256:-}
requested_admin_user=${E2E_ADMIN_USER:-}
requested_admin_password=${E2E_ADMIN_PASSWORD:-}

sanitize_environment() {
  local exported_name
  local -a exported_names
  builtin readarray -t exported_names < <(builtin compgen -e)
  for exported_name in "${exported_names[@]}"; do
    builtin unset -- "$exported_name" 2>/dev/null || :
  done
  PATH=/usr/sbin:/usr/bin:/sbin:/bin
  LC_ALL=C
  HOME=/root
  CONTROL_ROOT=/usr/local/lib/gshsapp-operations
  CONFIG_ROOT=/etc/gshsapp-operations
  DEPLOY_ROOT=/opt/gshsapp
  BACKUP_DIR=/opt/gshsapp/root-backup
  LIFECYCLE_LOCK_FILE=/run/lock/gshsapp/lifecycle.lock
  PYTHON_BIN=/usr/bin/python3
  TIMEOUT_BIN=/usr/bin/timeout
  DOCKER_IMAGE=kkwjk2718git/gshsapp
  DOCKER_TIMEOUT_SECONDS=300
  RESTORE_DRILL_OUTPUT_FILE=
  export PATH LC_ALL HOME CONTROL_ROOT DEPLOY_ROOT BACKUP_DIR LIFECYCLE_LOCK_FILE
  export PYTHON_BIN TIMEOUT_BIN DOCKER_IMAGE DOCKER_TIMEOUT_SECONDS RESTORE_DRILL_OUTPUT_FILE
  builtin readarray -t exported_names < <(builtin compgen -e)
  for exported_name in "${exported_names[@]}"; do
    case "$exported_name" in
      PATH|LC_ALL|HOME|CONTROL_ROOT|DEPLOY_ROOT|BACKUP_DIR|LIFECYCLE_LOCK_FILE|PYTHON_BIN|TIMEOUT_BIN|DOCKER_IMAGE|DOCKER_TIMEOUT_SECONDS|RESTORE_DRILL_OUTPUT_FILE) ;;
      *) fail "ambient environment could not be reduced to the fixed allowlist" ;;
    esac
  done
}

sanitize_environment
readonly CONTROL_ROOT CONFIG_ROOT
export CONTROL_ROOT

[[ "$(/usr/bin/id -u)" == 0 ]] || fail "a trusted root console is required"
current_script="$(/usr/bin/readlink -f -- "${BASH_SOURCE[0]}")" || fail "helper path cannot be resolved"
[[ "$current_script" == "$CONTROL_ROOT/pin-offsite-operation.sh" ]] || fail "run only the installed authenticated helper"
[[ -f "$current_script" && ! -L "$current_script" && "$(/usr/bin/stat -c '%u:%g:%a:%h' -- "$current_script")" == "0:0:400:1" ]] || {
  fail "installed helper is unsafe"
}
/bin/bash "$CONTROL_ROOT/install-root-operations.sh" --verify-installed || {
  fail "installed root controls failed verification"
}

validator=(/usr/bin/python3 "$CONTROL_ROOT/validate-operations-config.py" "$config_kind" "$config_file")
if [[ "$config_kind" == deploy ]]; then
  validator+=(--host-role-file "$CONFIG_ROOT/host-role")
fi
policy_output="$("${validator[@]}" --print-manual-operation-policy)" || fail "operations configuration is invalid"
readarray -t policy_lines <<<"$policy_output"
expected_policy_lines=4
[[ "$config_kind" == backup ]] || expected_policy_lines=8
[[ "${#policy_lines[@]}" == "$expected_policy_lines" ]] || fail "offsite policy output is malformed"
OFFSITE_DIR=${policy_lines[0]}
OFFSITE_MOUNT_SOURCE=${policy_lines[1]}
OFFSITE_FSTYPE=${policy_lines[2]}
OFFSITE_REQUIRED_OPTIONS=${policy_lines[3]}
export OFFSITE_DIR OFFSITE_MOUNT_SOURCE OFFSITE_FSTYPE OFFSITE_REQUIRED_OPTIONS
if [[ "$config_kind" == deploy ]]; then
  IMAGE_TAG=${policy_lines[4]}
  IMAGE_DIGEST=${policy_lines[5]}
  BACKUP_MAX_AGE_HOURS=${policy_lines[6]}
  SMOKE_TIMEOUT_SECONDS=${policy_lines[7]}
  APP_VERSION=$IMAGE_TAG
  export IMAGE_TAG IMAGE_DIGEST BACKUP_MAX_AGE_HOURS SMOKE_TIMEOUT_SECONDS APP_VERSION
fi
case "$verb" in
  import)
    BACKUP_NAME=$requested_backup_name
    EXPECTED_OFFSITE_RECEIPT_SHA256=$requested_receipt_digest
    export BACKUP_NAME EXPECTED_OFFSITE_RECEIPT_SHA256
    ;;
  restore)
    E2E_ADMIN_USER=$requested_admin_user
    E2E_ADMIN_PASSWORD=$requested_admin_password
    export E2E_ADMIN_USER E2E_ADMIN_PASSWORD
    ;;
  offsite)
    BACKUP_NAME=$requested_backup_name
    export BACKUP_NAME
    ;;
esac
offsite_dir=$OFFSITE_DIR
[[ "$offsite_dir" =~ ^/[A-Za-z0-9._@+/-]+$ && "$offsite_dir" != / ]] || fail "OFFSITE_DIR is malformed"

case "$pin_stage" in
  "")
    [[ "$pin_marker" == "" ]] || fail "caller supplied an invalid mount pin marker"
    [[ -x /usr/bin/unshare ]] || fail "OS mount namespace support is unavailable"
    export GSHSAPP_OFFSITE_PIN_STAGE=1
    exec /usr/bin/unshare --mount --propagation private \
      /bin/bash "$current_script" "$verb"
    ;;
  1) ;;
  *) fail "mount namespace stage marker is invalid" ;;
esac

[[ "$pin_marker" == "" ]] || fail "nested offsite pinning is not permitted"
current_namespace="$(/usr/bin/readlink -- /proc/self/ns/mnt)" || fail "mount namespace identity is unavailable"
host_namespace="$(/usr/bin/readlink -- /proc/1/ns/mnt)" || fail "host mount namespace identity is unavailable"
[[ "$current_namespace" != "$host_namespace" ]] || fail "private mount namespace creation failed"
"${validator[@]}" --verify-mounted-offsite || fail "reviewed offsite mount is unavailable or unsafe"
/usr/bin/mount --bind -- "$offsite_dir" "$offsite_dir" || fail "OFFSITE_DIR could not be pinned"
export GSHSAPP_OFFSITE_PINNED=manual
"${validator[@]}" --verify-pinned-offsite || fail "OFFSITE_DIR pin verification failed"
unset GSHSAPP_OFFSITE_PIN_STAGE
exec /bin/bash "$target"
