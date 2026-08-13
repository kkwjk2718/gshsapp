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
readonly CONFIG_FILE=$CONFIG_ROOT/deploy.env
readonly HOST_ROLE_FILE=$CONFIG_ROOT/host-role
readonly SERVICE_FILE=$SYSTEMD_DIR/gshsapp-deploy.service
readonly RECOVERY_FILE=$SYSTEMD_DIR/gshsapp-writer-recovery.service
readonly RECOVERY_SOURCE=$CONTROL_ROOT/gshsapp-writer-recovery.service
readonly UPDATE_RECOVERY_FILE=$SYSTEMD_DIR/gshsapp-control-update-recovery.service
readonly UPDATE_RECOVERY_SOURCE=$CONTROL_ROOT/gshsapp-control-update-recovery.service
readonly QUARANTINE_FILE=$SYSTEMD_DIR/gshsapp-docker-boot-quarantine.service
readonly QUARANTINE_SOURCE=$CONTROL_ROOT/gshsapp-docker-boot-quarantine.service
readonly FIREWALL_FILE=$SYSTEMD_DIR/gshsapp-docker-user-firewall.service
readonly FIREWALL_SOURCE=$CONTROL_ROOT/gshsapp-docker-user-firewall.service
readonly FIREWALL_TIMER_FILE=$SYSTEMD_DIR/gshsapp-docker-user-firewall.timer
readonly FIREWALL_TIMER_SOURCE=$CONTROL_ROOT/gshsapp-docker-user-firewall.timer
readonly FIREWALL_ENABLE_LINK=$SYSTEMD_DIR/docker.service.wants/gshsapp-docker-user-firewall.service
readonly FIREWALL_TIMER_ENABLE_LINK=$SYSTEMD_DIR/docker.service.wants/gshsapp-docker-user-firewall.timer
readonly RECOVERY_ENABLE_LINK=$SYSTEMD_DIR/docker.service.wants/gshsapp-writer-recovery.service
readonly UPDATE_RECOVERY_ENABLE_LINK=$SYSTEMD_DIR/docker.service.requires/gshsapp-control-update-recovery.service
readonly QUARANTINE_ENABLE_LINK=$SYSTEMD_DIR/docker.service.requires/gshsapp-docker-boot-quarantine.service
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
if [[ "${1:-}" == --verify-unit || "${1:-}" == --verify-firewall-unit || "${1:-}" == --verify-recovery-unit || "${1:-}" == --verify-quarantine-unit ]]; then FAIL_STATUS=255; fi
fail() { printf '%s\n' "Deployment service install refused: $1" >&2; exit "$FAIL_STATUS"; }
[[ "$(/usr/bin/id -u)" == 0 ]] || fail "a trusted root console is required"
current_script="$(/usr/bin/readlink -f -- "${BASH_SOURCE[0]}")" || fail "installer path cannot be resolved"
[[ "$current_script" == "$CONTROL_ROOT/install-deploy-service.sh" ]] || fail "run only the installed authenticated control"
[[ -f "$current_script" && ! -L "$current_script" && "$(/usr/bin/stat -c '%u:%g:%a:%h' -- "$current_script")" == "0:0:400:1" ]] || {
  fail "installed deployment service control is unsafe"
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
  [[ "${1:-}" == --verify-unit || "${1:-}" == --verify-firewall-unit || "${1:-}" == --verify-recovery-unit || "${1:-}" == --verify-quarantine-unit || "${1:-}" == --refresh-units ]] || fail "inherited lifecycle lock is valid only for nested unit verification or a coordinated control refresh"
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

if [[ "${1:-}" == --refresh-units ]]; then
  [[ "$#" == 1 ]] || fail "--refresh-units takes no other arguments"
  set --
fi

validate_config() {
  /usr/bin/python3 "$CONTROL_ROOT/validate-operations-config.py" deploy "$CONFIG_FILE" \
    --host-role-file "$HOST_ROLE_FILE" "$@"
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
  /usr/bin/python3 - "$unit" "$expected_path" "$properties" <<'PY' || return 1
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
    return 0
  fi
  [[ "$unit" == "${UPDATE_RECOVERY_FILE##*/}" || "$unit" == "${QUARANTINE_FILE##*/}" ||
     "$unit" == "${RECOVERY_FILE##*/}" ]] || return 0
  dependency_properties="$(/usr/bin/systemctl show "$unit" \
    --property=BindsTo --property=PartOf --property=Before --property=Requires --property=After)" || return 1
  /usr/bin/python3 - "$unit" "${UPDATE_RECOVERY_FILE##*/}" "${QUARANTINE_FILE##*/}" "$dependency_properties" <<'PY'
import sys

unit, update_recovery_unit, quarantine_unit, text = sys.argv[1:]
values = {}
for line in text.splitlines():
    if "=" not in line:
        raise SystemExit(1)
    key, value = line.split("=", 1)
    if key in values:
        raise SystemExit(1)
    values[key] = value
if set(values) != {"BindsTo", "PartOf", "Before", "Requires", "After"}:
    raise SystemExit(1)
dependencies = {key: set(value.split()) for key, value in values.items()}
if unit == update_recovery_unit:
    if dependencies["BindsTo"] or dependencies["PartOf"] or dependencies["Requires"]:
        raise SystemExit(1)
    if not {"gshsapp-docker-boot-quarantine.service", "docker.service"}.issubset(dependencies["Before"]):
        raise SystemExit(1)
elif unit == quarantine_unit:
    if dependencies["BindsTo"] != {"docker.service"} or dependencies["PartOf"] != {"docker.service"}:
        raise SystemExit(1)
    if "docker.service" not in dependencies["Before"]:
        raise SystemExit(1)
    if "gshsapp-control-update-recovery.service" not in dependencies["Requires"]:
        raise SystemExit(1)
    if "gshsapp-control-update-recovery.service" not in dependencies["After"]:
        raise SystemExit(1)
else:
    if dependencies["BindsTo"] != {"docker.service"} or dependencies["PartOf"] != {"docker.service"}:
        raise SystemExit(1)
    if dependencies["Requires"] != {"docker.service", "gshsapp-docker-user-firewall.service"}:
        raise SystemExit(1)
    if not {"docker.service", "gshsapp-docker-user-firewall.service"}.issubset(dependencies["After"]):
        raise SystemExit(1)
PY
}

verify_unit_bytes() {
  local unit="$1" kind="$2" actual expected actual_digest expected_digest
  actual="$SYSTEMD_DIR/$unit"
  [[ -f "$actual" && ! -L "$actual" && "$(/usr/bin/stat -c '%u:%g:%a:%h' -- "$actual")" == "0:0:644:1" ]] || return 1
  expected="$(/usr/bin/mktemp "$LOCK_ROOT/.${unit}.verify.XXXXXXXX")" || return 1
  /usr/bin/chown root:root "$expected" || { /usr/bin/rm -f -- "$expected"; return 1; }
  /usr/bin/chmod 0600 "$expected" || { /usr/bin/rm -f -- "$expected"; return 1; }
  if [[ "$kind" == deploy ]]; then
    validate_config --render-service >"$expected" || { /usr/bin/rm -f -- "$expected"; return 1; }
  elif [[ "$kind" == recovery ]]; then
    /usr/bin/cp -- "$RECOVERY_SOURCE" "$expected" || { /usr/bin/rm -f -- "$expected"; return 1; }
  elif [[ "$kind" == update-recovery ]]; then
    /usr/bin/cp -- "$UPDATE_RECOVERY_SOURCE" "$expected" || { /usr/bin/rm -f -- "$expected"; return 1; }
  elif [[ "$kind" == quarantine ]]; then
    /usr/bin/cp -- "$QUARANTINE_SOURCE" "$expected" || { /usr/bin/rm -f -- "$expected"; return 1; }
  elif [[ "$kind" == firewall-timer ]]; then
    /usr/bin/cp -- "$FIREWALL_TIMER_SOURCE" "$expected" || { /usr/bin/rm -f -- "$expected"; return 1; }
  else
    /usr/bin/cp -- "$FIREWALL_SOURCE" "$expected" || { /usr/bin/rm -f -- "$expected"; return 1; }
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
  assert_no_unit_overrides "${UPDATE_RECOVERY_FILE##*/}" "$UPDATE_RECOVERY_ENABLE_LINK"
  assert_no_unit_overrides "${QUARANTINE_FILE##*/}" "$QUARANTINE_ENABLE_LINK"
  assert_no_unit_overrides "${RECOVERY_FILE##*/}" "$RECOVERY_ENABLE_LINK"
  assert_no_unit_overrides "${FIREWALL_FILE##*/}" "$FIREWALL_ENABLE_LINK"
  assert_no_unit_overrides "${FIREWALL_TIMER_FILE##*/}" "$FIREWALL_TIMER_ENABLE_LINK"
  verify_unit_bytes "${SERVICE_FILE##*/}" deploy || fail "installed deployment service is stale or modified"
  verify_unit_bytes "${UPDATE_RECOVERY_FILE##*/}" update-recovery || fail "installed control update recovery service is stale or modified"
  verify_unit_bytes "${QUARANTINE_FILE##*/}" quarantine || fail "installed pre-Docker quarantine service is stale or modified"
  verify_unit_bytes "${RECOVERY_FILE##*/}" recovery || fail "installed writer recovery service is stale or modified"
  verify_unit_bytes "${FIREWALL_FILE##*/}" firewall || fail "installed Docker ingress firewall service is stale or modified"
  verify_unit_bytes "${FIREWALL_TIMER_FILE##*/}" firewall-timer || fail "installed Docker ingress firewall timer is stale or modified"
  verify_loaded_unit "${SERVICE_FILE##*/}" "$SERVICE_FILE" || fail "effective deployment service differs from the authenticated unit"
  verify_loaded_unit "${UPDATE_RECOVERY_FILE##*/}" "$UPDATE_RECOVERY_FILE" || fail "effective control update recovery service differs from the authenticated unit"
  verify_loaded_unit "${QUARANTINE_FILE##*/}" "$QUARANTINE_FILE" || fail "effective pre-Docker quarantine service differs from the authenticated unit"
  verify_loaded_unit "${RECOVERY_FILE##*/}" "$RECOVERY_FILE" || fail "effective writer recovery service differs from the authenticated unit"
  verify_loaded_unit "${FIREWALL_FILE##*/}" "$FIREWALL_FILE" || fail "effective Docker ingress firewall service differs from the authenticated unit"
  verify_loaded_unit "${FIREWALL_TIMER_FILE##*/}" "$FIREWALL_TIMER_FILE" || fail "effective Docker ingress firewall timer differs from the authenticated unit"
  /usr/bin/systemctl is-enabled --quiet "${FIREWALL_FILE##*/}" || fail "Docker ingress firewall startup enforcement is disabled"
  /usr/bin/systemctl is-enabled --quiet "${UPDATE_RECOVERY_FILE##*/}" || fail "control update recovery startup is disabled"
  /usr/bin/systemctl is-enabled --quiet "${QUARANTINE_FILE##*/}" || fail "pre-Docker fail-closed quarantine is disabled"
  /usr/bin/systemctl is-enabled --quiet "${RECOVERY_FILE##*/}" || fail "boot writer recovery is disabled"
  /usr/bin/systemctl is-enabled --quiet "${FIREWALL_TIMER_FILE##*/}" || fail "Docker ingress firewall continuous verification is disabled"
  /usr/bin/systemctl is-active --quiet "${FIREWALL_TIMER_FILE##*/}" || fail "Docker ingress firewall continuous verification is inactive"
  exit 0
fi
if [[ "${1:-}" == --verify-firewall-unit ]]; then
  [[ "$#" == 1 ]] || fail "--verify-firewall-unit takes no other arguments"
  assert_no_unit_overrides "${UPDATE_RECOVERY_FILE##*/}" "$UPDATE_RECOVERY_ENABLE_LINK"
  assert_no_unit_overrides "${QUARANTINE_FILE##*/}" "$QUARANTINE_ENABLE_LINK"
  assert_no_unit_overrides "${RECOVERY_FILE##*/}" "$RECOVERY_ENABLE_LINK"
  assert_no_unit_overrides "${FIREWALL_FILE##*/}" "$FIREWALL_ENABLE_LINK"
  assert_no_unit_overrides "${FIREWALL_TIMER_FILE##*/}" "$FIREWALL_TIMER_ENABLE_LINK"
  verify_unit_bytes "${UPDATE_RECOVERY_FILE##*/}" update-recovery || fail "installed control update recovery service is stale or modified"
  verify_unit_bytes "${QUARANTINE_FILE##*/}" quarantine || fail "installed pre-Docker quarantine service is stale or modified"
  verify_unit_bytes "${RECOVERY_FILE##*/}" recovery || fail "installed writer recovery service is stale or modified"
  verify_unit_bytes "${FIREWALL_FILE##*/}" firewall || fail "installed Docker ingress firewall service is stale or modified"
  verify_unit_bytes "${FIREWALL_TIMER_FILE##*/}" firewall-timer || fail "installed Docker ingress firewall timer is stale or modified"
  verify_loaded_unit "${UPDATE_RECOVERY_FILE##*/}" "$UPDATE_RECOVERY_FILE" || fail "effective control update recovery service differs from the authenticated unit"
  verify_loaded_unit "${QUARANTINE_FILE##*/}" "$QUARANTINE_FILE" || fail "effective pre-Docker quarantine service differs from the authenticated unit"
  verify_loaded_unit "${RECOVERY_FILE##*/}" "$RECOVERY_FILE" || fail "effective writer recovery service differs from the authenticated unit"
  verify_loaded_unit "${FIREWALL_FILE##*/}" "$FIREWALL_FILE" || fail "effective Docker ingress firewall service differs from the authenticated unit"
  verify_loaded_unit "${FIREWALL_TIMER_FILE##*/}" "$FIREWALL_TIMER_FILE" || fail "effective Docker ingress firewall timer differs from the authenticated unit"
  /usr/bin/systemctl is-enabled --quiet "${QUARANTINE_FILE##*/}" || fail "pre-Docker fail-closed quarantine is disabled"
  /usr/bin/systemctl is-enabled --quiet "${UPDATE_RECOVERY_FILE##*/}" || fail "control update recovery startup is disabled"
  /usr/bin/systemctl is-enabled --quiet "${RECOVERY_FILE##*/}" || fail "boot writer recovery is disabled"
  /usr/bin/systemctl is-enabled --quiet "${FIREWALL_FILE##*/}" || fail "Docker ingress firewall startup enforcement is disabled"
  /usr/bin/systemctl is-enabled --quiet "${FIREWALL_TIMER_FILE##*/}" || fail "Docker ingress firewall continuous verification is disabled"
  /usr/bin/systemctl is-active --quiet "${FIREWALL_TIMER_FILE##*/}" || fail "Docker ingress firewall continuous verification is inactive"
  exit 0
fi
if [[ "${1:-}" == --verify-recovery-unit ]]; then
  [[ "$#" == 1 ]] || fail "--verify-recovery-unit takes no other arguments"
  assert_no_unit_overrides "${RECOVERY_FILE##*/}" "$RECOVERY_ENABLE_LINK"
  verify_unit_bytes "${RECOVERY_FILE##*/}" recovery || fail "installed writer recovery service is stale or modified"
  verify_loaded_unit "${RECOVERY_FILE##*/}" "$RECOVERY_FILE" || fail "effective writer recovery service differs from the authenticated unit"
  /usr/bin/systemctl is-enabled --quiet "${RECOVERY_FILE##*/}" || fail "boot writer recovery is disabled"
  exit 0
fi
if [[ "${1:-}" == --verify-quarantine-unit ]]; then
  [[ "$#" == 1 ]] || fail "--verify-quarantine-unit takes no other arguments"
  assert_no_unit_overrides "${UPDATE_RECOVERY_FILE##*/}" "$UPDATE_RECOVERY_ENABLE_LINK"
  assert_no_unit_overrides "${QUARANTINE_FILE##*/}" "$QUARANTINE_ENABLE_LINK"
  verify_unit_bytes "${UPDATE_RECOVERY_FILE##*/}" update-recovery || fail "installed control update recovery service is stale or modified"
  verify_unit_bytes "${QUARANTINE_FILE##*/}" quarantine || fail "installed pre-Docker quarantine service is stale or modified"
  verify_loaded_unit "${UPDATE_RECOVERY_FILE##*/}" "$UPDATE_RECOVERY_FILE" || fail "effective control update recovery service differs from the authenticated unit"
  verify_loaded_unit "${QUARANTINE_FILE##*/}" "$QUARANTINE_FILE" || fail "effective pre-Docker quarantine service differs from the authenticated unit"
  /usr/bin/systemctl is-enabled --quiet "${QUARANTINE_FILE##*/}" || fail "pre-Docker fail-closed quarantine is disabled"
  /usr/bin/systemctl is-enabled --quiet "${UPDATE_RECOVERY_FILE##*/}" || fail "control update recovery startup is disabled"
  exit 0
fi
[[ "$#" == 0 ]] || fail "usage: install-deploy-service.sh [--verify-config|--verify-unit|--verify-firewall-unit|--verify-recovery-unit|--verify-quarantine-unit]"
offsite_dir="$(validate_config --print-offsite-dir)" || fail "deployment policy validation failed"
[[ -d "$offsite_dir" && ! -L "$offsite_dir" && "$(/usr/bin/readlink -f -- "$offsite_dir")" == "$offsite_dir" ]] || {
  fail "OFFSITE_DIR must be an existing canonical non-symlink directory"
}
[[ "$(/usr/bin/stat -c '%u:%g:%a' -- "$offsite_dir")" == "0:0:700" ]] || fail "OFFSITE_DIR must be root-private mode 0700"
/usr/bin/findmnt --mountpoint "$offsite_dir" >/dev/null 2>&1 || fail "OFFSITE_DIR must be mounted before service installation"
validate_config --verify-mounted-offsite || fail "OFFSITE_DIR mount identity or hardening does not match deploy.env"

assert_no_unit_overrides "${SERVICE_FILE##*/}"
assert_no_unit_overrides "${UPDATE_RECOVERY_FILE##*/}" "$UPDATE_RECOVERY_ENABLE_LINK"
assert_no_unit_overrides "${QUARANTINE_FILE##*/}" "$QUARANTINE_ENABLE_LINK"
assert_no_unit_overrides "${RECOVERY_FILE##*/}" "$RECOVERY_ENABLE_LINK"
assert_no_unit_overrides "${FIREWALL_FILE##*/}" "$FIREWALL_ENABLE_LINK"
assert_no_unit_overrides "${FIREWALL_TIMER_FILE##*/}" "$FIREWALL_TIMER_ENABLE_LINK"
for unit in "$SERVICE_FILE" "$UPDATE_RECOVERY_FILE" "$QUARANTINE_FILE" "$RECOVERY_FILE" "$FIREWALL_FILE" "$FIREWALL_TIMER_FILE"; do
  if [[ -e "$unit" || -L "$unit" ]]; then
    [[ -f "$unit" && ! -L "$unit" && "$(/usr/bin/stat -c '%u:%g:%a:%h' -- "$unit")" == "0:0:644:1" ]] || {
      fail "refusing to replace an unsafe deployment or firewall unit"
    }
  fi
done

previous_quarantine_enabled=absent
if [[ -e "$QUARANTINE_FILE" ]]; then
  previous_quarantine_enabled="$(/usr/bin/systemctl is-enabled "${QUARANTINE_FILE##*/}" 2>/dev/null || true)"
  [[ "$previous_quarantine_enabled" == enabled || "$previous_quarantine_enabled" == disabled ]] || {
    fail "existing pre-Docker quarantine has an unsupported enablement state"
  }
fi
previous_update_recovery_enabled=absent
if [[ -e "$UPDATE_RECOVERY_FILE" ]]; then
  previous_update_recovery_enabled="$(/usr/bin/systemctl is-enabled "${UPDATE_RECOVERY_FILE##*/}" 2>/dev/null || true)"
  [[ "$previous_update_recovery_enabled" == enabled || "$previous_update_recovery_enabled" == disabled ]] || {
    fail "existing control update recovery has an unsupported enablement state"
  }
fi
previous_recovery_enabled=absent
if [[ -e "$RECOVERY_FILE" ]]; then
  previous_recovery_enabled="$(/usr/bin/systemctl is-enabled "${RECOVERY_FILE##*/}" 2>/dev/null || true)"
  [[ "$previous_recovery_enabled" == enabled || "$previous_recovery_enabled" == disabled ]] || {
    fail "existing boot writer recovery has an unsupported enablement state"
  }
fi
previous_firewall_enabled=absent
previous_firewall_active=inactive
if [[ -e "$FIREWALL_FILE" ]]; then
  previous_firewall_enabled="$(/usr/bin/systemctl is-enabled "${FIREWALL_FILE##*/}" 2>/dev/null || true)"
  [[ "$previous_firewall_enabled" == enabled || "$previous_firewall_enabled" == disabled ]] || {
    fail "existing Docker ingress firewall has an unsupported enablement state"
  }
  if /usr/bin/systemctl is-active --quiet "${FIREWALL_FILE##*/}"; then previous_firewall_active=active; fi
fi
previous_firewall_timer_enabled=absent
previous_firewall_timer_active=inactive
if [[ -e "$FIREWALL_TIMER_FILE" ]]; then
  previous_firewall_timer_enabled="$(/usr/bin/systemctl is-enabled "${FIREWALL_TIMER_FILE##*/}" 2>/dev/null || true)"
  [[ "$previous_firewall_timer_enabled" == enabled || "$previous_firewall_timer_enabled" == disabled ]] || {
    fail "existing Docker ingress firewall timer has an unsupported enablement state"
  }
  if /usr/bin/systemctl is-active --quiet "${FIREWALL_TIMER_FILE##*/}"; then previous_firewall_timer_active=active; fi
fi

stage_dir="$(/usr/bin/mktemp -d "$SYSTEMD_DIR/.gshsapp-deploy-unit.XXXXXXXX")"
/usr/bin/chown root:root "$stage_dir"
/usr/bin/chmod 0700 "$stage_dir"
service_stage="$stage_dir/${SERVICE_FILE##*/}"
update_recovery_stage="$stage_dir/${UPDATE_RECOVERY_FILE##*/}"
quarantine_stage="$stage_dir/${QUARANTINE_FILE##*/}"
recovery_stage="$stage_dir/${RECOVERY_FILE##*/}"
firewall_stage="$stage_dir/${FIREWALL_FILE##*/}"
firewall_timer_stage="$stage_dir/${FIREWALL_TIMER_FILE##*/}"
service_backup="$stage_dir/original.service"
update_recovery_backup="$stage_dir/original.update-recovery.service"
quarantine_backup="$stage_dir/original.quarantine.service"
recovery_backup="$stage_dir/original.recovery.service"
firewall_backup="$stage_dir/original.firewall.service"
firewall_timer_backup="$stage_dir/original.firewall.timer"
service_existed=false
update_recovery_existed=false
quarantine_existed=false
recovery_existed=false
firewall_existed=false
firewall_timer_existed=false
publication_started=false
if [[ -e "$SERVICE_FILE" ]]; then
  /usr/bin/cp -p -- "$SERVICE_FILE" "$service_backup"
  /usr/bin/sync "$service_backup"
  service_existed=true
fi
if [[ -e "$UPDATE_RECOVERY_FILE" ]]; then
  /usr/bin/cp -p -- "$UPDATE_RECOVERY_FILE" "$update_recovery_backup"
  /usr/bin/sync "$update_recovery_backup"
  update_recovery_existed=true
fi
if [[ -e "$QUARANTINE_FILE" ]]; then
  /usr/bin/cp -p -- "$QUARANTINE_FILE" "$quarantine_backup"
  /usr/bin/sync "$quarantine_backup"
  quarantine_existed=true
fi
if [[ -e "$RECOVERY_FILE" ]]; then
  /usr/bin/cp -p -- "$RECOVERY_FILE" "$recovery_backup"
  /usr/bin/sync "$recovery_backup"
  recovery_existed=true
fi
if [[ -e "$FIREWALL_FILE" ]]; then
  /usr/bin/cp -p -- "$FIREWALL_FILE" "$firewall_backup"
  /usr/bin/sync "$firewall_backup"
  firewall_existed=true
fi
if [[ -e "$FIREWALL_TIMER_FILE" ]]; then
  /usr/bin/cp -p -- "$FIREWALL_TIMER_FILE" "$firewall_timer_backup"
  /usr/bin/sync "$firewall_timer_backup"
  firewall_timer_existed=true
fi
/usr/bin/sync "$stage_dir"

sync_enable_directories() {
  local directory
  local -a directories=("$SYSTEMD_DIR")
  for directory in "$SYSTEMD_DIR/docker.service.requires" "$SYSTEMD_DIR/docker.service.wants"; do
    if [[ -e "$directory" || -L "$directory" ]]; then
      [[ -d "$directory" && ! -L "$directory" ]] || return 1
      directories+=("$directory")
    fi
  done
  /usr/bin/sync "${directories[@]}"
}

rollback_units() {
  /usr/bin/systemctl stop "${FIREWALL_TIMER_FILE##*/}" "${FIREWALL_FILE##*/}" >/dev/null 2>&1 || true
  /usr/bin/systemctl disable "${FIREWALL_TIMER_FILE##*/}" "${FIREWALL_FILE##*/}" "${RECOVERY_FILE##*/}" >/dev/null 2>&1 || true
  if [[ "$service_existed" == true && -f "$service_backup" && ! -L "$service_backup" ]]; then
    /usr/bin/mv -fT -- "$service_backup" "$SERVICE_FILE" || return 1
  else
    /usr/bin/rm -f -- "$SERVICE_FILE" || return 1
  fi
  if [[ "$update_recovery_existed" == true && -f "$update_recovery_backup" && ! -L "$update_recovery_backup" ]]; then
    /usr/bin/mv -fT -- "$update_recovery_backup" "$UPDATE_RECOVERY_FILE" || return 1
  else
    /usr/bin/rm -f -- "$UPDATE_RECOVERY_FILE" || return 1
  fi
  if [[ "$quarantine_existed" == true && -f "$quarantine_backup" && ! -L "$quarantine_backup" ]]; then
    /usr/bin/mv -fT -- "$quarantine_backup" "$QUARANTINE_FILE" || return 1
  else
    /usr/bin/rm -f -- "$QUARANTINE_FILE" || return 1
  fi
  if [[ "$recovery_existed" == true && -f "$recovery_backup" && ! -L "$recovery_backup" ]]; then
    /usr/bin/mv -fT -- "$recovery_backup" "$RECOVERY_FILE" || return 1
  else
    /usr/bin/rm -f -- "$RECOVERY_FILE" || return 1
  fi
  if [[ "$firewall_existed" == true && -f "$firewall_backup" && ! -L "$firewall_backup" ]]; then
    /usr/bin/mv -fT -- "$firewall_backup" "$FIREWALL_FILE" || return 1
  else
    /usr/bin/rm -f -- "$FIREWALL_FILE" || return 1
  fi
  if [[ "$firewall_timer_existed" == true && -f "$firewall_timer_backup" && ! -L "$firewall_timer_backup" ]]; then
    /usr/bin/mv -fT -- "$firewall_timer_backup" "$FIREWALL_TIMER_FILE" || return 1
  else
    /usr/bin/rm -f -- "$FIREWALL_TIMER_FILE" || return 1
  fi
  /usr/bin/sync "$SYSTEMD_DIR" || return 1
  /usr/bin/systemctl daemon-reload || return 1
  # Existing RequiredBy=docker anchors stay linked throughout rollback. If
  # this was a fresh/disabled install, remove their exact dangling links only
  # after the old unit bytes are durable, so a crash remains fail-closed.
  if [[ "$previous_update_recovery_enabled" == enabled ]]; then
    [[ -L "$UPDATE_RECOVERY_ENABLE_LINK" && "$(/usr/bin/readlink -f -- "$UPDATE_RECOVERY_ENABLE_LINK" 2>/dev/null || true)" == "$UPDATE_RECOVERY_FILE" ]] || return 1
    /usr/bin/systemctl is-enabled --quiet "${UPDATE_RECOVERY_FILE##*/}" || return 1
  elif [[ -e "$UPDATE_RECOVERY_ENABLE_LINK" || -L "$UPDATE_RECOVERY_ENABLE_LINK" ]]; then
    [[ -L "$UPDATE_RECOVERY_ENABLE_LINK" && "$(/usr/bin/readlink -f -- "$UPDATE_RECOVERY_ENABLE_LINK" 2>/dev/null || true)" == "$UPDATE_RECOVERY_FILE" ]] || return 1
    /usr/bin/rm -f -- "$UPDATE_RECOVERY_ENABLE_LINK" || return 1
  fi
  if [[ "$previous_quarantine_enabled" == enabled ]]; then
    [[ -L "$QUARANTINE_ENABLE_LINK" && "$(/usr/bin/readlink -f -- "$QUARANTINE_ENABLE_LINK" 2>/dev/null || true)" == "$QUARANTINE_FILE" ]] || return 1
    /usr/bin/systemctl is-enabled --quiet "${QUARANTINE_FILE##*/}" || return 1
  elif [[ -e "$QUARANTINE_ENABLE_LINK" || -L "$QUARANTINE_ENABLE_LINK" ]]; then
    [[ -L "$QUARANTINE_ENABLE_LINK" && "$(/usr/bin/readlink -f -- "$QUARANTINE_ENABLE_LINK" 2>/dev/null || true)" == "$QUARANTINE_FILE" ]] || return 1
    /usr/bin/rm -f -- "$QUARANTINE_ENABLE_LINK" || return 1
  fi
  if [[ "$previous_recovery_enabled" == enabled ]]; then
    /usr/bin/systemctl enable "${RECOVERY_FILE##*/}" >/dev/null || return 1
  fi
  if [[ "$previous_firewall_enabled" == enabled ]]; then
    /usr/bin/systemctl enable "${FIREWALL_FILE##*/}" >/dev/null || return 1
  fi
  if [[ "$previous_firewall_timer_enabled" == enabled ]]; then
    /usr/bin/systemctl enable "${FIREWALL_TIMER_FILE##*/}" >/dev/null || return 1
  fi
  # systemctl writes enablement links below nested dependency directories;
  # make their restored directory entries durable before reporting rollback.
  sync_enable_directories || return 1
  if [[ "$LOCK_INHERITED" == false && ( "$previous_firewall_active" == active || "$previous_firewall_timer_active" == active ) ]]; then
    /usr/bin/flock -u 9 || return 1
  fi
  if [[ "$LOCK_INHERITED" == false && "$previous_firewall_active" == active ]]; then
    /usr/bin/systemctl start "${FIREWALL_FILE##*/}" >/dev/null || return 1
  fi
  if [[ "$LOCK_INHERITED" == false && "$previous_firewall_timer_active" == active ]]; then
    /usr/bin/systemctl start "${FIREWALL_TIMER_FILE##*/}" >/dev/null || return 1
  fi
}

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  if [[ "$status" -ne 0 && "$publication_started" == true ]]; then
    rollback_units || printf '%s\n' "CRITICAL: deployment unit rollback could not restore the previous systemd state." >&2
  fi
  /usr/bin/rm -f -- "$service_stage" "$update_recovery_stage" "$quarantine_stage" "$recovery_stage" "$firewall_stage" "$firewall_timer_stage" \
    "$service_backup" "$update_recovery_backup" "$quarantine_backup" "$recovery_backup" "$firewall_backup" "$firewall_timer_backup"
  /usr/bin/rmdir -- "$stage_dir" 2>/dev/null || true
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

validate_config --render-service >"$service_stage" || fail "unable to render the validated deployment service"
/usr/bin/cp -- "$UPDATE_RECOVERY_SOURCE" "$update_recovery_stage" || fail "unable to stage the authenticated control update recovery unit"
/usr/bin/cp -- "$QUARANTINE_SOURCE" "$quarantine_stage" || fail "unable to stage the authenticated pre-Docker quarantine unit"
/usr/bin/cp -- "$RECOVERY_SOURCE" "$recovery_stage" || fail "unable to stage the authenticated boot writer recovery unit"
/usr/bin/cp -- "$FIREWALL_SOURCE" "$firewall_stage" || fail "unable to stage the authenticated Docker ingress firewall unit"
/usr/bin/cp -- "$FIREWALL_TIMER_SOURCE" "$firewall_timer_stage" || fail "unable to stage the authenticated Docker ingress firewall timer"

/usr/bin/chown root:root "$service_stage" "$update_recovery_stage" "$quarantine_stage" "$recovery_stage" "$firewall_stage" "$firewall_timer_stage"
/usr/bin/chmod 0644 "$service_stage" "$update_recovery_stage" "$quarantine_stage" "$recovery_stage" "$firewall_stage" "$firewall_timer_stage"
/usr/bin/sync "$service_stage" "$update_recovery_stage" "$quarantine_stage" "$recovery_stage" "$firewall_stage" "$firewall_timer_stage" "$stage_dir"
/usr/bin/systemd-analyze verify "$stage_dir/${SERVICE_FILE##*/}" "$stage_dir/${UPDATE_RECOVERY_FILE##*/}" "$stage_dir/${QUARANTINE_FILE##*/}" "$stage_dir/${RECOVERY_FILE##*/}" "$stage_dir/${FIREWALL_FILE##*/}" \
  "$stage_dir/${FIREWALL_TIMER_FILE##*/}" >/dev/null || {
  fail "systemd rejected the staged deployment, recovery, or firewall unit"
}
publication_started=true
/usr/bin/systemctl stop "${FIREWALL_TIMER_FILE##*/}" "${FIREWALL_FILE##*/}" >/dev/null 2>&1 || true
# Publish and durably enable the mount-independent recovery entrypoint before
# replacing the old quarantine. A power loss after the quarantine changes must
# still pull recovery into Docker's next start transaction.
/usr/bin/mv -T -- "$stage_dir/${UPDATE_RECOVERY_FILE##*/}" "$UPDATE_RECOVERY_FILE"
/usr/bin/sync "$UPDATE_RECOVERY_FILE" "$SYSTEMD_DIR"
assert_no_unit_overrides "${UPDATE_RECOVERY_FILE##*/}" "$UPDATE_RECOVERY_ENABLE_LINK"
/usr/bin/systemctl daemon-reload
verify_unit_bytes "${UPDATE_RECOVERY_FILE##*/}" update-recovery || fail "published control update recovery service changed before activation"
verify_loaded_unit "${UPDATE_RECOVERY_FILE##*/}" "$UPDATE_RECOVERY_FILE" || fail "effective control update recovery service differs from the authenticated unit"
/usr/bin/systemctl enable "${UPDATE_RECOVERY_FILE##*/}"
/usr/bin/systemctl is-enabled --quiet "${UPDATE_RECOVERY_FILE##*/}" || fail "control update recovery did not enable"
[[ -L "$UPDATE_RECOVERY_ENABLE_LINK" && "$(/usr/bin/readlink -f -- "$UPDATE_RECOVERY_ENABLE_LINK")" == "$UPDATE_RECOVERY_FILE" ]] || fail "control update recovery enable link is unsafe"
[[ -d "$SYSTEMD_DIR/docker.service.requires" && ! -L "$SYSTEMD_DIR/docker.service.requires" ]] || fail "Docker required-unit directory is unsafe"
/usr/bin/sync "$SYSTEMD_DIR/docker.service.requires" "$SYSTEMD_DIR"

/usr/bin/mv -T -- "$stage_dir/${SERVICE_FILE##*/}" "$SERVICE_FILE"
/usr/bin/mv -T -- "$stage_dir/${QUARANTINE_FILE##*/}" "$QUARANTINE_FILE"
/usr/bin/mv -T -- "$stage_dir/${RECOVERY_FILE##*/}" "$RECOVERY_FILE"
/usr/bin/mv -T -- "$stage_dir/${FIREWALL_FILE##*/}" "$FIREWALL_FILE"
/usr/bin/mv -T -- "$stage_dir/${FIREWALL_TIMER_FILE##*/}" "$FIREWALL_TIMER_FILE"
/usr/bin/sync "$SERVICE_FILE" "$UPDATE_RECOVERY_FILE" "$QUARANTINE_FILE" "$RECOVERY_FILE" "$FIREWALL_FILE" "$FIREWALL_TIMER_FILE" "$SYSTEMD_DIR"
assert_no_unit_overrides "${SERVICE_FILE##*/}"
assert_no_unit_overrides "${UPDATE_RECOVERY_FILE##*/}" "$UPDATE_RECOVERY_ENABLE_LINK"
assert_no_unit_overrides "${QUARANTINE_FILE##*/}" "$QUARANTINE_ENABLE_LINK"
assert_no_unit_overrides "${RECOVERY_FILE##*/}" "$RECOVERY_ENABLE_LINK"
assert_no_unit_overrides "${FIREWALL_FILE##*/}" "$FIREWALL_ENABLE_LINK"
assert_no_unit_overrides "${FIREWALL_TIMER_FILE##*/}" "$FIREWALL_TIMER_ENABLE_LINK"
/usr/bin/systemctl daemon-reload
/usr/bin/systemd-analyze verify "$SERVICE_FILE" "$UPDATE_RECOVERY_FILE" "$QUARANTINE_FILE" "$RECOVERY_FILE" "$FIREWALL_FILE" "$FIREWALL_TIMER_FILE" >/dev/null || fail "systemd rejected the published deployment, quarantine, recovery, or firewall unit"
verify_loaded_unit "${SERVICE_FILE##*/}" "$SERVICE_FILE" || fail "effective deployment service differs from the authenticated unit"
verify_loaded_unit "${UPDATE_RECOVERY_FILE##*/}" "$UPDATE_RECOVERY_FILE" || fail "effective control update recovery service differs from the authenticated unit"
verify_loaded_unit "${QUARANTINE_FILE##*/}" "$QUARANTINE_FILE" || fail "effective pre-Docker quarantine service differs from the authenticated unit"
verify_loaded_unit "${RECOVERY_FILE##*/}" "$RECOVERY_FILE" || fail "effective writer recovery service differs from the authenticated unit"
/usr/bin/systemctl enable "${UPDATE_RECOVERY_FILE##*/}" "${QUARANTINE_FILE##*/}" "${RECOVERY_FILE##*/}" "${FIREWALL_FILE##*/}" "${FIREWALL_TIMER_FILE##*/}"
/usr/bin/systemctl is-enabled --quiet "${UPDATE_RECOVERY_FILE##*/}" || fail "control update recovery did not enable"
[[ -L "$UPDATE_RECOVERY_ENABLE_LINK" && "$(/usr/bin/readlink -f -- "$UPDATE_RECOVERY_ENABLE_LINK")" == "$UPDATE_RECOVERY_FILE" ]] || fail "control update recovery enable link is unsafe"
/usr/bin/systemctl is-enabled --quiet "${QUARANTINE_FILE##*/}" || fail "pre-Docker fail-closed quarantine did not enable"
/usr/bin/systemctl is-enabled --quiet "${RECOVERY_FILE##*/}" || fail "boot writer recovery did not enable"
[[ -L "$RECOVERY_ENABLE_LINK" && "$(/usr/bin/readlink -f -- "$RECOVERY_ENABLE_LINK")" == "$RECOVERY_FILE" ]] || fail "writer recovery enable link is unsafe"
/usr/bin/systemctl is-enabled --quiet "${FIREWALL_FILE##*/}" || fail "Docker ingress firewall startup enforcement did not enable"
/usr/bin/systemctl is-enabled --quiet "${FIREWALL_TIMER_FILE##*/}" || fail "Docker ingress firewall continuous verification did not enable"
/usr/bin/sync "$SYSTEMD_DIR/docker.service.requires" "$SYSTEMD_DIR/docker.service.wants" "$SYSTEMD_DIR"
/usr/bin/systemctl restart "${FIREWALL_TIMER_FILE##*/}" || fail "Docker ingress firewall continuous verification could not start"
/usr/bin/systemctl is-active --quiet "${FIREWALL_TIMER_FILE##*/}" || fail "Docker ingress firewall continuous verification is inactive"
LIFECYCLE_LOCK_HELD=1 /bin/bash "$CONTROL_ROOT/docker-user-firewall.sh" --enforce || fail "Docker ingress firewall could not be enforced"
assert_no_unit_overrides "${FIREWALL_FILE##*/}" "$FIREWALL_ENABLE_LINK"
assert_no_unit_overrides "${FIREWALL_TIMER_FILE##*/}" "$FIREWALL_TIMER_ENABLE_LINK"
assert_no_unit_overrides "${SERVICE_FILE##*/}"
assert_no_unit_overrides "${UPDATE_RECOVERY_FILE##*/}" "$UPDATE_RECOVERY_ENABLE_LINK"
assert_no_unit_overrides "${QUARANTINE_FILE##*/}" "$QUARANTINE_ENABLE_LINK"
assert_no_unit_overrides "${RECOVERY_FILE##*/}" "$RECOVERY_ENABLE_LINK"
verify_unit_bytes "${SERVICE_FILE##*/}" deploy || fail "published deployment service changed after verification"
verify_unit_bytes "${UPDATE_RECOVERY_FILE##*/}" update-recovery || fail "published control update recovery service changed after verification"
verify_unit_bytes "${QUARANTINE_FILE##*/}" quarantine || fail "published pre-Docker quarantine service changed after verification"
verify_unit_bytes "${RECOVERY_FILE##*/}" recovery || fail "published writer recovery service changed after verification"
verify_unit_bytes "${FIREWALL_FILE##*/}" firewall || fail "published Docker ingress firewall service changed after verification"
verify_unit_bytes "${FIREWALL_TIMER_FILE##*/}" firewall-timer || fail "published Docker ingress firewall timer changed after verification"
verify_loaded_unit "${UPDATE_RECOVERY_FILE##*/}" "$UPDATE_RECOVERY_FILE" || fail "effective control update recovery service differs from the authenticated unit"
verify_loaded_unit "${QUARANTINE_FILE##*/}" "$QUARANTINE_FILE" || fail "effective pre-Docker quarantine service differs from the authenticated unit"
verify_loaded_unit "${RECOVERY_FILE##*/}" "$RECOVERY_FILE" || fail "effective writer recovery service differs from the authenticated unit"
verify_loaded_unit "${FIREWALL_FILE##*/}" "$FIREWALL_FILE" || fail "effective Docker ingress firewall service differs from the authenticated unit"
verify_loaded_unit "${FIREWALL_TIMER_FILE##*/}" "$FIREWALL_TIMER_FILE" || fail "effective Docker ingress firewall timer differs from the authenticated unit"
publication_started=false
/usr/bin/rm -f -- "$service_backup" "$update_recovery_backup" "$quarantine_backup" "$recovery_backup" "$firewall_backup" "$firewall_timer_backup"
/usr/bin/rmdir -- "$stage_dir" 2>/dev/null || true
/usr/bin/sync "$SYSTEMD_DIR"
trap - EXIT INT TERM
printf '%s\n' "Deployment unit and persistent Docker ingress firewall installed. Run deployment only from a trusted root console."
