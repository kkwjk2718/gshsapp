#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_BIN="${PYTHON_BIN:-$(command -v python3 2>/dev/null || command -v python 2>/dev/null || true)}"
[[ -n "$PYTHON_BIN" ]] || { printf '%s\n' "Python is required for control recovery tests." >&2; exit 1; }

"$PYTHON_BIN" - \
  "$SCRIPT_ROOT/gshsapp-control-update-recovery.service" \
  "$SCRIPT_ROOT/gshsapp-docker-boot-quarantine.service" \
  "$SCRIPT_ROOT/gshsapp-docker-user-firewall.service" \
  "$SCRIPT_ROOT/gshsapp-writer-recovery.service" \
  "$SCRIPT_ROOT/install-deploy-service.sh" \
  "$SCRIPT_ROOT/install-root-operations.sh" <<'PY'
import pathlib
import re
import sys

recovery, quarantine, firewall, writer, installer, root_installer = (
    pathlib.Path(name).read_text(encoding="utf-8") for name in sys.argv[1:]
)
if "ReadOnlyPaths=/usr/local/lib/gshsapp-operations" in recovery:
    raise SystemExit("control recovery turns CONTROL_ROOT into a non-exchangeable mount point")
for contract in (
    "Before=gshsapp-docker-boot-quarantine.service docker.service",
    "ExecStart=/bin/bash /usr/local/lib/gshsapp-operations/install-root-operations.sh --recover-update",
    "ReadWritePaths=/usr/local/lib /etc/systemd/system /var/lib/gshsapp-operations /run/lock/gshsapp",
    "RequiredBy=docker.service",
):
    if contract not in recovery:
        raise SystemExit("separate control recovery sandbox is incomplete")
for contract in (
    "Requires=gshsapp-control-update-recovery.service",
    "After=gshsapp-control-update-recovery.service",
    "ReadOnlyPaths=/usr/local/lib/gshsapp-operations /etc/gshsapp-operations",
):
    if contract not in quarantine:
        raise SystemExit("quarantine is not ordered after isolated update recovery")
if "--recover-update" in quarantine:
    raise SystemExit("control recovery still runs inside the quarantine mount namespace")
if "ConditionPathExists=" in recovery:
    raise SystemExit("control recovery is conditionally skipped during Docker activation")
for source in (installer, root_installer):
    if "gshsapp-control-update-recovery.service" not in source:
        raise SystemExit("durable unit publication omits the separate control recovery unit")
for contract in (
    "UPDATE_RECOVERY_ENABLE_LINK=$SYSTEMD_DIR/docker.service.requires/gshsapp-control-update-recovery.service",
    'systemctl is-enabled --quiet "${UPDATE_RECOVERY_FILE##*/}"',
    'readlink -f -- "$UPDATE_RECOVERY_ENABLE_LINK"',
):
    if contract not in installer:
        raise SystemExit("installer does not persist and verify the pre-Docker recovery link")

update_publish = installer.index('/usr/bin/mv -T -- "$stage_dir/${UPDATE_RECOVERY_FILE##*/}" "$UPDATE_RECOVERY_FILE"')
update_enable = installer.index('/usr/bin/systemctl enable "${UPDATE_RECOVERY_FILE##*/}"', update_publish)
update_link = installer.index('readlink -f -- "$UPDATE_RECOVERY_ENABLE_LINK"', update_enable)
link_fsync = installer.index('/usr/bin/sync "$SYSTEMD_DIR/docker.service.requires"', update_link)
quarantine_publish = installer.index('/usr/bin/mv -T -- "$stage_dir/${QUARANTINE_FILE##*/}" "$QUARANTINE_FILE"')
if not (update_publish < update_enable < update_link < link_fsync < quarantine_publish):
    raise SystemExit("recovery entrypoint is not durable before quarantine replacement")
for anchor in (
    "gshsapp-control-update-recovery.service",
    "gshsapp-docker-boot-quarantine.service",
):
    if anchor not in root_installer[root_installer.index("IMMUTABLE_BOOT_ANCHOR_UNITS"):]:
        raise SystemExit("durable boot anchor is not classified as immutable")
if '/usr/bin/systemctl disable "${ENABLED_UNIT_NAMES[@]}"' in root_installer:
    raise SystemExit("durable recovery removes its own next-boot entrypoint")
if '/usr/bin/systemctl disable "${MUTABLE_ENABLED_UNIT_NAMES[@]}"' not in root_installer:
    raise SystemExit("durable recovery does not isolate mutable enable links")
if 'for unit in "${MUTABLE_ENABLED_UNIT_NAMES[@]}"; do' not in root_installer:
    raise SystemExit("durable recovery may rewrite an immutable boot anchor")
if 'disable "${FIREWALL_TIMER_FILE##*/}" "${FIREWALL_FILE##*/}" "${RECOVERY_FILE##*/}" "${QUARANTINE_FILE##*/}"' in installer:
    raise SystemExit("deployment rollback removes the pre-Docker quarantine anchor first")
anchor_verify = root_installer.index('for unit in "${IMMUTABLE_BOOT_ANCHOR_UNITS[@]}"; do', root_installer.index("restore_unit_snapshot()"))
phase_remove = root_installer.index("remove_update_phase()")
if anchor_verify >= phase_remove:
    raise SystemExit("durable boot anchors are not verified before phase cleanup")

wait_match = re.search(
    r"^readonly BOOT_RECOVERY_LOCK_WAIT_SECONDS=([1-9][0-9]*)$",
    root_installer,
    re.MULTILINE,
)
if wait_match is None or int(wait_match.group(1)) >= 120:
    raise SystemExit("pre-Docker control recovery lock wait is not bounded inside TimeoutStartSec=2min")
lock_open = root_installer.index('exec 9>"$LOCK_FILE"')
recover_branch = root_installer.index('if [[ "$recover_only" == true ]]; then', lock_open)
bounded_wait = root_installer.index(
    '/usr/bin/flock -w "$BOOT_RECOVERY_LOCK_WAIT_SECONDS" 9', recover_branch
)
ordinary_branch = root_installer.index("else", bounded_wait)
nonblocking = root_installer.index("/usr/bin/flock -n 9", ordinary_branch)
branch_end = root_installer.index("fi", nonblocking)
if not (lock_open < recover_branch < bounded_wait < ordinary_branch < nonblocking < branch_end):
    raise SystemExit("control recovery and ordinary install lock modes are not separated")
if root_installer.count('/usr/bin/flock -w "$BOOT_RECOVERY_LOCK_WAIT_SECONDS" 9') != 1:
    raise SystemExit("a non-recovery root operation can enter the bounded boot wait")

# Each pre-Docker oneshot exits (closing fd9) before Docker starts. The exact
# firewall service follows Docker, and writer recovery follows that service;
# therefore writer recovery cannot race either pre-Docker lock holder.
if "Before=gshsapp-docker-boot-quarantine.service docker.service" not in recovery:
    raise SystemExit("control update recovery does not finish before Docker")
if "Before=docker.service" not in quarantine:
    raise SystemExit("boot quarantine does not finish before Docker")
for contract in (
    "After=docker.service gshsapp-docker-boot-quarantine.service",
    "Before=gshsapp-writer-recovery.service",
):
    if contract not in firewall:
        raise SystemExit("post-Docker firewall does not separate writer recovery from pre-Docker locks")
for contract in (
    "Requires=docker.service gshsapp-docker-user-firewall.service",
    "After=docker.service gshsapp-docker-user-firewall.service",
):
    if contract not in writer:
        raise SystemExit("writer recovery can run before pre-Docker lock holders have exited")
PY

if [[ "$(uname -s)" == Linux && "$(id -u)" == 0 ]]; then
  for command in mount mountpoint unshare; do
    command -v "$command" >/dev/null 2>&1 || { printf '%s\n' "Missing mount namespace test command: $command" >&2; exit 1; }
  done
  test_root="$(mktemp -d)"
  trap 'rm -rf -- "$test_root"' EXIT
  control_root="$test_root/gshsapp-operations"
  staged_root="$test_root/.gshsapp-operations.stage"
  mkdir -m 0700 "$control_root" "$staged_root"
  printf '%s\n' old >"$control_root/identity"
  printf '%s\n' new >"$staged_root/identity"
  helper="$test_root/exchange.py"
  "$PYTHON_BIN" - "$helper" <<'PY'
import pathlib
import sys

pathlib.Path(sys.argv[1]).write_text("""\
import ctypes
import os
import sys
libc = ctypes.CDLL(None, use_errno=True)
renameat2 = libc.renameat2
renameat2.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
renameat2.restype = ctypes.c_int
if renameat2(-100, os.fsencode(sys.argv[1]), -100, os.fsencode(sys.argv[2]), 2) != 0:
    raise SystemExit(ctypes.get_errno())
""", encoding="utf-8", newline="\n")
PY

  # Reproduce the old combined-unit failure with an actual read-only bind
  # mount on CONTROL_ROOT. renameat2 must fail specifically with EBUSY (16).
  set +e
  unshare --mount --propagation private --fork -- /bin/bash -ceu '
    mount --bind "$1" "$1"
    mount -o remount,bind,ro "$1"
    mountpoint -q "$1"
    "$3" "$4" "$1" "$2"
  ' _ "$control_root" "$staged_root" "$PYTHON_BIN" "$helper"
  mounted_status=$?
  set -e
  [[ "$mounted_status" == 16 ]] || {
    printf '%s\n' "Read-only CONTROL_ROOT mount did not reproduce renameat2 EBUSY (status $mounted_status)." >&2
    exit 1
  }

  # The new recovery service has its own namespace without a CONTROL_ROOT
  # bind mount, so the exact same durable exchange succeeds.
  unshare --mount --propagation private --fork -- \
    "$PYTHON_BIN" "$helper" "$control_root" "$staged_root"
  [[ "$(<"$control_root/identity")" == new && "$(<"$staged_root/identity")" == old ]] || {
    printf '%s\n' "Mount-independent control recovery did not exchange both generations." >&2
    exit 1
  }
fi

printf '%s\n' "Control update mount-namespace recovery tests passed."
