#!/usr/bin/env bash
set -Eeuo pipefail

PATH=/usr/sbin:/usr/bin:/sbin:/bin
LC_ALL=C
export PATH LC_ALL
IFS=$' \t\n'
umask 077

readonly CONTROL_ROOT=/usr/local/lib/gshsapp-operations
readonly SYSTEMD_DIR=/etc/systemd/system
readonly CONFIG_ROOT=/etc/gshsapp-operations
readonly CONFIG_FILE=$CONFIG_ROOT/backup.env
readonly SERVICE_FILE=$SYSTEMD_DIR/gshsapp-backup.service
readonly TIMER_FILE=$SYSTEMD_DIR/gshsapp-backup.timer
readonly TIMER_ENABLE_LINK=$SYSTEMD_DIR/timers.target.wants/gshsapp-backup.timer
readonly LOCK_ROOT=/run/lock/gshsapp
readonly LOCK_FILE=$LOCK_ROOT/lifecycle.lock
readonly -a UNIT_SEARCH_ROOTS=(
  /etc/systemd/system.control
  /run/systemd/system.control
  /run/systemd/transient
  /run/systemd/generator.early
  /etc/systemd/system
  /etc/systemd/system.attached
  /run/systemd/system
  /run/systemd/system.attached
  /run/systemd/generator
  /usr/local/lib/systemd/system
  /usr/lib/systemd/system
  /lib/systemd/system
  /run/systemd/generator.late
)

FAIL_STATUS=1
if [[ "${1:-}" == --verify-unit ]]; then FAIL_STATUS=255; fi
fail() { printf '%s\n' "Backup timer install refused: $1" >&2; exit "$FAIL_STATUS"; }
[[ "$(/usr/bin/id -u)" == 0 ]] || fail "a trusted root console is required"
current_script="$(/usr/bin/readlink -f -- "${BASH_SOURCE[0]}")" || fail "installer path cannot be resolved"
[[ "$current_script" == "$CONTROL_ROOT/install-backup-timer.sh" ]] || fail "run only the installed authenticated control"
[[ -f "$current_script" && ! -L "$current_script" && "$(/usr/bin/stat -c '%u:%g:%a:%h' -- "$current_script")" == "0:0:400:1" ]] || {
  fail "installed timer control is unsafe"
}
[[ -d "$LOCK_ROOT" && ! -L "$LOCK_ROOT" && "$(/usr/bin/stat -c '%u:%g:%a' -- "$LOCK_ROOT")" == "0:0:700" ]] || {
  fail "shared lifecycle lock directory is unsafe"
}
if [[ -e "$LOCK_FILE" || -L "$LOCK_FILE" ]]; then
  [[ -f "$LOCK_FILE" && ! -L "$LOCK_FILE" && "$(/usr/bin/stat -c '%u:%g:%a:%h' -- "$LOCK_FILE")" == "0:0:600:1" ]] || {
    fail "shared lifecycle lock file is unsafe"
  }
fi
LOCK_INHERITED=false
if [[ "${LIFECYCLE_LOCK_HELD:-0}" == 1 ]]; then
  [[ "${1:-}" == --verify-unit || "${1:-}" == --refresh-units ]] || fail "inherited lifecycle lock is valid only for nested unit verification or a coordinated control refresh"
  [[ "$(/usr/bin/readlink -f -- /proc/self/fd/9 2>/dev/null || true)" == "$LOCK_FILE" ]] || {
    fail "inherited lifecycle lock descriptor is missing or unsafe"
  }
  /usr/bin/flock -n 9 || fail "inherited lifecycle lock is not held"
  LOCK_INHERITED=true
elif [[ "${LIFECYCLE_LOCK_HELD:-0}" == 0 ]]; then
  exec 9>"$LOCK_FILE"
  /usr/bin/chown root:root "$LOCK_FILE"
  /usr/bin/chmod 0600 "$LOCK_FILE"
  [[ "$(/usr/bin/stat -c '%u:%g:%a:%h' -- "$LOCK_FILE")" == "0:0:600:1" ]] || fail "shared lifecycle lock file could not be secured"
  /usr/bin/flock -n 9 || fail "deployment, backup, restore, import, control installation, or another unit installation is active"
else
  fail "lifecycle lock inheritance marker is invalid"
fi
/bin/bash "$CONTROL_ROOT/install-root-operations.sh" --verify-installed || fail "installed control verification failed"
LIFECYCLE_LOCK_HELD=1 /bin/bash "$CONTROL_ROOT/install-deploy-service.sh" --verify-recovery-unit || {
  fail "install and enable the authenticated boot writer recovery service before the backup timer"
}

if [[ "${1:-}" == --refresh-units ]]; then
  [[ "$#" == 1 ]] || fail "--refresh-units takes no other arguments"
  set --
fi

validate_config() {
  /usr/bin/python3 "$CONTROL_ROOT/validate-operations-config.py" backup "$CONFIG_FILE" "$@"
}

assert_no_unit_overrides() {
  local unit="$1" allowed_enable_link="${2:-}" target="$SYSTEMD_DIR/$unit" root candidate unit_stem unit_type prefix dropin alias resolved_alias wants
  local -a dropin_names
  unit_stem="${unit%.*}"
  unit_type="${unit##*.}"
  dropin_names=("$unit.d" "$unit_type.d")
  prefix="$unit_stem"
  while [[ "$prefix" == *-* ]]; do
    prefix="${prefix%-*}"
    dropin_names+=("$prefix-.${unit_type}.d")
  done
  for root in "${UNIT_SEARCH_ROOTS[@]}"; do
    candidate="$root/$unit"
    if [[ "$candidate" != "$target" && ( -e "$candidate" || -L "$candidate" ) ]]; then
      fail "systemd unit is shadowed outside the reviewed system path: $candidate"
    fi
    for dropin in "${dropin_names[@]}"; do
      candidate="$root/$dropin"
      [[ ! -e "$candidate" && ! -L "$candidate" ]] || fail "systemd drop-in override is not permitted: $candidate"
    done
    if [[ -d "$root" ]]; then
      while IFS= read -r -d '' alias; do
        [[ "$alias" == "$target" ]] && continue
        resolved_alias="$(/usr/bin/readlink -f -- "$alias" 2>/dev/null || true)"
        [[ "$resolved_alias" != "$target" ]] || fail "systemd unit alias is not permitted: $alias"
      done < <(/usr/bin/find "$root" -mindepth 1 -maxdepth 1 -type l -print0)
    fi
  done
  for wants in "$SYSTEMD_DIR"/*.wants "$SYSTEMD_DIR"/*.requires; do
    [[ -d "$wants" && ! -L "$wants" ]] || continue
    candidate="$wants/$unit"
    if [[ -e "$candidate" || -L "$candidate" ]]; then
      [[ -n "$allowed_enable_link" && "$candidate" == "$allowed_enable_link" && -L "$candidate" &&
         "$(/usr/bin/readlink -f -- "$candidate" 2>/dev/null || true)" == "$target" ]] || {
        fail "unit has an unexpected automatic start dependency: $candidate"
      }
    fi
  done
}

verify_loaded_unit() {
  local unit="$1" expected_path="$2" properties dependency_properties mount_properties offsite_dir
  # Verify the effective FragmentPath DropInPaths Names and LoadState, not
  # merely the source bytes that were written by this installer.
  properties="$(/usr/bin/systemctl show "$unit" \
    --property=FragmentPath --property=DropInPaths --property=Names --property=LoadState)" || return 1
  /usr/bin/python3 - "$unit" "$expected_path" "$properties" <<'PY'
import sys

unit, expected_path, text = sys.argv[1:]
values = {}
for line in text.splitlines():
    if "=" not in line:
        raise SystemExit(1)
    key, value = line.split("=", 1)
    if key in values:
        raise SystemExit(1)
    values[key] = value
if values != {
    "FragmentPath": expected_path,
    "DropInPaths": "",
    "Names": unit,
    "LoadState": "loaded",
}:
    raise SystemExit(1)
PY
  if [[ "$unit" == "${SERVICE_FILE##*/}" ]]; then
    dependency_properties="$(/usr/bin/systemctl show "$unit" \
      --property=BindsTo --property=PartOf --property=TimeoutStopUSec)" || return 1
    /usr/bin/python3 - "$dependency_properties" <<'PY' || return 1
import sys

values = {}
for line in sys.argv[1].splitlines():
    if "=" not in line:
        raise SystemExit(1)
    key, value = line.split("=", 1)
    if key in values:
        raise SystemExit(1)
    values[key] = value
if values != {
    "BindsTo": "docker.service",
    "PartOf": "docker.service",
    "TimeoutStopUSec": "45s",
}:
    raise SystemExit(1)
PY
    offsite_dir="$(validate_config --print-offsite-dir)" || return 1
    mount_properties="$(/usr/bin/systemctl show "$unit" \
      --property=PrivateMounts --property=MountFlags --property=BindPaths)" || return 1
    /usr/bin/python3 - "$offsite_dir" "$mount_properties" <<'PY' || return 1
import sys

expected, text = sys.argv[1:]
values = {}
for line in text.splitlines():
    if "=" not in line:
        raise SystemExit(1)
    key, value = line.split("=", 1)
    if key in values:
        raise SystemExit(1)
    values[key] = value
if values != {
    "PrivateMounts": "yes",
    "MountFlags": "262144",
    "BindPaths": f"{expected}:{expected}:rbind",
}:
    raise SystemExit(1)
PY
  fi
}

verify_unit_bytes() {
  local unit="$1" kind="$2" actual expected actual_digest expected_digest
  actual="$SYSTEMD_DIR/$unit"
  [[ -f "$actual" && ! -L "$actual" && "$(/usr/bin/stat -c '%u:%g:%a:%h' -- "$actual")" == "0:0:644:1" ]] || return 1
  expected="$(/usr/bin/mktemp "$LOCK_ROOT/.${unit}.verify.XXXXXXXX")" || return 1
  /usr/bin/chown root:root "$expected" || { /usr/bin/rm -f -- "$expected"; return 1; }
  /usr/bin/chmod 0600 "$expected" || { /usr/bin/rm -f -- "$expected"; return 1; }
  if [[ "$kind" == service ]]; then
    validate_config --render-service >"$expected" || { /usr/bin/rm -f -- "$expected"; return 1; }
  else
    validate_config --render-timer >"$expected" || { /usr/bin/rm -f -- "$expected"; return 1; }
  fi
  actual_digest="$(/usr/bin/sha256sum -- "$actual")" || { /usr/bin/rm -f -- "$expected"; return 1; }
  expected_digest="$(/usr/bin/sha256sum -- "$expected")" || { /usr/bin/rm -f -- "$expected"; return 1; }
  /usr/bin/rm -f -- "$expected"
  [[ "${actual_digest%% *}" == "${expected_digest%% *}" ]]
}

if [[ "${1:-}" == --verify-config ]]; then
  [[ "$#" == 1 ]] || fail "--verify-config takes no other arguments"
  validate_config
  exit 0
fi
if [[ "${1:-}" == --verify-unit ]]; then
  [[ "$#" == 1 ]] || fail "--verify-unit takes no other arguments"
  assert_no_unit_overrides "${SERVICE_FILE##*/}"
  assert_no_unit_overrides "${TIMER_FILE##*/}" "$TIMER_ENABLE_LINK"
  verify_unit_bytes "${SERVICE_FILE##*/}" service || fail "installed backup service is stale or modified"
  verify_unit_bytes "${TIMER_FILE##*/}" timer || fail "installed backup timer is stale or modified"
  verify_loaded_unit "${SERVICE_FILE##*/}" "$SERVICE_FILE" || fail "effective backup service differs from the authenticated unit"
  verify_loaded_unit "${TIMER_FILE##*/}" "$TIMER_FILE" || fail "effective backup timer differs from the authenticated unit"
  /usr/bin/systemctl is-enabled --quiet "${TIMER_FILE##*/}" || fail "backup timer persistence is disabled"
  /usr/bin/systemctl is-active --quiet "${TIMER_FILE##*/}" || fail "backup timer persistence is inactive"
  exit 0
fi
[[ "$#" == 0 ]] || fail "usage: install-backup-timer.sh [--verify-config|--verify-unit]"

offsite_dir="$(validate_config --print-offsite-dir)" || fail "backup policy validation failed"
[[ -d "$offsite_dir" && ! -L "$offsite_dir" ]] || fail "OFFSITE_DIR must be an existing non-symlink directory"
[[ "$(/usr/bin/readlink -f -- "$offsite_dir")" == "$offsite_dir" ]] || fail "OFFSITE_DIR must already be canonical"
[[ "$(/usr/bin/stat -c '%u:%g:%a' -- "$offsite_dir")" == "0:0:700" ]] || fail "OFFSITE_DIR must be root-private mode 0700"
/usr/bin/findmnt --mountpoint "$offsite_dir" >/dev/null 2>&1 || fail "OFFSITE_DIR must be mounted before timer installation"
validate_config --verify-mounted-offsite-base || fail "OFFSITE_DIR mount identity or hardening does not match backup.env"
receipt_dir="$(validate_config --print-receipt-dir)" || fail "unable to derive the fixed offsite receipt directory"
[[ "$receipt_dir" == "$offsite_dir/.gshsapp-receipts" ]] || fail "offsite receipt directory is not fixed below OFFSITE_DIR"
if [[ -e "$receipt_dir" || -L "$receipt_dir" ]]; then
  [[ -d "$receipt_dir" && ! -L "$receipt_dir" && "$(/usr/bin/stat -c '%u:%g:%a' -- "$receipt_dir")" == "0:0:700" ]] || {
    fail "existing offsite receipt directory is unsafe"
  }
else
  /usr/bin/install -d -o root -g root -m 0700 -- "$receipt_dir"
  /usr/bin/sync "$receipt_dir" "$offsite_dir"
fi
validate_config --verify-mounted-offsite || fail "OFFSITE_DIR mount identity or hardening does not match backup.env"

assert_no_unit_overrides "${SERVICE_FILE##*/}"
assert_no_unit_overrides "${TIMER_FILE##*/}" "$TIMER_ENABLE_LINK"
for unit in "$SERVICE_FILE" "$TIMER_FILE"; do
  if [[ -e "$unit" || -L "$unit" ]]; then
    [[ -f "$unit" && ! -L "$unit" && "$(/usr/bin/stat -c '%u:%g:%a:%h' -- "$unit")" == "0:0:644:1" ]] || {
      fail "refusing to replace an unsafe systemd unit: $unit"
    }
  fi
done

previous_timer_enabled=absent
previous_timer_active=absent
if [[ -e "$TIMER_FILE" ]]; then
  previous_timer_enabled="$(/usr/bin/systemctl is-enabled "${TIMER_FILE##*/}" 2>/dev/null || true)"
  [[ "$previous_timer_enabled" == enabled || "$previous_timer_enabled" == disabled ]] || {
    fail "existing backup timer has an unsupported enablement state"
  }
  previous_timer_active="$(/usr/bin/systemctl is-active "${TIMER_FILE##*/}" 2>/dev/null || true)"
  [[ "$previous_timer_active" == active || "$previous_timer_active" == inactive ]] || {
    fail "existing backup timer has an unsupported active state"
  }
fi

stage_dir="$(/usr/bin/mktemp -d "$SYSTEMD_DIR/.gshsapp-backup-units.XXXXXXXX")"
/usr/bin/chown root:root "$stage_dir"
/usr/bin/chmod 0700 "$stage_dir"
service_stage="$stage_dir/${SERVICE_FILE##*/}"
timer_stage="$stage_dir/${TIMER_FILE##*/}"
service_backup="$stage_dir/original.service"
timer_backup="$stage_dir/original.timer"
service_existed=false
timer_existed=false
publication_started=false
if [[ -e "$SERVICE_FILE" ]]; then
  /usr/bin/cp -p -- "$SERVICE_FILE" "$service_backup"
  /usr/bin/sync "$service_backup"
  service_existed=true
fi
if [[ -e "$TIMER_FILE" ]]; then
  /usr/bin/cp -p -- "$TIMER_FILE" "$timer_backup"
  /usr/bin/sync "$timer_backup"
  timer_existed=true
fi
/usr/bin/sync "$stage_dir"

rollback_units() {
  if [[ "$previous_timer_active" != active ]]; then
    /usr/bin/systemctl stop "${TIMER_FILE##*/}" >/dev/null 2>&1 || true
  fi
  if [[ "$previous_timer_enabled" != enabled ]]; then
    /usr/bin/systemctl disable "${TIMER_FILE##*/}" >/dev/null 2>&1 || true
  fi
  if [[ "$service_existed" == true && -f "$service_backup" && ! -L "$service_backup" ]]; then
    /usr/bin/mv -fT -- "$service_backup" "$SERVICE_FILE" || return 1
  else
    /usr/bin/rm -f -- "$SERVICE_FILE" || return 1
  fi
  if [[ "$timer_existed" == true && -f "$timer_backup" && ! -L "$timer_backup" ]]; then
    /usr/bin/mv -fT -- "$timer_backup" "$TIMER_FILE" || return 1
  else
    /usr/bin/rm -f -- "$TIMER_FILE" || return 1
  fi
  /usr/bin/sync "$SYSTEMD_DIR" || return 1
  /usr/bin/systemctl daemon-reload || return 1
  if [[ "$previous_timer_enabled" == enabled ]]; then
    /usr/bin/systemctl enable "${TIMER_FILE##*/}" >/dev/null || return 1
  fi
  if [[ "$LOCK_INHERITED" == false && "$previous_timer_active" == active ]]; then
    /usr/bin/systemctl start "${TIMER_FILE##*/}" || return 1
  fi
}

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  if [[ "$status" -ne 0 && "$publication_started" == true ]]; then
    rollback_units || printf '%s\n' "CRITICAL: backup unit rollback could not restore the previous systemd state." >&2
  fi
  /usr/bin/rm -f -- "$service_stage" "$timer_stage" "$service_backup" "$timer_backup"
  /usr/bin/rmdir -- "$stage_dir" 2>/dev/null || true
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

validate_config --render-service >"$service_stage" || fail "unable to render the validated backup service"
validate_config --render-timer >"$timer_stage" || fail "unable to render the validated backup timer"

/usr/bin/chown root:root "$service_stage" "$timer_stage"
/usr/bin/chmod 0644 "$service_stage" "$timer_stage"
/usr/bin/sync "$service_stage" "$timer_stage" "$stage_dir"
/usr/bin/systemd-analyze verify "$stage_dir/${SERVICE_FILE##*/}" "$stage_dir/${TIMER_FILE##*/}" >/dev/null || {
  fail "systemd rejected the staged backup units"
}
publication_started=true
/usr/bin/mv -T -- "$stage_dir/${SERVICE_FILE##*/}" "$SERVICE_FILE"
/usr/bin/mv -T -- "$stage_dir/${TIMER_FILE##*/}" "$TIMER_FILE"
/usr/bin/sync "$SERVICE_FILE" "$TIMER_FILE" "$SYSTEMD_DIR"
assert_no_unit_overrides "${SERVICE_FILE##*/}"
assert_no_unit_overrides "${TIMER_FILE##*/}" "$TIMER_ENABLE_LINK"
/usr/bin/systemctl daemon-reload
/usr/bin/systemd-analyze verify "$SERVICE_FILE" "$TIMER_FILE" >/dev/null || fail "systemd rejected the published backup units"
verify_loaded_unit "${SERVICE_FILE##*/}" "$SERVICE_FILE" || fail "effective backup service differs from the authenticated unit"
verify_loaded_unit "${TIMER_FILE##*/}" "$TIMER_FILE" || fail "effective backup timer differs from the authenticated unit"
/usr/bin/systemctl enable --now gshsapp-backup.timer
/usr/bin/systemctl is-enabled --quiet gshsapp-backup.timer || fail "backup timer did not enable"
/usr/bin/systemctl is-active --quiet gshsapp-backup.timer || fail "backup timer did not become active"
assert_no_unit_overrides "${SERVICE_FILE##*/}"
assert_no_unit_overrides "${TIMER_FILE##*/}" "$TIMER_ENABLE_LINK"
verify_unit_bytes "${SERVICE_FILE##*/}" service || fail "published backup service changed after verification"
verify_unit_bytes "${TIMER_FILE##*/}" timer || fail "published backup timer changed after verification"
verify_loaded_unit "${SERVICE_FILE##*/}" "$SERVICE_FILE" || fail "effective backup service changed after enabling the timer"
verify_loaded_unit "${TIMER_FILE##*/}" "$TIMER_FILE" || fail "effective backup timer changed after enabling it"
publication_started=false
/usr/bin/rm -f -- "$service_backup" "$timer_backup"
/usr/bin/rmdir -- "$stage_dir" 2>/dev/null || true
/usr/bin/sync "$SYSTEMD_DIR"
trap - EXIT INT TERM
printf '%s\n' "Root backup timer installed and enabled."
