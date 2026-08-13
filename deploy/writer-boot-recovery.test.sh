#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
PYTHON_BIN="${PYTHON_BIN:-python3}"
# shellcheck source=recover-writers-at-boot.sh
source "$SCRIPT_DIR/recover-writers-at-boot.sh"

test_root="$(mktemp -d)"
trap 'rm -rf -- "$test_root"' EXIT
log="$test_root/recovery.log"
touch "$log"

cat >"$test_root/deployment-phase.json" <<'JSON'
{"format":"gshsapp-deployment-phase","version":2,"phase":"candidate-healthy-pending-promotion","imageTag":"sha-0123456789abcdef0123456789abcdef01234567","imageDigest":"sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef","containerId":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","imageId":"sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","configImage":"registry.example/gshsapp@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","updatedAt":"2026-08-13T00:00:00.000Z"}
JSON
cat >"$test_root/backup-phase.json" <<'JSON'
{"format":"gshsapp-backup-phase","version":3,"phase":"restart-required","containerId":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","imageId":"sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","configImage":"registry.example/gshsapp@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","restartPolicy":"always","containerName":"gshsapp-web","wasRunning":true,"updatedAt":"2026-08-13T00:00:00.000Z"}
JSON

# Intentionally do not create any offsite mount/config. The boot recovery
# contract must resolve durable writer phases without consulting them.
bash_command() {
  printf '%s|%s\n' "${1##*/}" "$PHASE_FILE" >>"$log"
  if [[ "${1##*/}" == recover-deployment-writer.sh ]]; then
    cat >"$PHASE_FILE" <<'JSON'
{"format":"gshsapp-deployment-phase","version":1,"phase":"healthy","imageTag":"sha-0123456789abcdef0123456789abcdef01234567","imageDigest":"sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef","updatedAt":"2026-08-13T00:01:00.000Z"}
JSON
  else
    cat >"$PHASE_FILE" <<'JSON'
{"format":"gshsapp-backup-phase","version":3,"phase":"healthy","containerId":"","imageId":"","configImage":"","restartPolicy":"","containerName":"","wasRunning":false,"updatedAt":"2026-08-13T00:01:00.000Z"}
JSON
  fi
}
validate_lifecycle_command() {
  "$PYTHON_BIN" - "$SCRIPT_DIR/validate-operations-config.py" "$test_root" <<'PY'
import importlib.util
import pathlib
import sys

spec = importlib.util.spec_from_file_location("operations_config", sys.argv[1])
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)
root = pathlib.Path(sys.argv[2])
for name in ("deployment-phase.json", "backup-phase.json"):
    module.parse_terminal_lifecycle_phase_text(name, (root / name).read_text(encoding="utf-8"))
PY
}

recover_writers_under_lock "$test_root" /authenticated/control
expected="$(printf '%s\n' \
  "recover-deployment-writer.sh|$test_root/deployment-phase.json" \
  "recover-backup-writer.sh|$test_root/backup-phase.json")"
[[ "$(<"$log")" == "$expected" ]] || {
  echo "Boot recovery did not resolve both durable phases in fixed order." >&2
  exit 1
}

unit="$SCRIPT_DIR/gshsapp-writer-recovery.service"
grep -Fxq 'Requires=docker.service gshsapp-docker-user-firewall.service' "$unit"
grep -Fxq 'After=docker.service gshsapp-docker-user-firewall.service' "$unit"
grep -Fxq 'BindsTo=docker.service' "$unit"
grep -Fxq 'PartOf=docker.service' "$unit"
grep -Fxq 'Before=gshsapp-deploy.service gshsapp-backup.service' "$unit"
grep -Fxq 'WantedBy=docker.service' "$unit"
if grep -Fq 'WantedBy=multi-user.target' "$unit"; then
  printf '%s\n' "Writer recovery is not re-pulled by every Docker activation." >&2
  exit 1
fi
installer="$(<"$SCRIPT_DIR/install-deploy-service.sh")"
[[ "$installer" == *'RECOVERY_ENABLE_LINK=$SYSTEMD_DIR/docker.service.wants/gshsapp-writer-recovery.service'* ]]
[[ "$installer" == *'[[ "$unit" == "${UPDATE_RECOVERY_FILE##*/}" || "$unit" == "${QUARANTINE_FILE##*/}" ||'* ]]
[[ "$installer" == *'"$unit" == "${RECOVERY_FILE##*/}" ]] || return 0'* ]]
[[ "$installer" == *'dependencies["BindsTo"] != {"docker.service"} or dependencies["PartOf"] != {"docker.service"}'* ]]
[[ "$installer" == *'dependencies["Requires"] != {"docker.service", "gshsapp-docker-user-firewall.service"}'* ]]
[[ "$installer" == *'readlink -f -- "$RECOVERY_ENABLE_LINK"'* ]]
if grep -Eq 'OFFSITE|RequiresMountsFor|ConditionPathIsMountPoint|EnvironmentFile' "$unit"; then
  echo "Boot recovery is incorrectly gated on the offsite mount." >&2
  exit 1
fi

printf '%s\n' "Mount-independent boot writer recovery tests passed."
