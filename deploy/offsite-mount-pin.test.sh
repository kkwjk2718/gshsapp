#!/usr/bin/env bash
set -Eeuo pipefail
trap 'printf "offsite mount pin test failed at line %s\n" "$LINENO" >&2' ERR

SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HELPER="$SCRIPT_ROOT/pin-offsite-operation.sh"
VALIDATOR="$SCRIPT_ROOT/validate-operations-config.py"

[[ -f "$HELPER" ]]
HELPER_SOURCE="$(<"$HELPER")"
[[ "$(sed -n '2p' "$HELPER")" == 'set +x' ]]
[[ "$HELPER_SOURCE" == *'[[ "$#" == 1 ]]'* ]]
[[ "$HELPER_SOURCE" == *'  import)'* ]]
[[ "$HELPER_SOURCE" == *'  restore)'* ]]
[[ "$HELPER_SOURCE" == *'  offsite)'* ]]
[[ "$HELPER_SOURCE" == *'/usr/bin/unshare --mount --propagation private'* ]]
[[ "$HELPER_SOURCE" == *'/usr/bin/mount --bind -- "$offsite_dir" "$offsite_dir"'* ]]
[[ "$HELPER_SOURCE" == *'--verify-pinned-offsite'* ]]
[[ "$HELPER_SOURCE" == *'--print-manual-operation-policy'* ]]
[[ "$HELPER_SOURCE" == *'export OFFSITE_DIR OFFSITE_MOUNT_SOURCE OFFSITE_FSTYPE OFFSITE_REQUIRED_OPTIONS'* ]]
[[ "$HELPER_SOURCE" == *'builtin readarray -t exported_names < <(builtin compgen -e)'* ]]
[[ "$HELPER_SOURCE" == *'builtin unset -- "$exported_name"'* ]]
[[ "$HELPER_SOURCE" == *'ambient environment could not be reduced to the fixed allowlist'* ]]
[[ "$HELPER_SOURCE" == *'builtin readarray -t inherited_functions < <(builtin compgen -A function)'* ]]
[[ "$HELPER_SOURCE" == *'DEPLOY_ROOT=/opt/gshsapp'* ]]
[[ "$HELPER_SOURCE" == *'CONTROL_ROOT=/usr/local/lib/gshsapp-operations'* ]]
[[ "$HELPER_SOURCE" == *'BACKUP_DIR=/opt/gshsapp/root-backup'* ]]
[[ "$HELPER_SOURCE" == *'PYTHON_BIN=/usr/bin/python3'* ]]
[[ "$HELPER_SOURCE" == *'TIMEOUT_BIN=/usr/bin/timeout'* ]]
[[ "$HELPER_SOURCE" != *'DEPLOY_ROOT=${DEPLOY_ROOT'* ]]
[[ "$HELPER_SOURCE" != *'bash -c'* ]]

xtrace_sentinel='gshsapp-xtrace-secret-must-not-leak'
xtrace_output="$(/usr/bin/env -u BASH_ENV -u ENV SHELLOPTS=xtrace \
  E2E_ADMIN_PASSWORD="$xtrace_sentinel" /bin/bash "$HELPER" restore 2>&1 || :)"
[[ "$xtrace_output" != *"$xtrace_sentinel"* ]]

sanitize_definition="$(awk '/^sanitize_environment\(\) \{/{copy=1} copy{print} copy && /^}/{exit}' "$HELPER")"
[[ -n "$sanitize_definition" ]]
(
  fail() { return 1; }
  eval "$sanitize_definition"
  export DEPLOY_ROOT=/attacker CONTROL_ROOT=/tmp/controls BACKUP_DIR=/tmp/backup
  export PYTHON_BIN=/tmp/python TIMEOUT_BIN=/tmp/timeout LIFECYCLE_LOCK_FILE=/tmp/lock
  export BASH_ENV=/tmp/profile ENV=/tmp/profile RESTORE_DRILL_OUTPUT_FILE=/etc/shadow
  sanitize_environment
  [[ "$DEPLOY_ROOT" == /opt/gshsapp ]]
  [[ "$CONTROL_ROOT" == /usr/local/lib/gshsapp-operations ]]
  [[ "$BACKUP_DIR" == /opt/gshsapp/root-backup ]]
  [[ "$PYTHON_BIN" == /usr/bin/python3 && "$TIMEOUT_BIN" == /usr/bin/timeout ]]
  [[ "$LIFECYCLE_LOCK_FILE" == /run/lock/gshsapp/lifecycle.lock ]]
  [[ -z "$RESTORE_DRILL_OUTPUT_FILE" ]]
  [[ -z "${BASH_ENV:-}" && -z "${ENV:-}" ]]
)
for target in import-backup.sh restore-drill.sh offsite-backup.sh; do
  target_source="$(<"$SCRIPT_ROOT/$target")"
  [[ "$target_source" == *'GSHSAPP_OFFSITE_PINNED'* ]]
  [[ "$target_source" == *'--verify-pinned-offsite'* ]]
done
validator_source="$(<"$VALIDATOR")"
[[ "$validator_source" == *'"PrivateMounts=true"'* ]]
[[ "$validator_source" == *'"MountFlags=private"'* ]]
[[ "$validator_source" == *'f"BindPaths={offsite_dir}"'* ]]
for installer in install-backup-timer.sh install-deploy-service.sh; do
  installer_source="$(<"$SCRIPT_ROOT/$installer")"
  [[ "$installer_source" == *'--property=PrivateMounts --property=MountFlags --property=BindPaths'* ]]
  [[ "$installer_source" == *'"MountFlags": "262144"'* ]]
done

if [[ "${GSHSAPP_STATIC_TEST_ONLY:-0}" == 1 ]]; then
  printf '%s\n' "Offsite mount pin static tests passed."
  exit 0
fi
[[ "$(id -u)" == 0 ]] || {
  printf '%s\n' "offsite mount pin integration test requires root" >&2
  exit 1
}
for command in mount umount unshare findmnt python3; do
  command -v "$command" >/dev/null 2>&1 || {
    printf 'missing integration-test command: %s\n' "$command" >&2
    exit 1
  }
done

TEST_ROOT="/run/gshsapp-offsite-pin-test-$$"
OFFSITE_DIR="$TEST_ROOT/offsite"
BACKUP_DIR="$TEST_ROOT/backup"
READY="$TEST_ROOT/ready"
CONTINUE="$TEST_ROOT/continue"
RESULT="$TEST_ROOT/result"
child_pid=""
systemd_run_pid=""
systemd_unit="gshsapp-offsite-pin-test-$$.service"
cleanup() {
  local status=$?
  if [[ -n "$child_pid" ]]; then
    kill "$child_pid" 2>/dev/null || :
    wait "$child_pid" 2>/dev/null || :
  fi
  if [[ -n "$systemd_run_pid" ]]; then
    kill "$systemd_run_pid" 2>/dev/null || :
    wait "$systemd_run_pid" 2>/dev/null || :
  fi
  if [[ -d /run/systemd/system ]]; then
    systemctl stop "$systemd_unit" >/dev/null 2>&1 || :
    systemctl reset-failed "$systemd_unit" >/dev/null 2>&1 || :
  fi
  umount -- "$OFFSITE_DIR" 2>/dev/null || :
  rm -rf -- "$TEST_ROOT"
  exit "$status"
}
trap cleanup EXIT INT TERM

install -d -o root -g root -m 0700 "$TEST_ROOT" "$OFFSITE_DIR" "$BACKUP_DIR"
mount -t tmpfs -o rw,nodev,nosuid,noexec,mode=0700 tmpfs "$OFFSITE_DIR"
install -d -o root -g root -m 0700 "$OFFSITE_DIR/.gshsapp-receipts"
printf '%s\n' original >"$OFFSITE_DIR/generation"

VALIDATOR_PATH="$VALIDATOR" OFFSITE_PATH="$OFFSITE_DIR" BACKUP_PATH="$BACKUP_DIR" \
READY_PATH="$READY" CONTINUE_PATH="$CONTINUE" RESULT_PATH="$RESULT" \
unshare --mount --propagation private /bin/bash -s <<'CHILD' &
set -Eeuo pipefail
mount --bind -- "$OFFSITE_PATH" "$OFFSITE_PATH"
GSHSAPP_OFFSITE_PINNED=manual VALIDATOR_PATH="$VALIDATOR_PATH" \
OFFSITE_PATH="$OFFSITE_PATH" BACKUP_PATH="$BACKUP_PATH" python3 - <<'PY'
import importlib.util
import os
import pathlib

spec = importlib.util.spec_from_file_location("operations_config", os.environ["VALIDATOR_PATH"])
assert spec is not None and spec.loader is not None
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.verify_pinned_offsite(
    {
        "OFFSITE_DIR": os.environ["OFFSITE_PATH"],
        "OFFSITE_MOUNT_SOURCE": "tmpfs",
        "OFFSITE_FSTYPE": "tmpfs",
        "OFFSITE_REQUIRED_OPTIONS": "rw,nodev,nosuid,noexec",
    },
    backup_dir=pathlib.Path(os.environ["BACKUP_PATH"]),
)
PY
: >"$READY_PATH"
while [[ ! -e "$CONTINUE_PATH" ]]; do sleep 0.05; done
cat "$OFFSITE_PATH/generation" >"$RESULT_PATH"
CHILD
child_pid=$!

for _ in $(seq 1 200); do
  [[ -e "$READY" ]] && break
  kill -0 "$child_pid" 2>/dev/null || { wait "$child_pid"; exit 1; }
  sleep 0.05
done
[[ -e "$READY" ]] || { printf '%s\n' "pinned namespace did not become ready" >&2; exit 1; }

umount -- "$OFFSITE_DIR"
mount -t tmpfs -o rw,nodev,nosuid,noexec,mode=0700 tmpfs "$OFFSITE_DIR"
install -d -o root -g root -m 0700 "$OFFSITE_DIR/.gshsapp-receipts"
printf '%s\n' replacement >"$OFFSITE_DIR/generation"
: >"$CONTINUE"
wait "$child_pid"
child_pid=""
[[ "$(<"$RESULT")" == original ]]

# On a host with systemd as PID 1, exercise the same properties used by the
# rendered units. The service's private mount must keep the reviewed filesystem
# after the host namespace detaches and replaces the mountpoint.
if [[ -d /run/systemd/system ]] && systemctl show-environment >/dev/null 2>&1; then
  umount -- "$OFFSITE_DIR"
  mount -t tmpfs -o rw,nodev,nosuid,noexec,mode=0700 tmpfs "$OFFSITE_DIR"
  printf '%s\n' systemd-original >"$OFFSITE_DIR/generation"
  rm -f -- "$READY" "$CONTINUE" "$RESULT"
  PROBE="$TEST_ROOT/systemd-probe.sh"
  cat >"$PROBE" <<'PROBE'
#!/usr/bin/env bash
set -Eeuo pipefail
: >"$READY_PATH"
while [[ ! -e "$CONTINUE_PATH" ]]; do sleep 0.05; done
cat "$OFFSITE_PATH/generation" >"$RESULT_PATH"
PROBE
  chmod 0700 "$PROBE"
  systemd-run --quiet --wait --collect --unit="$systemd_unit" \
    --property=Type=exec --property=PrivateMounts=yes --property=MountFlags=private \
    --property="BindPaths=$OFFSITE_DIR" \
    --setenv="OFFSITE_PATH=$OFFSITE_DIR" --setenv="READY_PATH=$READY" \
    --setenv="CONTINUE_PATH=$CONTINUE" --setenv="RESULT_PATH=$RESULT" \
    /bin/bash "$PROBE" &
  systemd_run_pid=$!
  for _ in $(seq 1 200); do
    [[ -e "$READY" ]] && break
    kill -0 "$systemd_run_pid" 2>/dev/null || { wait "$systemd_run_pid"; exit 1; }
    sleep 0.05
  done
  [[ -e "$READY" ]] || { printf '%s\n' "systemd pinned namespace did not become ready" >&2; exit 1; }
  effective_mount_flags="$(systemctl show "$systemd_unit" --property=MountFlags --value)"
  [[ "$effective_mount_flags" == 262144 ]] || {
    printf 'unexpected effective MountFlags value: <%q>\n' "$effective_mount_flags" >&2
    exit 1
  }
  umount -- "$OFFSITE_DIR"
  mount -t tmpfs -o rw,nodev,nosuid,noexec,mode=0700 tmpfs "$OFFSITE_DIR"
  printf '%s\n' systemd-replacement >"$OFFSITE_DIR/generation"
  : >"$CONTINUE"
  wait "$systemd_run_pid"
  systemd_run_pid=""
  [[ "$(<"$RESULT")" == systemd-original ]]
fi

printf '%s\n' "Offsite mount namespace pin tests passed."
