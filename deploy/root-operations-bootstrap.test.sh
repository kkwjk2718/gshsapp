#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

for script in \
  deploy/install-root-operations.sh \
  deploy/install-backup-timer.sh \
  deploy/install-deploy-service.sh; do
  /bin/bash -n "$script"
done

test_root="$(mktemp -d)"
python_bin="${PYTHON_BIN:-python3}"
cleanup() { rm -rf -- "$test_root"; }
trap cleanup EXIT
mkdir -p "$test_root/deploy"

cp deploy/root-bootstrap.sha256 deploy/control-assets.sha256 "$test_root/deploy/"
while IFS= read -r line || [[ -n "$line" ]]; do
  relative="${line#*  }"
  "$python_bin" - "$relative" "$test_root/$relative" <<'PY'
import pathlib
import sys

contents = pathlib.Path(sys.argv[1]).read_bytes().replace(b"\r\n", b"\n")
if b"\r" in contents:
    raise SystemExit("control contains a non-canonical carriage return")
pathlib.Path(sys.argv[2]).write_bytes(contents)
PY
done <deploy/control-assets.sha256

expected_bootstrap="$(sha256sum deploy/root-bootstrap.sha256)"
expected_bootstrap="${expected_bootstrap%% *}"
(
  cd "$test_root"
  printf '%s  %s\n' "$expected_bootstrap" deploy/root-bootstrap.sha256 | /usr/bin/sha256sum --check --strict - >/dev/null
  /usr/bin/sha256sum --check --strict deploy/root-bootstrap.sha256 >/dev/null
  /usr/bin/sha256sum --check --strict deploy/control-assets.sha256 >/dev/null
)

printf '\n' >>"$test_root/deploy/install-root-operations.sh"
if (
  cd "$test_root"
  /usr/bin/sha256sum --check --strict deploy/root-bootstrap.sha256 >/dev/null 2>&1
); then
  printf '%s\n' "Bootstrap verification accepted a modified installer." >&2
  exit 1
fi
cp deploy/install-root-operations.sh "$test_root/deploy/install-root-operations.sh"

printf '\n' >>"$test_root/deploy/approve-release.sh"
if (
  cd "$test_root"
  /usr/bin/sha256sum --check --strict deploy/control-assets.sha256 >/dev/null 2>&1
); then
  printf '%s\n' "Control verification accepted a modified runtime control." >&2
  exit 1
fi

printf '\n' >>"$test_root/deploy/root-bootstrap.sha256"
if (
  cd "$test_root"
  printf '%s  %s\n' "$expected_bootstrap" deploy/root-bootstrap.sha256 | /usr/bin/sha256sum --check --strict - >/dev/null 2>&1
); then
  printf '%s\n' "Out-of-band verification accepted a modified bootstrap manifest." >&2
  exit 1
fi

if /bin/bash deploy/install-root-operations.sh "$test_root" invalid prod >/dev/null 2>&1; then
  printf '%s\n' "Installer accepted a malformed out-of-band digest." >&2
  exit 1
fi

# The production lock must precede installed-tree inspection, pending recovery,
# source verification, publication, and approval invalidation. These ordering
# assertions complement the live flock contention exercise below.
"$python_bin" - deploy/install-root-operations.sh <<'PY'
import pathlib
import sys

source = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
needles = [
    'exec 9>"$LOCK_FILE"',
    '/usr/bin/flock -n 9 || fail "deployment, backup, restore, import, or another control installation is active"',
    'if [[ -e "$CONTROL_ROOT" || -L "$CONTROL_ROOT" ]]; then',
    'assert-lifecycle-quiescent "$DEPLOY_ROOT"',
    'exchange_directories "$stage" "$CONTROL_ROOT"',
    'LIFECYCLE_LOCK_HELD=1 /bin/bash "$CONTROL_ROOT/install-deploy-service.sh" --refresh-units',
    'LIFECYCLE_LOCK_HELD=1 /bin/bash "$CONTROL_ROOT/install-backup-timer.sh" --refresh-units',
]
positions = [source.index(needle) for needle in needles]
if positions != sorted(positions):
    raise SystemExit("control lifecycle operations are not ordered behind the shared lock")
transaction_needles = [
    'write_update_phase prepared',
    'approval="$DEPLOY_ROOT/approved-release.json"',
    'exchange_directories "$stage" "$CONTROL_ROOT"',
    'LIFECYCLE_LOCK_HELD=1 /bin/bash "$CONTROL_ROOT/install-deploy-service.sh" --refresh-units',
    'LIFECYCLE_LOCK_HELD=1 /bin/bash "$CONTROL_ROOT/install-backup-timer.sh" --refresh-units',
    'write_update_phase committed',
    'remove_recorded_update_staging || fail "committed control update staging could not be removed"',
    'remove_update_phase || fail "committed control update phase could not be removed"',
]
transaction_position = -1
for needle in transaction_needles:
    transaction_position = source.index(needle, transaction_position + 1)
if source.index("trap cleanup_bootstrap_proof EXIT") >= source.index(
    'verify_manifest_source "$source_root" "$BOOTSTRAP_MANIFEST_RELATIVE" bootstrap'
):
    raise SystemExit("one-time bootstrap proof is not consumed after a verification failure")
if "/opt/gshsapp/offsite-receipts" in source:
    raise SystemExit("root control installer recreates a host-local disaster-recovery receipt directory")
role_publish = source.index('/usr/bin/mv -T -- "$role_temp" "$HOST_ROLE_FILE"')
control_publish = source.index('/usr/bin/mv -T -- "$stage" "$CONTROL_ROOT"')
if role_publish >= control_publish:
    raise SystemExit("fresh bootstrap can publish controls before its immutable host role")
postverify = source.index('verify_installed_control_tree "$CONTROL_ROOT"', control_publish)
first_refresh = source.index(
    'LIFECYCLE_LOCK_HELD=1 /bin/bash "$CONTROL_ROOT/install-deploy-service.sh" --refresh-units'
)
if postverify >= first_refresh:
    raise SystemExit("control update does not post-verify the published exact control set")
if source.index('approval="$DEPLOY_ROOT/approved-release.json"') >= control_publish:
    raise SystemExit("a crash during control publication can leave a stale release approval usable")
state_create = source.index("ensure_update_state_root", source.index("assert-lifecycle-quiescent"))
if state_create >= control_publish:
    raise SystemExit("fresh bootstrap publishes recovery units before provisioning their state path")
for contract in (
    'snapshot_installed_units',
    'restore_unit_snapshot',
    'unit_refresh_started=true',
    'readonly UPDATE_PHASE_FILE=$UPDATE_STATE_ROOT/control-update.json',
    'recover_pending_update boot',
    'verify_recorded_control_tree',
    'verify_unit_snapshot',
    'ensure_update_state_root',
    'mktemp "$SYSTEMD_DIR/.${unit}.restore.XXXXXXXX"',
    '/usr/bin/cp -p -- "$unit_backup_dir/$unit" "$temporary"',
    '/usr/bin/mv -fT -- "$temporary" "$path"',
    '/usr/bin/systemctl is-active --quiet "$unit" || return 1',
    'if [[ "$restore_mode" == boot && "$unit" == gshsapp-docker-user-firewall.timer ]]; then',
    '"format": "gshsapp-control-update"',
):
    if contract not in source:
        raise SystemExit("control update cannot atomically roll back its authenticated unit refresh")
if '/usr/bin/mv -fT -- "$unit_backup_dir/$unit" "$path"' in source:
    raise SystemExit("durable unit recovery consumes its only rollback snapshot")
for marker in ("committed control update", "rolled-back control update"):
    staging = source.index(f'{marker} staging could not be removed')
    phase = source.index(f'{marker} phase could not be ', staging)
    if staging >= phase:
        raise SystemExit("durable update phase is removed before its private recovery snapshot")
boot_skip = source.index('if [[ "$restore_mode" == boot && "$unit" == gshsapp-docker-user-firewall.timer ]]; then')
timer_start = source.index('/usr/bin/systemctl start "$unit"', boot_skip)
if boot_skip >= timer_start:
    raise SystemExit("pre-Docker update recovery can deadlock while starting a Docker-dependent timer")
PY

"$python_bin" - deploy/gshsapp-control-update-recovery.service deploy/gshsapp-docker-boot-quarantine.service <<'PY'
import pathlib
import sys

recovery = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
unit = pathlib.Path(sys.argv[2]).read_text(encoding="utf-8")
for contract in (
    "PartOf=docker.service",
    "Before=docker.service",
    "Requires=gshsapp-control-update-recovery.service",
    "After=gshsapp-control-update-recovery.service",
    "RuntimeDirectory=lock/gshsapp",
    "RuntimeDirectoryMode=0700",
    "RuntimeDirectoryPreserve=yes",
    "ExecStart=/bin/bash /usr/local/lib/gshsapp-operations/docker-user-firewall.sh --boot-quarantine",
    "RequiredBy=docker.service",
):
    if contract not in unit:
        raise SystemExit("pre-Docker quarantine does not recover durable updates on every Docker restart")
if "--recover-update" in unit or "ReadWritePaths=/usr/local/lib" in unit:
    raise SystemExit("quarantine still performs control exchange inside its read-only control mount namespace")
for contract in (
    "Before=gshsapp-docker-boot-quarantine.service docker.service",
    "ExecStart=/bin/bash /usr/local/lib/gshsapp-operations/install-root-operations.sh --recover-update",
    "ReadOnlyPaths=/etc/gshsapp-operations",
):
    if contract not in recovery:
        raise SystemExit("separate pre-Docker control recovery unit is incomplete")
if "ReadOnlyPaths=/usr/local/lib/gshsapp-operations" in recovery:
    raise SystemExit("control recovery makes the exchanged control root a mount point")
recovery_read_write = next(
    (line for line in recovery.splitlines() if line.startswith("ReadWritePaths=")),
    "",
)
if "*" in recovery_read_write or not all(
    path in recovery_read_write.split("=", 1)[1].split()
    for path in ("/usr/local/lib", "/etc/systemd/system", "/var/lib/gshsapp-operations", "/run/lock/gshsapp")
):
    raise SystemExit("separate recovery uses unsupported wildcard or incomplete writable paths")
PY

# Unit installers must hold the same lock while authenticating controls,
# rendering from root config, and publishing systemd units. Otherwise a
# concurrent control-directory exchange can create a mixed-version unit.
"$python_bin" - deploy/install-backup-timer.sh deploy/install-deploy-service.sh <<'PY'
import pathlib
import sys

for filename in sys.argv[1:]:
    source = pathlib.Path(filename).read_text(encoding="utf-8")
    needles = [
        'exec 9>"$LOCK_FILE"',
        '/bin/bash "$CONTROL_ROOT/install-root-operations.sh" --verify-installed',
        'publication_started=true',
        '/usr/bin/mv -T -- "$stage_dir/',
    ]
    positions = [source.index(needle) for needle in needles]
    positions.insert(1, source.index('/usr/bin/flock -n 9 || fail', positions[0]))
    if positions != sorted(positions):
        raise SystemExit(f"{filename} does not hold the lifecycle lock across authenticated publication")
    for needle in (
        "/etc/systemd/system.control",
        "/run/systemd/system.control",
        "/run/systemd/transient",
        "/run/systemd/generator.early",
        "/run/systemd/generator.late",
        "/usr/local/lib/systemd/system",
        "/usr/lib/systemd/system",
        '"$unit_type.d"',
        '"$prefix-.${unit_type}.d"',
        "rollback_units()",
        'DropInPaths Names',
        'verify_unit_bytes',
        '--verify-unit',
        'mktemp "$LOCK_ROOT/.${unit}.verify.XXXXXXXX"',
        '--refresh-units',
    ):
        if needle not in source:
            raise SystemExit(f"{filename} does not reject or roll back systemd unit overrides")
    if 'mktemp "$SYSTEMD_DIR/.${unit}.verify.' in source:
        raise SystemExit(f"{filename} tries to write its runtime verification fixture into read-only systemd paths")
    inherited = source.index('if [[ "${LIFECYCLE_LOCK_HELD:-0}" == 1 ]]; then')
    refresh = source.index('--refresh-units', inherited)
    inherited_verify = source.index('/usr/bin/flock -n 9 || fail', inherited)
    if not (inherited < refresh < inherited_verify):
        raise SystemExit(f"{filename} cannot refresh units under the control installer's inherited lock")
    stage_verify = source.index('/usr/bin/systemd-analyze verify "$stage_dir/')
    publish = source.index('/usr/bin/mv -T -- "$stage_dir/')
    if stage_verify >= publish:
        raise SystemExit(f"{filename} publishes a unit before systemd pre-verification")

backup = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
install_path = backup.index('[[ "$#" == 0 ]] || fail')
receipt_needles = [
    "validate_config --verify-mounted-offsite-base",
    'receipt_dir="$(validate_config --print-receipt-dir)"',
    '/usr/bin/install -d -o root -g root -m 0700 -- "$receipt_dir"',
    'validate_config --verify-mounted-offsite || fail',
]
receipt_positions = [backup.index(needle, install_path) for needle in receipt_needles]
if receipt_positions != sorted(receipt_positions):
    raise SystemExit("backup installer creates receipts before authenticating the offsite mount")
if "/opt/gshsapp/offsite-receipts" in backup:
    raise SystemExit("backup installer still accepts a host-local receipt directory")

deploy = pathlib.Path(sys.argv[2]).read_text(encoding="utf-8")
if "validate_config --verify-mounted-offsite || fail" not in deploy:
    raise SystemExit("deployment unit installer does not authenticate the offsite receipt mount")
for needle in (
    'gshsapp-control-update-recovery.service',
    'gshsapp-docker-boot-quarantine.service',
    'gshsapp-docker-user-firewall.service',
    'gshsapp-docker-user-firewall.timer',
    'gshsapp-writer-recovery.service',
    'LIFECYCLE_LOCK_HELD=1 /bin/bash "$CONTROL_ROOT/docker-user-firewall.sh" --enforce',
    '/usr/bin/systemctl enable "${UPDATE_RECOVERY_FILE##*/}" "${QUARANTINE_FILE##*/}" "${RECOVERY_FILE##*/}" "${FIREWALL_FILE##*/}" "${FIREWALL_TIMER_FILE##*/}"',
):
    if needle not in deploy:
        raise SystemExit("deployment installer does not persist the authenticated DOCKER-USER boundary")
PY

"$python_bin" - deploy/validate-operations-config.py <<'PY'
import pathlib
import sys

source = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
for needle in (
    "ExecStartPre=/bin/bash {_CONTROL_ROOT}/{installer} --verify-unit",
    "ExecStartPre=/bin/bash {_CONTROL_ROOT}/docker-user-firewall.sh --verify",
):
    if needle not in source:
        raise SystemExit("runtime service does not fail closed when authenticated controls or units change")
PY

"$python_bin" - deploy/host-hardening.sh <<'PY'
import pathlib
import sys

source = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
for needle in (
    'if [[ "${LIFECYCLE_LOCK_HELD:-0}" == 1 ]]; then',
    '"$(readlink -f -- /proc/self/fd/9 2>/dev/null || true)" == "$lock_file"',
    'flock -n 9',
):
    if needle not in source:
        raise SystemExit("host hardening cannot safely reuse the authenticated lifecycle lock")
PY

if command -v flock >/dev/null 2>&1; then
  busy_lock="$test_root/lifecycle.lock"
  ready="$test_root/lock-ready"
  release="$test_root/lock-release"
  (
    exec 7>"$busy_lock"
    flock -n 7
    : >"$ready"
    while [[ ! -e "$release" ]]; do sleep 0.01; done
  ) &
  holder=$!
  for _ in {1..100}; do [[ -e "$ready" ]] && break; sleep 0.01; done
  [[ -e "$ready" ]] || { echo "Unable to establish lifecycle contention fixture." >&2; exit 1; }
  if (
    exec 8>"$busy_lock"
    flock -n 8
    : >"$test_root/published"
  ) 2>/dev/null; then
    : >"$release"
    wait "$holder"
    echo "Non-blocking lifecycle acquisition accepted an active operation." >&2
    exit 1
  fi
  [[ ! -e "$test_root/published" ]] || {
    : >"$release"
    wait "$holder"
    echo "Publication continued after lifecycle lock contention." >&2
    exit 1
  }
  : >"$release"
  wait "$holder"
fi

printf '%s\n' "Root operations bootstrap tests passed."
