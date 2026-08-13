#!/usr/bin/env bash
set -Eeuo pipefail

PATH=/usr/sbin:/usr/bin:/sbin:/bin
LC_ALL=C
export PATH LC_ALL
IFS=$' \t\n'
umask 077

readonly CONTROL_ROOT=/usr/local/lib/gshsapp-operations
readonly CONTROL_PARENT=/usr/local/lib
readonly SYSTEMD_DIR=/etc/systemd/system
readonly DEPLOY_ROOT=/opt/gshsapp
readonly CONFIG_ROOT=/etc/gshsapp-operations
readonly HOST_ROLE_FILE=$CONFIG_ROOT/host-role
readonly UPDATE_STATE_ROOT=/var/lib/gshsapp-operations
readonly UPDATE_PHASE_FILE=$UPDATE_STATE_ROOT/control-update.json
readonly BOOTSTRAP_PROOF=/run/gshsapp-root-bootstrap.approved
readonly LOCK_ROOT=/run/lock/gshsapp
readonly LOCK_FILE=$LOCK_ROOT/lifecycle.lock
readonly BOOT_RECOVERY_LOCK_WAIT_SECONDS=60
readonly CONTROL_MANIFEST_RELATIVE=deploy/control-assets.sha256
readonly BOOTSTRAP_MANIFEST_RELATIVE=deploy/root-bootstrap.sha256
readonly -a DEPLOY_UNIT_NAMES=(
  gshsapp-deploy.service
  gshsapp-control-update-recovery.service
  gshsapp-docker-boot-quarantine.service
  gshsapp-writer-recovery.service
  gshsapp-docker-user-firewall.service
  gshsapp-docker-user-firewall.timer
)
readonly -a BACKUP_UNIT_NAMES=(gshsapp-backup.service gshsapp-backup.timer)
readonly -a ENABLED_UNIT_NAMES=(
  gshsapp-control-update-recovery.service
  gshsapp-docker-boot-quarantine.service
  gshsapp-writer-recovery.service
  gshsapp-docker-user-firewall.service
  gshsapp-docker-user-firewall.timer
  gshsapp-backup.timer
)
readonly -a IMMUTABLE_BOOT_ANCHOR_UNITS=(
  gshsapp-control-update-recovery.service
  gshsapp-docker-boot-quarantine.service
)
readonly -a MUTABLE_ENABLED_UNIT_NAMES=(
  gshsapp-writer-recovery.service
  gshsapp-docker-user-firewall.service
  gshsapp-docker-user-firewall.timer
  gshsapp-backup.timer
)
readonly -a ACTIVE_TIMER_NAMES=(gshsapp-docker-user-firewall.timer gshsapp-backup.timer)
declare -Ar UNIT_ENABLE_LINKS=(
  [gshsapp-control-update-recovery.service]="$SYSTEMD_DIR/docker.service.requires/gshsapp-control-update-recovery.service"
  [gshsapp-docker-boot-quarantine.service]="$SYSTEMD_DIR/docker.service.requires/gshsapp-docker-boot-quarantine.service"
  [gshsapp-writer-recovery.service]="$SYSTEMD_DIR/docker.service.wants/gshsapp-writer-recovery.service"
  [gshsapp-docker-user-firewall.service]="$SYSTEMD_DIR/docker.service.wants/gshsapp-docker-user-firewall.service"
  [gshsapp-docker-user-firewall.timer]="$SYSTEMD_DIR/docker.service.wants/gshsapp-docker-user-firewall.timer"
  [gshsapp-backup.timer]="$SYSTEMD_DIR/timers.target.wants/gshsapp-backup.timer"
)

fail() { printf '%s\n' "Root operations install refused: $1" >&2; exit 1; }

declare -Ar EXPECTED_CONTROLS=(
  [deploy/approve-release.sh]=0
  [deploy/bootstrap-backup.py]=0
  [deploy/compose.yml]=0
  [deploy/deploy-policy.sh]=0
  [deploy/deploy.sh]=0
  [deploy/docker-user-firewall.sh]=0
  [deploy/gshsapp-control-update-recovery.service]=0
  [deploy/gshsapp-docker-boot-quarantine.service]=0
  [deploy/gshsapp-docker-user-firewall.service]=0
  [deploy/gshsapp-docker-user-firewall.timer]=0
  [deploy/gshsapp-writer-recovery.service]=0
  [deploy/import-backup.sh]=0
  [deploy/host-hardening.sh]=0
  [deploy/install-backup-timer.sh]=0
  [deploy/install-deploy-service.sh]=0
  [deploy/install-root-operations.sh]=0
  [deploy/offsite-backup.sh]=0
  [deploy/pin-offsite-operation.sh]=0
  [deploy/predeployment-backup.sh]=0
  [deploy/recover-backup-writer.sh]=0
  [deploy/recover-deployment-writer.sh]=0
  [deploy/recover-writers-at-boot.sh]=0
  [deploy/restore-drill.sh]=0
  [deploy/run-scheduled-backup.sh]=0
  [deploy/validate-ufw-rules.py]=0
  [deploy/validate-live-database.py]=0
  [deploy/validate-docker-network.py]=0
  [deploy/validate-host-routes.py]=0
  [deploy/validate-operations-config.py]=0
  [deploy/workflow-policy.sha256]=0
)
declare -Ar EXPECTED_BOOTSTRAP=(
  [deploy/control-assets.sha256]=0
  [deploy/install-backup-timer.sh]=0
  [deploy/install-deploy-service.sh]=0
  [deploy/install-root-operations.sh]=0
)

assert_root_owned_regular() {
  local file="$1" expected_mode="$2" metadata
  [[ -f "$file" && ! -L "$file" ]] || return 1
  metadata="$(/usr/bin/stat -c '%u:%g:%a:%h' -- "$file")" || return 1
  [[ "$metadata" == "0:0:${expected_mode}:1" ]]
}

assert_root_owned_source_file() {
  local file="$1" metadata owner group mode links mode_value
  [[ -f "$file" && ! -L "$file" ]] || fail "trusted source file is missing or unsafe: $file"
  metadata="$(/usr/bin/stat -c '%u:%g:%a:%h' -- "$file")" || fail "trusted source metadata is unavailable"
  IFS=: read -r owner group mode links <<<"$metadata"
  [[ "$owner" == 0 && "$group" == 0 && "$links" == 1 && "$mode" =~ ^[0-7]{3,4}$ ]] || {
    fail "trusted source files must be root-owned regular files without hard links"
  }
  mode_value=$((8#$mode))
  (( (mode_value & 0022) == 0 )) || fail "trusted source files must not be group/world writable"
}

assert_secure_source_ancestry() {
  local current="$1" metadata owner group mode mode_value
  [[ "$current" == /* && -d "$current" && ! -L "$current" ]] || fail "verified source root is unsafe"
  while :; do
    [[ -d "$current" && ! -L "$current" ]] || fail "trusted source ancestor is unsafe"
    metadata="$(/usr/bin/stat -c '%u:%g:%a' -- "$current")" || fail "trusted source ancestor metadata is unavailable"
    IFS=: read -r owner group mode <<<"$metadata"
    [[ "$owner" == 0 && "$group" == 0 && "$mode" =~ ^[0-7]{3,4}$ ]] || fail "trusted source ancestors must be root-owned"
    mode_value=$((8#$mode))
    (( (mode_value & 0022) == 0 )) || fail "trusted source ancestors must not be group/world writable"
    [[ "$current" == / ]] && break
    current="$(/usr/bin/dirname -- "$current")"
  done
}

checksum_file() {
  local output
  output="$(/usr/bin/sha256sum -- "$1")" || return 1
  printf '%s' "${output%% *}"
}

verify_manifest_source() {
  local source_root="$1" manifest_relative="$2" expected_kind="$3"
  local manifest="$source_root/$manifest_relative" raw digest relative source actual count=0
  local -A seen=()
  assert_root_owned_source_file "$manifest"
  while IFS= read -r raw || [[ -n "$raw" ]]; do
    [[ "$raw" =~ ^([0-9a-f]{64})\ \ (deploy/[A-Za-z0-9._-]+)$ ]] || fail "$expected_kind manifest is malformed"
    digest="${BASH_REMATCH[1]}"
    relative="${BASH_REMATCH[2]}"
    if [[ "$expected_kind" == control ]]; then
      [[ -n "${EXPECTED_CONTROLS[$relative]+present}" ]] || fail "control manifest path is unexpected"
    else
      [[ -n "${EXPECTED_BOOTSTRAP[$relative]+present}" ]] || fail "bootstrap manifest path is unexpected"
    fi
    [[ -z "${seen[$relative]+present}" ]] || fail "$expected_kind manifest contains a duplicate path"
    seen[$relative]=1
    source="$source_root/$relative"
    assert_root_owned_source_file "$source"
    actual="$(checksum_file "$source")" || fail "unable to hash trusted source"
    [[ "$actual" == "$digest" ]] || fail "$expected_kind source digest mismatch: $relative"
    count=$((count + 1))
  done <"$manifest"
  if [[ "$expected_kind" == control ]]; then
    [[ "$count" == "${#EXPECTED_CONTROLS[@]}" ]] || fail "control manifest is incomplete"
  else
    [[ "$count" == "${#EXPECTED_BOOTSTRAP[@]}" ]] || fail "bootstrap manifest is incomplete"
  fi
}

verify_installed_control_tree() {
  local root="$1" manifest="$root/control-assets.sha256" raw digest relative file actual count=0 entry basename
  local -A seen=()
  [[ -d "$root" && ! -L "$root" && "$(/usr/bin/stat -c '%u:%g:%a' -- "$root")" == "0:0:700" ]] || {
    fail "installed control root is unsafe"
  }
  assert_root_owned_regular "$manifest" 400 || fail "installed control manifest is unsafe"
  while IFS= read -r raw || [[ -n "$raw" ]]; do
    [[ "$raw" =~ ^([0-9a-f]{64})\ \ (deploy/[A-Za-z0-9._-]+)$ ]] || fail "installed control manifest is malformed"
    digest="${BASH_REMATCH[1]}"
    relative="${BASH_REMATCH[2]}"
    [[ -n "${EXPECTED_CONTROLS[$relative]+present}" && -z "${seen[$relative]+present}" ]] || {
      fail "installed control manifest contains an unexpected or duplicate path"
    }
    seen[$relative]=1
    file="$root/${relative#deploy/}"
    assert_root_owned_regular "$file" 400 || fail "installed control asset is unsafe: $relative"
    actual="$(checksum_file "$file")" || fail "unable to hash installed control asset"
    [[ "$actual" == "$digest" ]] || fail "installed control digest mismatch: $relative"
    count=$((count + 1))
  done <"$manifest"
  [[ "$count" == "${#EXPECTED_CONTROLS[@]}" ]] || fail "installed control manifest is incomplete"

  shopt -s nullglob dotglob
  local -a entries=("$root"/*)
  shopt -u nullglob dotglob
  [[ "${#entries[@]}" == "$(( ${#EXPECTED_CONTROLS[@]} + 1 ))" ]] || fail "installed control root has an unexpected entry"
  for entry in "${entries[@]}"; do
    basename="${entry##*/}"
    if [[ "$basename" == control-assets.sha256 ]]; then continue; fi
    [[ -n "${EXPECTED_CONTROLS[deploy/$basename]+present}" ]] || fail "installed control root has an unexpected asset"
  done
}

verify_recorded_control_tree() {
  local root="$1" expected_manifest_digest="$2" manifest="$root/control-assets.sha256"
  local raw digest relative file actual count=0 entry basename
  local -A seen=()
  [[ "$expected_manifest_digest" =~ ^[0-9a-f]{64}$ ]] || return 1
  [[ -d "$root" && ! -L "$root" && "$(/usr/bin/stat -c '%u:%g:%a' -- "$root")" == "0:0:700" ]] || return 1
  assert_root_owned_regular "$manifest" 400 || return 1
  [[ "$(checksum_file "$manifest")" == "$expected_manifest_digest" ]] || return 1
  while IFS= read -r raw || [[ -n "$raw" ]]; do
    [[ "$raw" =~ ^([0-9a-f]{64})\ \ (deploy/[A-Za-z0-9._-]+)$ ]] || return 1
    digest="${BASH_REMATCH[1]}"
    relative="${BASH_REMATCH[2]}"
    [[ -z "${seen[$relative]+present}" ]] || return 1
    seen[$relative]=1
    file="$root/${relative#deploy/}"
    assert_root_owned_regular "$file" 400 || return 1
    actual="$(checksum_file "$file")" || return 1
    [[ "$actual" == "$digest" ]] || return 1
    count=$((count + 1))
  done <"$manifest"
  (( count > 0 )) || return 1
  shopt -s nullglob dotglob
  local -a entries=("$root"/*)
  shopt -u nullglob dotglob
  [[ "${#entries[@]}" == "$(( count + 1 ))" ]] || return 1
  for entry in "${entries[@]}"; do
    basename="${entry##*/}"
    [[ "$basename" == control-assets.sha256 || -n "${seen[deploy/$basename]+present}" ]] || return 1
  done
}

read_immutable_host_role() {
  [[ -d "$CONFIG_ROOT" && ! -L "$CONFIG_ROOT" && "$(/usr/bin/stat -c '%u:%g:%a' -- "$CONFIG_ROOT")" == "0:0:700" ]] || {
    fail "immutable host role directory is unsafe"
  }
  assert_root_owned_regular "$HOST_ROLE_FILE" 400 || fail "immutable host role is missing or unsafe"
  local role extra
  IFS= read -r role <"$HOST_ROLE_FILE" || fail "immutable host role is unreadable"
  IFS= read -r extra < <(/usr/bin/tail -n +2 -- "$HOST_ROLE_FILE") || true
  [[ -z "$extra" && ( "$role" == test || "$role" == prod ) ]] || fail "immutable host role is invalid"
  [[ "$(/usr/bin/stat -c '%s' -- "$HOST_ROLE_FILE")" == "$(( ${#role} + 1 ))" ]] || fail "immutable host role is not canonical"
  printf '%s' "$role"
}

exchange_directories() {
  /usr/bin/python3 - "$1" "$2" <<'PY'
import ctypes
import os
import sys

libc = ctypes.CDLL(None, use_errno=True)
renameat2 = libc.renameat2
renameat2.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
renameat2.restype = ctypes.c_int
if renameat2(-100, os.fsencode(sys.argv[1]), -100, os.fsencode(sys.argv[2]), 2) != 0:
    error = ctypes.get_errno()
    raise OSError(error, os.strerror(error))
PY
}

declare -A UNIT_EXISTED=()
declare -A UNIT_ENABLED=()
declare -A UNIT_ACTIVE=()
declare -A UNIT_DIGEST=()
unit_backup_dir=""
refresh_deploy_units=false
refresh_backup_units=false
unit_refresh_started=false

snapshot_installed_units() {
  local unit path state deploy_count=0 backup_count=0 enable_link resolved_link
  assert_secure_source_ancestry "$SYSTEMD_DIR"
  for unit in "${DEPLOY_UNIT_NAMES[@]}"; do
    path="$SYSTEMD_DIR/$unit"
    UNIT_EXISTED[$unit]=false
    UNIT_ENABLED[$unit]=na
    UNIT_ACTIVE[$unit]=na
    UNIT_DIGEST[$unit]=absent
    if [[ -e "$path" || -L "$path" ]]; then
      assert_root_owned_regular "$path" 644 || fail "installed deployment unit is unsafe: $unit"
      UNIT_EXISTED[$unit]=true
      refresh_deploy_units=true
      deploy_count=$((deploy_count + 1))
    fi
  done
  for unit in "${BACKUP_UNIT_NAMES[@]}"; do
    path="$SYSTEMD_DIR/$unit"
    UNIT_EXISTED[$unit]=false
    UNIT_ENABLED[$unit]=na
    UNIT_ACTIVE[$unit]=na
    UNIT_DIGEST[$unit]=absent
    if [[ -e "$path" || -L "$path" ]]; then
      assert_root_owned_regular "$path" 644 || fail "installed backup unit is unsafe: $unit"
      UNIT_EXISTED[$unit]=true
      refresh_backup_units=true
      backup_count=$((backup_count + 1))
    fi
  done

  if [[ "$target_was_absent" == true ]]; then
    [[ "$refresh_deploy_units" == false && "$refresh_backup_units" == false ]] || {
      fail "initial bootstrap refuses pre-existing unauthenticated gshsapp systemd units"
    }
    return
  fi
  [[ "$deploy_count" == 0 || "$deploy_count" == "${#DEPLOY_UNIT_NAMES[@]}" ]] || {
    fail "installed deployment/firewall/recovery unit set is incomplete"
  }
  [[ "$backup_count" == 0 || "$backup_count" == "${#BACKUP_UNIT_NAMES[@]}" ]] || {
    fail "installed backup unit set is incomplete"
  }

  unit_backup_dir="$(/usr/bin/mktemp -d "$SYSTEMD_DIR/.gshsapp-control-units.XXXXXXXX")" || {
    fail "unable to create private unit rollback staging"
  }
  /usr/bin/chown root:root "$unit_backup_dir"
  /usr/bin/chmod 0700 "$unit_backup_dir"
  for unit in "${DEPLOY_UNIT_NAMES[@]}" "${BACKUP_UNIT_NAMES[@]}"; do
    if [[ "${UNIT_EXISTED[$unit]}" == true ]]; then
      /usr/bin/cp -p -- "$SYSTEMD_DIR/$unit" "$unit_backup_dir/$unit"
      assert_root_owned_regular "$unit_backup_dir/$unit" 644 || fail "unit rollback copy is unsafe: $unit"
      UNIT_DIGEST[$unit]="$(checksum_file "$unit_backup_dir/$unit")" || fail "unit rollback copy cannot be hashed: $unit"
      /usr/bin/sync "$unit_backup_dir/$unit"
    fi
  done
  for unit in "${ENABLED_UNIT_NAMES[@]}"; do
    if [[ "${UNIT_EXISTED[$unit]}" == true ]]; then
      state="$(/usr/bin/systemctl is-enabled "$unit" 2>/dev/null || true)"
      [[ "$state" == enabled || "$state" == disabled ]] || fail "unit has an unsupported enablement state: $unit"
      UNIT_ENABLED[$unit]="$state"
      enable_link="${UNIT_ENABLE_LINKS[$unit]}"
      if [[ "$state" == enabled ]]; then
        [[ -L "$enable_link" ]] || fail "enabled unit link is missing or unsafe: $unit"
        resolved_link="$(/usr/bin/readlink -f -- "$enable_link" 2>/dev/null || true)"
        [[ "$resolved_link" == "$SYSTEMD_DIR/$unit" ]] || fail "enabled unit link has an unsafe target: $unit"
      else
        [[ ! -e "$enable_link" && ! -L "$enable_link" ]] || fail "disabled unit retains an automatic start link: $unit"
      fi
    else
      UNIT_ENABLED[$unit]=absent
      enable_link="${UNIT_ENABLE_LINKS[$unit]}"
      [[ ! -e "$enable_link" && ! -L "$enable_link" ]] || fail "absent unit retains an automatic start link: $unit"
    fi
  done
  if [[ "$refresh_deploy_units" == true ]]; then
    for unit in "${IMMUTABLE_BOOT_ANCHOR_UNITS[@]}"; do
      [[ "${UNIT_ENABLED[$unit]}" == enabled ]] || fail "pre-Docker recovery anchor is disabled: $unit"
    done
  fi
  for unit in "${ACTIVE_TIMER_NAMES[@]}"; do
    if [[ "${UNIT_EXISTED[$unit]}" == true ]]; then
      state="$(/usr/bin/systemctl is-active "$unit" 2>/dev/null || true)"
      [[ "$state" == active || "$state" == inactive ]] || fail "timer has an unsupported active state: $unit"
      UNIT_ACTIVE[$unit]="$state"
    else
      UNIT_ACTIVE[$unit]=absent
    fi
  done
  verify_unit_snapshot || fail "unit rollback snapshot failed exact verification"
  /usr/bin/sync "$unit_backup_dir" "$SYSTEMD_DIR"
}

verify_unit_snapshot() {
  local unit entry basename expected_count=0
  local -A allowed=()
  [[ -d "$unit_backup_dir" && ! -L "$unit_backup_dir" &&
     "$(/usr/bin/stat -c '%u:%g:%a' -- "$unit_backup_dir")" == "0:0:700" ]] || return 1
  for unit in "${DEPLOY_UNIT_NAMES[@]}" "${BACKUP_UNIT_NAMES[@]}"; do
    allowed[$unit]=1
    if [[ "${UNIT_EXISTED[$unit]}" == true ]]; then
      expected_count=$((expected_count + 1))
      assert_root_owned_regular "$unit_backup_dir/$unit" 644 || return 1
      [[ "$(checksum_file "$unit_backup_dir/$unit")" == "${UNIT_DIGEST[$unit]}" ]] || return 1
    else
      [[ ! -e "$unit_backup_dir/$unit" && ! -L "$unit_backup_dir/$unit" ]] || return 1
    fi
  done
  shopt -s nullglob dotglob
  local -a entries=("$unit_backup_dir"/*)
  shopt -u nullglob dotglob
  [[ "${#entries[@]}" == "$expected_count" ]] || return 1
  for entry in "${entries[@]}"; do
    basename="${entry##*/}"
    [[ -n "${allowed[$basename]+present}" ]] || return 1
  done
}

sync_unit_enable_directories() {
  local directory
  local -a directories=("$SYSTEMD_DIR")
  for directory in \
    "$SYSTEMD_DIR/docker.service.requires" \
    "$SYSTEMD_DIR/docker.service.wants" \
    "$SYSTEMD_DIR/timers.target.wants"; do
    if [[ -e "$directory" || -L "$directory" ]]; then
      [[ -d "$directory" && ! -L "$directory" ]] || return 1
      directories+=("$directory")
    fi
  done
  /usr/bin/sync "${directories[@]}"
}

restore_unit_snapshot() {
  local restore_mode="${1:-live}" unit path temporary enable_link resolved_link
  [[ "$restore_mode" == live || "$restore_mode" == boot ]] || return 1
  [[ -n "$unit_backup_dir" ]] || return 1
  verify_unit_snapshot || return 1
  /usr/bin/systemctl stop gshsapp-backup.timer gshsapp-docker-user-firewall.timer \
    gshsapp-docker-user-firewall.service >/dev/null 2>&1 || true
  # Never remove the two RequiredBy=docker links while a durable phase exists.
  # Their stable targets are atomically replaced below, so every crash boundary
  # remains discoverable and quarantined on the next Docker activation.
  /usr/bin/systemctl disable "${MUTABLE_ENABLED_UNIT_NAMES[@]}" >/dev/null 2>&1 || true
  for unit in "${MUTABLE_ENABLED_UNIT_NAMES[@]}"; do
    enable_link="${UNIT_ENABLE_LINKS[$unit]}"
    if [[ -e "$enable_link" || -L "$enable_link" ]]; then
      [[ -L "$enable_link" ]] || return 1
      resolved_link="$(/usr/bin/readlink -f -- "$enable_link" 2>/dev/null || true)"
      [[ "$resolved_link" == "$SYSTEMD_DIR/$unit" ]] || return 1
      /usr/bin/rm -f -- "$enable_link" || return 1
    fi
  done
  sync_unit_enable_directories || return 1
  for unit in "${DEPLOY_UNIT_NAMES[@]}" "${BACKUP_UNIT_NAMES[@]}"; do
    path="$SYSTEMD_DIR/$unit"
    if [[ "${UNIT_EXISTED[$unit]}" == true ]]; then
      temporary="$(/usr/bin/mktemp "$SYSTEMD_DIR/.${unit}.restore.XXXXXXXX")" || return 1
      /usr/bin/cp -p -- "$unit_backup_dir/$unit" "$temporary" || { /usr/bin/rm -f -- "$temporary"; return 1; }
      /usr/bin/chown root:root "$temporary" || { /usr/bin/rm -f -- "$temporary"; return 1; }
      /usr/bin/chmod 0644 "$temporary" || { /usr/bin/rm -f -- "$temporary"; return 1; }
      assert_root_owned_regular "$temporary" 644 || { /usr/bin/rm -f -- "$temporary"; return 1; }
      [[ "$(checksum_file "$temporary")" == "${UNIT_DIGEST[$unit]}" ]] || { /usr/bin/rm -f -- "$temporary"; return 1; }
      /usr/bin/sync "$temporary" || { /usr/bin/rm -f -- "$temporary"; return 1; }
      /usr/bin/mv -fT -- "$temporary" "$path" || { /usr/bin/rm -f -- "$temporary"; return 1; }
      /usr/bin/sync "$SYSTEMD_DIR" || return 1
      assert_root_owned_regular "$path" 644 || return 1
      [[ "$(checksum_file "$path")" == "${UNIT_DIGEST[$unit]}" ]] || return 1
    else
      /usr/bin/rm -f -- "$path" || return 1
      /usr/bin/sync "$SYSTEMD_DIR" || return 1
    fi
  done
  /usr/bin/sync "$SYSTEMD_DIR" || return 1
  /usr/bin/systemctl daemon-reload || return 1
  for unit in "${MUTABLE_ENABLED_UNIT_NAMES[@]}"; do
    if [[ "${UNIT_ENABLED[$unit]}" == enabled ]]; then
      /usr/bin/systemctl enable "$unit" >/dev/null || return 1
    fi
  done
  if [[ "$refresh_deploy_units" == true ]]; then
    for unit in "${IMMUTABLE_BOOT_ANCHOR_UNITS[@]}"; do
      enable_link="${UNIT_ENABLE_LINKS[$unit]}"
      [[ -L "$enable_link" ]] || return 1
      resolved_link="$(/usr/bin/readlink -f -- "$enable_link" 2>/dev/null || true)"
      [[ "$resolved_link" == "$SYSTEMD_DIR/$unit" ]] || return 1
      /usr/bin/systemctl is-enabled --quiet "$unit" || return 1
    done
  fi
  sync_unit_enable_directories || return 1
  for unit in "${ACTIVE_TIMER_NAMES[@]}"; do
    if [[ "$restore_mode" == boot && "$unit" == gshsapp-docker-user-firewall.timer ]]; then
      # This recovery runs in the pre-Docker quarantine ExecStartPre. Starting
      # a timer with Requires/After=docker here would deadlock docker.service.
      # Its restored enable link makes Docker start it after this unit exits;
      # the exact post-Docker firewall service then verifies it is active.
      continue
    fi
    if [[ "${UNIT_ACTIVE[$unit]}" == active ]]; then
      /usr/bin/systemctl start "$unit" >/dev/null || return 1
      /usr/bin/systemctl is-active --quiet "$unit" || return 1
    else
      /usr/bin/systemctl stop "$unit" >/dev/null 2>&1 || true
      /usr/bin/systemctl is-active --quiet "$unit" && return 1
    fi
  done
  if [[ "$restore_mode" == live ]]; then
    if [[ "$refresh_deploy_units" == true ]]; then
      LIFECYCLE_LOCK_HELD=1 /bin/bash "$CONTROL_ROOT/docker-user-firewall.sh" --enforce || return 1
      LIFECYCLE_LOCK_HELD=1 /bin/bash "$CONTROL_ROOT/install-deploy-service.sh" --verify-unit || return 1
    fi
    if [[ "$refresh_backup_units" == true ]]; then
      LIFECYCLE_LOCK_HELD=1 /bin/bash "$CONTROL_ROOT/install-backup-timer.sh" --verify-unit || return 1
    fi
  fi
  /usr/bin/sync "$SYSTEMD_DIR" || return 1
}

phase_state=""
phase_old_manifest_digest=""
phase_new_manifest_digest=""
phase_control_stage=""

ensure_update_state_root() {
  assert_secure_source_ancestry /var/lib
  if [[ -e "$UPDATE_STATE_ROOT" || -L "$UPDATE_STATE_ROOT" ]]; then
    [[ -d "$UPDATE_STATE_ROOT" && ! -L "$UPDATE_STATE_ROOT" &&
       "$(/usr/bin/stat -c '%u:%g:%a' -- "$UPDATE_STATE_ROOT")" == "0:0:700" ]] || {
      fail "control update state directory is unsafe"
    }
  else
    /usr/bin/install -d -o root -g root -m 0700 "$UPDATE_STATE_ROOT"
    /usr/bin/sync "$UPDATE_STATE_ROOT" /var/lib
  fi
}

write_update_phase() {
  local state="$1" temporary unit record
  local -a records=()
  [[ "$state" == prepared || "$state" == committed ]] || fail "control update phase state is invalid"
  [[ "$phase_old_manifest_digest" =~ ^[0-9a-f]{64}$ && "$phase_new_manifest_digest" =~ ^[0-9a-f]{64}$ ]] || {
    fail "control update phase digest is invalid"
  }
  [[ "$phase_control_stage" == "$CONTROL_PARENT"/.gshsapp-operations.* &&
     "$unit_backup_dir" == "$SYSTEMD_DIR"/.gshsapp-control-units.* ]] || {
    fail "control update phase staging path is invalid"
  }
  ensure_update_state_root
  for unit in "${DEPLOY_UNIT_NAMES[@]}" "${BACKUP_UNIT_NAMES[@]}"; do
    record="$unit|${UNIT_EXISTED[$unit]}|${UNIT_ENABLED[$unit]}|${UNIT_ACTIVE[$unit]}|${UNIT_DIGEST[$unit]}"
    records+=("$record")
  done
  temporary="$(/usr/bin/mktemp "$UPDATE_STATE_ROOT/.control-update.XXXXXXXX")" || fail "unable to stage durable control update phase"
  /usr/bin/python3 - "$state" "$phase_old_manifest_digest" "$phase_new_manifest_digest" \
    "$phase_control_stage" "$unit_backup_dir" "${records[@]}" >"$temporary" <<'PY'
import json
import sys

state, old_digest, new_digest, control_stage, unit_backup, *records = sys.argv[1:]
units = {}
for record in records:
    name, existed, enabled, active, digest = record.split("|")
    units[name] = {
        "active": active,
        "digest": digest,
        "enabled": enabled,
        "existed": existed == "true",
    }
value = {
    "controlStage": control_stage,
    "format": "gshsapp-control-update",
    "newControlManifestSha256": new_digest,
    "oldControlManifestSha256": old_digest,
    "state": state,
    "unitBackupDir": unit_backup,
    "units": units,
    "version": 1,
}
sys.stdout.write(json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n")
PY
  /usr/bin/chown root:root "$temporary"
  /usr/bin/chmod 0400 "$temporary"
  [[ "$(/usr/bin/stat -c '%u:%g:%a:%h' -- "$temporary")" == "0:0:400:1" ]] || {
    /usr/bin/rm -f -- "$temporary"
    fail "durable control update phase could not be secured"
  }
  /usr/bin/sync "$temporary"
  /usr/bin/mv -T -- "$temporary" "$UPDATE_PHASE_FILE"
  /usr/bin/sync "$UPDATE_PHASE_FILE" "$UPDATE_STATE_ROOT"
  phase_state="$state"
}

read_update_phase() {
  local output line unit parsed_unit existed enabled active digest index=5
  local -a lines=()
  ensure_update_state_root
  assert_root_owned_regular "$UPDATE_PHASE_FILE" 400 || fail "durable control update phase is unsafe"
  output="$(/usr/bin/python3 - "$UPDATE_PHASE_FILE" <<'PY'
import json
import os
import pathlib
import re
import stat
import sys

path = pathlib.Path(sys.argv[1])
raw = path.read_bytes()
if len(raw) > 8192 or not raw.endswith(b"\n") or b"\r" in raw or b"\0" in raw:
    raise SystemExit(1)
try:
    value = json.loads(raw.decode("ascii", "strict"))
except (UnicodeDecodeError, json.JSONDecodeError):
    raise SystemExit(1)
unit_names = (
    "gshsapp-deploy.service",
    "gshsapp-control-update-recovery.service",
    "gshsapp-docker-boot-quarantine.service",
    "gshsapp-writer-recovery.service",
    "gshsapp-docker-user-firewall.service",
    "gshsapp-docker-user-firewall.timer",
    "gshsapp-backup.service",
    "gshsapp-backup.timer",
)
if set(value) != {
    "controlStage", "format", "newControlManifestSha256", "oldControlManifestSha256",
    "state", "unitBackupDir", "units", "version",
}:
    raise SystemExit(1)
if value["format"] != "gshsapp-control-update" or value["version"] != 1:
    raise SystemExit(1)
if value["state"] not in {"prepared", "committed"}:
    raise SystemExit(1)
if not all(isinstance(value[key], str) and re.fullmatch(r"[0-9a-f]{64}", value[key])
           for key in ("oldControlManifestSha256", "newControlManifestSha256")):
    raise SystemExit(1)
if re.fullmatch(r"/usr/local/lib/\.gshsapp-operations\.[A-Za-z0-9]{8}", value["controlStage"]) is None:
    raise SystemExit(1)
if re.fullmatch(r"/etc/systemd/system/\.gshsapp-control-units\.[A-Za-z0-9]{8}", value["unitBackupDir"]) is None:
    raise SystemExit(1)
units = value["units"]
if not isinstance(units, dict) or set(units) != set(unit_names):
    raise SystemExit(1)
enable_units = {
    "gshsapp-control-update-recovery.service", "gshsapp-docker-boot-quarantine.service",
    "gshsapp-writer-recovery.service",
    "gshsapp-docker-user-firewall.service", "gshsapp-docker-user-firewall.timer",
    "gshsapp-backup.timer",
}
anchor_units = {
    "gshsapp-control-update-recovery.service",
    "gshsapp-docker-boot-quarantine.service",
}
active_units = {"gshsapp-docker-user-firewall.timer", "gshsapp-backup.timer"}
for name in unit_names:
    item = units[name]
    if not isinstance(item, dict) or set(item) != {"active", "digest", "enabled", "existed"}:
        raise SystemExit(1)
    if type(item["existed"]) is not bool:
        raise SystemExit(1)
    expected_enabled = (
        {"enabled"}
        if item["existed"] and name in anchor_units
        else ({"enabled", "disabled"} if item["existed"] and name in enable_units else ({"na"} if name not in enable_units else {"absent"}))
    )
    expected_active = {"active", "inactive"} if item["existed"] and name in active_units else ({"na"} if name not in active_units else {"absent"})
    if item["enabled"] not in expected_enabled or item["active"] not in expected_active:
        raise SystemExit(1)
    expected_digest = r"[0-9a-f]{64}" if item["existed"] else r"absent"
    if not isinstance(item["digest"], str) or re.fullmatch(expected_digest, item["digest"]) is None:
        raise SystemExit(1)
canonical = (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode("ascii")
if raw != canonical:
    raise SystemExit(1)
print(value["state"])
print(value["oldControlManifestSha256"])
print(value["newControlManifestSha256"])
print(value["controlStage"])
print(value["unitBackupDir"])
for name in unit_names:
    item = units[name]
    print(f'{name}|{str(item["existed"]).lower()}|{item["enabled"]}|{item["active"]}|{item["digest"]}')
PY
)" || fail "durable control update phase is malformed"
  [[ "${#output}" -le 8191 ]] || fail "durable control update phase output is too large"
  mapfile -t lines <<<"$output"
  [[ "${#lines[@]}" == 13 ]] || fail "durable control update phase output is incomplete"
  phase_state="${lines[0]}"
  phase_old_manifest_digest="${lines[1]}"
  phase_new_manifest_digest="${lines[2]}"
  phase_control_stage="${lines[3]}"
  unit_backup_dir="${lines[4]}"
  refresh_deploy_units=false
  refresh_backup_units=false
  for unit in "${DEPLOY_UNIT_NAMES[@]}" "${BACKUP_UNIT_NAMES[@]}"; do
    line="${lines[$index]}"
    IFS='|' read -r parsed_unit existed enabled active digest <<<"$line"
    [[ "$parsed_unit" == "$unit" ]] || fail "durable control update phase unit order is invalid"
    UNIT_EXISTED[$unit]="$existed"
    UNIT_ENABLED[$unit]="$enabled"
    UNIT_ACTIVE[$unit]="$active"
    UNIT_DIGEST[$unit]="$digest"
    [[ "$existed" != true || "$unit" != gshsapp-deploy.service ]] || refresh_deploy_units=true
    [[ "$existed" != true || "$unit" != gshsapp-backup.service ]] || refresh_backup_units=true
    index=$((index + 1))
  done
}

remove_update_phase() {
  assert_root_owned_regular "$UPDATE_PHASE_FILE" 400 || return 1
  /usr/bin/rm -f -- "$UPDATE_PHASE_FILE" || return 1
  /usr/bin/sync "$UPDATE_STATE_ROOT" || return 1
}

remove_recorded_update_staging() {
  [[ "$phase_control_stage" == "$CONTROL_PARENT"/.gshsapp-operations.* ]] || return 1
  [[ "$unit_backup_dir" == "$SYSTEMD_DIR"/.gshsapp-control-units.* ]] || return 1
  if [[ -e "$phase_control_stage" || -L "$phase_control_stage" ]]; then
    [[ -d "$phase_control_stage" && ! -L "$phase_control_stage" &&
       "$(/usr/bin/stat -c '%u:%g:%a' -- "$phase_control_stage")" == "0:0:700" ]] || return 1
    /usr/bin/rm -rf -- "$phase_control_stage" || return 1
  fi
  if [[ -e "$unit_backup_dir" || -L "$unit_backup_dir" ]]; then
    [[ -d "$unit_backup_dir" && ! -L "$unit_backup_dir" &&
       "$(/usr/bin/stat -c '%u:%g:%a' -- "$unit_backup_dir")" == "0:0:700" ]] || return 1
    /usr/bin/rm -rf -- "$unit_backup_dir" || return 1
  fi
  /usr/bin/sync "$CONTROL_PARENT" "$SYSTEMD_DIR" || return 1
}

recover_pending_update() {
  local restore_mode="${1:-boot}" current_manifest_digest current_script_digest expected_script_digest
  [[ "$restore_mode" == boot || "$restore_mode" == live ]] || fail "control update recovery mode is invalid"
  [[ -e "$UPDATE_PHASE_FILE" || -L "$UPDATE_PHASE_FILE" ]] || return 0
  read_update_phase
  assert_root_owned_regular "$CONTROL_ROOT/install-root-operations.sh" 400 || {
    fail "installed recovery control is unsafe during update recovery"
  }
  current_script_digest="$(checksum_file "$CONTROL_ROOT/install-root-operations.sh")" || {
    fail "installed recovery control cannot be hashed"
  }
  expected_script_digest="$(/usr/bin/sed -nE 's/^([0-9a-f]{64})  deploy\/install-root-operations\.sh$/\1/p' "$CONTROL_ROOT/control-assets.sha256")"
  [[ "$expected_script_digest" =~ ^[0-9a-f]{64}$ && "$current_script_digest" == "$expected_script_digest" ]] || {
    fail "installed recovery control does not match its current manifest"
  }
  current_manifest_digest="$(checksum_file "$CONTROL_ROOT/control-assets.sha256")" || {
    fail "current control manifest is unreadable during update recovery"
  }
  if [[ "$phase_state" == committed ]]; then
    [[ "$current_manifest_digest" == "$phase_new_manifest_digest" ]] || {
      fail "committed control update does not match the installed control tree"
    }
    verify_recorded_control_tree "$CONTROL_ROOT" "$phase_new_manifest_digest" || {
      fail "committed control update tree failed exact verification"
    }
    remove_recorded_update_staging || fail "committed control update staging could not be removed"
    remove_update_phase || fail "committed control update phase could not be finalized"
    return 0
  fi

  [[ -d "$unit_backup_dir" && ! -L "$unit_backup_dir" &&
     "$(/usr/bin/stat -c '%u:%g:%a' -- "$unit_backup_dir")" == "0:0:700" ]] || {
    fail "prepared control update unit snapshot is unsafe"
  }
  if [[ "$current_manifest_digest" == "$phase_new_manifest_digest" ]]; then
    verify_recorded_control_tree "$CONTROL_ROOT" "$phase_new_manifest_digest" || {
      fail "new control tree failed exact recovery verification"
    }
    verify_recorded_control_tree "$phase_control_stage" "$phase_old_manifest_digest" || {
      fail "old control rollback tree failed exact recovery verification"
    }
    exchange_directories "$phase_control_stage" "$CONTROL_ROOT" || fail "durable control rollback exchange failed"
    /usr/bin/sync "$CONTROL_PARENT"
    verify_recorded_control_tree "$CONTROL_ROOT" "$phase_old_manifest_digest" || {
      fail "restored old control tree failed exact recovery verification"
    }
  elif [[ "$current_manifest_digest" == "$phase_old_manifest_digest" ]]; then
    verify_recorded_control_tree "$CONTROL_ROOT" "$phase_old_manifest_digest" || {
      fail "existing old control tree failed exact recovery verification"
    }
    verify_recorded_control_tree "$phase_control_stage" "$phase_new_manifest_digest" || {
      fail "unpublished new control tree failed exact recovery verification"
    }
  else
    fail "installed control tree matches neither side of the durable update phase"
  fi
  restore_unit_snapshot "$restore_mode" || fail "durable systemd unit rollback failed"
  remove_recorded_update_staging || fail "rolled-back control update staging could not be removed"
  remove_update_phase || fail "rolled-back control update phase could not be removed"
}

current_script="$(/usr/bin/readlink -f -- "${BASH_SOURCE[0]}")" || fail "installer path cannot be resolved"
[[ "$(/usr/bin/id -u)" == 0 ]] || fail "a trusted root console is required"
assert_secure_source_ancestry "$CONTROL_PARENT"

if [[ "${1:-}" == --verify-installed ]]; then
  [[ "$#" == 1 ]] || fail "--verify-installed takes no other arguments"
  [[ "$current_script" == "$CONTROL_ROOT/install-root-operations.sh" ]] || fail "verification must use the installed control"
  verify_installed_control_tree "$CONTROL_ROOT"
  read_immutable_host_role >/dev/null
  exit 0
fi

recover_only=false
if [[ "${1:-}" == --recover-update ]]; then
  [[ "$#" == 1 ]] || fail "--recover-update takes no other arguments"
  [[ "$current_script" == "$CONTROL_ROOT/install-root-operations.sh" ]] || fail "update recovery must use the installed control"
  recover_only=true
else
  [[ "$#" == 3 ]] || fail "usage: install-root-operations.sh VERIFIED_SOURCE_ROOT EXPECTED_BOOTSTRAP_MANIFEST_SHA256 test|prod"
  source_root="$1"
  expected_bootstrap_digest="$2"
  requested_role="$3"
  [[ "$expected_bootstrap_digest" =~ ^[0-9a-f]{64}$ ]] || fail "expected out-of-band bootstrap manifest digest is malformed"
  [[ "$requested_role" == test || "$requested_role" == prod ]] || fail "host role must be exactly test or prod"
  [[ -d "$source_root" && ! -L "$source_root" ]] || fail "verified source root is unsafe"
  source_root="$(cd "$source_root" && pwd -P)" || fail "verified source root cannot be resolved"
  [[ "$source_root" != / ]] || fail "filesystem root cannot be used as a source bundle"
  assert_secure_source_ancestry "$source_root"
fi

if [[ -e "$LOCK_ROOT" || -L "$LOCK_ROOT" ]]; then
  [[ -d "$LOCK_ROOT" && ! -L "$LOCK_ROOT" && "$(/usr/bin/stat -c '%u:%g:%a' -- "$LOCK_ROOT")" == "0:0:700" ]] || {
    fail "shared lifecycle lock directory is unsafe"
  }
else
  /usr/bin/install -d -o root -g root -m 0700 "$LOCK_ROOT"
  /usr/bin/sync "$LOCK_ROOT" /run/lock
fi
if [[ -e "$LOCK_FILE" || -L "$LOCK_FILE" ]]; then
  assert_root_owned_regular "$LOCK_FILE" 600 || fail "shared lifecycle lock file is unsafe"
fi
exec 9>"$LOCK_FILE"
/usr/bin/chown root:root "$LOCK_FILE"
/usr/bin/chmod 0600 "$LOCK_FILE"
assert_root_owned_regular "$LOCK_FILE" 600 || fail "shared lifecycle lock file could not be secured"
if [[ "$recover_only" == true ]]; then
  /usr/bin/flock -w "$BOOT_RECOVERY_LOCK_WAIT_SECONDS" 9 || {
    fail "another lifecycle operation did not finish before the boot recovery deadline"
  }
else
  /usr/bin/flock -n 9 || fail "deployment, backup, restore, import, or another control installation is active"
fi

if [[ "$recover_only" == true ]]; then
  if [[ -e "$UPDATE_PHASE_FILE" || -L "$UPDATE_PHASE_FILE" ]]; then
    recover_pending_update boot
  else
    verify_installed_control_tree "$CONTROL_ROOT"
    read_immutable_host_role >/dev/null
  fi
  exit 0
fi

proof_required=false
if [[ -e "$CONTROL_ROOT" || -L "$CONTROL_ROOT" ]]; then
  [[ "$current_script" == "$CONTROL_ROOT/install-root-operations.sh" ]] || fail "updates must run through the already installed authenticated installer"
  if [[ -e "$UPDATE_PHASE_FILE" || -L "$UPDATE_PHASE_FILE" ]]; then
    recover_pending_update live
    fail "a pending control update was safely rolled back; rerun the verified update command"
  fi
  verify_installed_control_tree "$CONTROL_ROOT"
  [[ "$(read_immutable_host_role)" == "$requested_role" ]] || fail "an installed host role cannot be changed"
  LIFECYCLE_LOCK_HELD=1 DEPLOY_ROOT="$DEPLOY_ROOT" PHASE_FILE="$DEPLOY_ROOT/backup-phase.json" \
    /bin/bash "$CONTROL_ROOT/recover-backup-writer.sh" || fail "pending backup writer recovery failed"
  LIFECYCLE_LOCK_HELD=1 DEPLOY_ROOT="$DEPLOY_ROOT" PHASE_FILE="$DEPLOY_ROOT/deployment-phase.json" \
    /bin/bash "$CONTROL_ROOT/recover-deployment-writer.sh" || fail "pending deployment recovery failed"
else
  proof_prefix='gshsapp-root-bootstrap-v1 '
  [[ "$current_script" == "$source_root/deploy/install-root-operations.sh" ]] || fail "initial bootstrap must execute the verified bundle installer"
  assert_root_owned_regular "$BOOTSTRAP_PROOF" 400 || fail "initial bootstrap requires the one-time OS verification proof"
  [[ "$(<"$BOOTSTRAP_PROOF")" == "$proof_prefix$expected_bootstrap_digest" ]] || fail "initial bootstrap proof does not match the out-of-band digest"
  [[ "$(/usr/bin/stat -c '%s' -- "$BOOTSTRAP_PROOF")" == "$(( ${#proof_prefix} + ${#expected_bootstrap_digest} + 1 ))" ]] || {
    fail "initial bootstrap proof is not canonical"
  }
  proof_required=true
  cleanup_bootstrap_proof() {
    local status=$?
    trap - EXIT INT TERM
    /usr/bin/rm -f -- "$BOOTSTRAP_PROOF"
    /usr/bin/sync /run || true
    exit "$status"
  }
  trap cleanup_bootstrap_proof EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
fi

bootstrap_manifest="$source_root/$BOOTSTRAP_MANIFEST_RELATIVE"
assert_root_owned_source_file "$bootstrap_manifest"
[[ "$(checksum_file "$bootstrap_manifest")" == "$expected_bootstrap_digest" ]] || fail "bootstrap manifest does not match the independently supplied digest"
verify_manifest_source "$source_root" "$BOOTSTRAP_MANIFEST_RELATIVE" bootstrap
verify_manifest_source "$source_root" "$CONTROL_MANIFEST_RELATIVE" control
/usr/bin/python3 "$source_root/deploy/validate-operations-config.py" assert-lifecycle-quiescent "$DEPLOY_ROOT" || {
  fail "pending lifecycle state must be resolved before control update"
}
# The pre-Docker recovery sandbox names this exact state path in
# ReadWritePaths. Provision it on initial bootstrap before that unit can be
# published, otherwise systemd would fail namespace setup before ExecStart.
ensure_update_state_root

stage=""
published=false
role_created=false
target_was_absent=false
cleanup() {
  local status=$? rollback_ok=true
  trap - EXIT INT TERM
  if [[ "$status" -ne 0 && "$target_was_absent" == false &&
        ( -e "$UPDATE_PHASE_FILE" || -L "$UPDATE_PHASE_FILE" ) ]]; then
    if (recover_pending_update live); then
      published=false
      unit_refresh_started=false
    else
      rollback_ok=false
    fi
  elif [[ "$status" -ne 0 && "$published" == true && "$target_was_absent" == true &&
          -n "$stage" && -d "$CONTROL_ROOT" && ! -L "$CONTROL_ROOT" ]]; then
    if [[ "$target_was_absent" == true ]]; then
      /usr/bin/mv -T -- "$CONTROL_ROOT" "$stage" || rollback_ok=false
    fi
    /usr/bin/sync "$CONTROL_PARENT" || rollback_ok=false
  fi
  if [[ "$status" -ne 0 && "$unit_refresh_started" == true && "$target_was_absent" == true ]]; then
    if [[ "$rollback_ok" == true ]]; then
      restore_unit_snapshot || rollback_ok=false
    else
      rollback_ok=false
    fi
  fi
  if [[ "$status" -ne 0 && "$role_created" == true ]]; then
    /usr/bin/rm -f -- "$HOST_ROLE_FILE" || rollback_ok=false
    /usr/bin/sync "$CONFIG_ROOT" || rollback_ok=false
  fi
  if [[ "$rollback_ok" == true && -n "$stage" && "$stage" == "$CONTROL_PARENT"/.gshsapp-operations.* && -d "$stage" && ! -L "$stage" ]]; then
    /usr/bin/rm -rf -- "$stage"
  fi
  if [[ "$rollback_ok" == true && -n "$unit_backup_dir" && "$unit_backup_dir" == "$SYSTEMD_DIR"/.gshsapp-control-units.* && -d "$unit_backup_dir" && ! -L "$unit_backup_dir" ]]; then
    /usr/bin/rm -rf -- "$unit_backup_dir"
    /usr/bin/sync "$SYSTEMD_DIR" || rollback_ok=false
  fi
  if [[ "$proof_required" == true ]]; then
    /usr/bin/rm -f -- "$BOOTSTRAP_PROOF" || rollback_ok=false
    /usr/bin/sync /run || rollback_ok=false
  fi
  if [[ "$rollback_ok" != true ]]; then
    printf '%s\n' "CRITICAL: root control rollback could not restore the previous authenticated state." >&2
    [[ -z "$stage" ]] || printf '%s\n' "Preserved private recovery staging path: $stage" >&2
    [[ -z "$unit_backup_dir" ]] || printf '%s\n' "Preserved private unit recovery staging path: $unit_backup_dir" >&2
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

stage="$(/usr/bin/mktemp -d "$CONTROL_PARENT/.gshsapp-operations.XXXXXXXX")" || fail "unable to create private control staging"
/usr/bin/chown root:root "$stage"
/usr/bin/chmod 0700 "$stage"
while IFS= read -r raw || [[ -n "$raw" ]]; do
  [[ "$raw" =~ ^([0-9a-f]{64})\ \ (deploy/[A-Za-z0-9._-]+)$ ]] || fail "control manifest changed during installation"
  relative="${BASH_REMATCH[2]}"
  /usr/bin/install -o root -g root -m 0400 -- "$source_root/$relative" "$stage/${relative#deploy/}"
  /usr/bin/sync "$stage/${relative#deploy/}"
done <"$source_root/$CONTROL_MANIFEST_RELATIVE"
/usr/bin/install -o root -g root -m 0400 -- "$source_root/$CONTROL_MANIFEST_RELATIVE" "$stage/control-assets.sha256"
/usr/bin/sync "$stage/control-assets.sha256"
/usr/bin/sync "$stage"
verify_installed_control_tree "$stage"

for directory in "$CONFIG_ROOT" "$DEPLOY_ROOT" "$DEPLOY_ROOT/data" "$DEPLOY_ROOT/backup" "$DEPLOY_ROOT/root-backup" /run/lock/gshsapp; do
  if [[ -e "$directory" || -L "$directory" ]]; then
    [[ -d "$directory" && ! -L "$directory" ]] || fail "refusing an unsafe operations directory: $directory"
  fi
done

# On a fresh host, commit the immutable role before the first control-root
# publication. A power loss can then only leave role-without-controls, which is
# safely retryable through the same OOB-verified source installer. Publishing
# controls first would strand the host because updates must run installed code.
/usr/bin/install -d -o root -g root -m 0700 "$CONFIG_ROOT"
if [[ -e "$HOST_ROLE_FILE" || -L "$HOST_ROLE_FILE" ]]; then
  [[ "$(read_immutable_host_role)" == "$requested_role" ]] || fail "an installed host role cannot be changed"
else
  role_temp="$(/usr/bin/mktemp "$CONFIG_ROOT/.host-role.XXXXXXXX")" || fail "unable to stage immutable host role"
  printf '%s\n' "$requested_role" >"$role_temp"
  /usr/bin/chown root:root "$role_temp"
  /usr/bin/chmod 0400 "$role_temp"
  /usr/bin/sync "$role_temp"
  /usr/bin/mv -T -- "$role_temp" "$HOST_ROLE_FILE"
  role_created=true
  /usr/bin/sync "$HOST_ROLE_FILE"
  /usr/bin/sync "$CONFIG_ROOT"
fi

if [[ -e "$CONTROL_ROOT" || -L "$CONTROL_ROOT" ]]; then
  target_was_absent=false
else
  target_was_absent=true
fi
snapshot_installed_units
if [[ "$target_was_absent" == false ]]; then
  phase_old_manifest_digest="$(checksum_file "$CONTROL_ROOT/control-assets.sha256")" || fail "unable to hash old control manifest"
  phase_new_manifest_digest="$(checksum_file "$stage/control-assets.sha256")" || fail "unable to hash new control manifest"
  phase_control_stage="$stage"
  write_update_phase prepared
fi

approval="$DEPLOY_ROOT/approved-release.json"
if [[ -e "$approval" || -L "$approval" ]]; then
  [[ ! -d "$approval" ]] || fail "release approval path is unsafe"
  /usr/bin/rm -f -- "$approval"
  /usr/bin/sync "$DEPLOY_ROOT"
fi

if [[ "$target_was_absent" == true ]]; then
  /usr/bin/mv -T -- "$stage" "$CONTROL_ROOT" || fail "atomic initial control publication failed"
else
  exchange_directories "$stage" "$CONTROL_ROOT" || fail "atomic control directory exchange failed"
fi
published=true
/usr/bin/sync "$CONTROL_PARENT"
verify_installed_control_tree "$CONTROL_ROOT"

if [[ "$refresh_deploy_units" == true || "$refresh_backup_units" == true ]]; then
  unit_refresh_started=true
fi
if [[ "$refresh_deploy_units" == true ]]; then
  LIFECYCLE_LOCK_HELD=1 /bin/bash "$CONTROL_ROOT/install-deploy-service.sh" --refresh-units || {
    fail "authenticated deployment, firewall, and boot recovery units could not be refreshed"
  }
fi
if [[ "$refresh_backup_units" == true ]]; then
  LIFECYCLE_LOCK_HELD=1 /bin/bash "$CONTROL_ROOT/install-backup-timer.sh" --refresh-units || {
    fail "authenticated backup units could not be refreshed"
  }
fi

/usr/bin/install -d -o root -g root -m 0755 "$DEPLOY_ROOT"
/usr/bin/install -d -o 61001 -g 61001 -m 0700 "$DEPLOY_ROOT/data" "$DEPLOY_ROOT/backup"
/usr/bin/install -d -o root -g root -m 0700 "$DEPLOY_ROOT/root-backup"
/usr/bin/install -d -o root -g root -m 0700 "$LOCK_ROOT"
/usr/bin/sync "$DEPLOY_ROOT" "$CONFIG_ROOT" "$LOCK_ROOT" "$UPDATE_STATE_ROOT" /var/lib

if [[ "$target_was_absent" == false ]]; then
  write_update_phase committed
  remove_recorded_update_staging || fail "committed control update staging could not be removed"
  remove_update_phase || fail "committed control update phase could not be removed"
  stage=""
  unit_backup_dir=""
elif [[ -n "$unit_backup_dir" ]]; then
  [[ "$unit_backup_dir" == "$SYSTEMD_DIR"/.gshsapp-control-units.* && -d "$unit_backup_dir" && ! -L "$unit_backup_dir" ]] || {
    fail "unit rollback staging path changed unexpectedly"
  }
  /usr/bin/rm -rf -- "$unit_backup_dir"
  unit_backup_dir=""
  /usr/bin/sync "$SYSTEMD_DIR"
fi
unit_refresh_started=false
published=false
if [[ -n "$stage" ]]; then
  /usr/bin/rm -rf -- "$stage"
  stage=""
fi
/usr/bin/sync "$CONTROL_PARENT"
printf '%s\n' "Root-only control assets installed for immutable host role: $requested_role"
