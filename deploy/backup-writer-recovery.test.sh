#!/usr/bin/env bash
set -Eeuo pipefail

TEST_ROOT="$(mktemp -d)"
trap 'rm -rf -- "$TEST_ROOT"' EXIT
SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -n "${PYTHON_BIN:-}" ]]; then
  PYTHON_BIN="$(command -v "$PYTHON_BIN" 2>/dev/null || printf '%s' "$PYTHON_BIN")"
else
  PYTHON_BIN="$(command -v python3 2>/dev/null || command -v python 2>/dev/null || true)"
fi
[[ -n "$PYTHON_BIN" ]] || { printf '%s\n' "Python is required for backup recovery tests." >&2; exit 1; }

RECOVERY_COPY="$TEST_ROOT/recover-backup-writer.sh"
PYTHON_WRAPPER="$TEST_ROOT/python"
printf '#!/usr/bin/env bash\nexec %q "$@"\n' "$PYTHON_BIN" >"$PYTHON_WRAPPER"
chmod 0700 "$PYTHON_WRAPPER"
cp "$SCRIPT_ROOT/recover-backup-writer.sh" "$RECOVERY_COPY"
python_escaped="${PYTHON_WRAPPER//&/\\&}"
sed -i "s|/usr/bin/python3|$python_escaped|g" "$RECOVERY_COPY"

CONTAINER_ID="$(printf 'a%.0s' {1..64})"
IMAGE_ID="sha256:$(printf 'b%.0s' {1..64})"
CONFIG_IMAGE='registry.example/gshsapp@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
PHASE_FILE="$TEST_ROOT/backup-phase.json"
POLICY_FILE="$TEST_ROOT/policy"
RUNNING_FILE="$TEST_ROOT/running"
HEALTH_FILE="$TEST_ROOT/health"
DOCKER_LOG="$TEST_ROOT/docker.log"

write_fixture_phase() {
  local phase="$1" was_running="${2:-true}"
  PHASE="$phase" WAS_RUNNING="$was_running" CONTAINER_ID="$CONTAINER_ID" IMAGE_ID="$IMAGE_ID" CONFIG_IMAGE="$CONFIG_IMAGE" \
    "$PYTHON_BIN" - "$PHASE_FILE" <<'PY'
import json,os,sys
value={"format":"gshsapp-backup-phase","version":3,"phase":os.environ["PHASE"],"containerId":os.environ["CONTAINER_ID"],"imageId":os.environ["IMAGE_ID"],"configImage":os.environ["CONFIG_IMAGE"],"restartPolicy":"always","containerName":"gshsapp-web","wasRunning":os.environ["WAS_RUNNING"]=="true","updatedAt":"2026-08-13T00:00:00.000Z"}
with open(sys.argv[1],"w",encoding="utf-8") as output: json.dump(value,output,separators=(",",":")); output.write("\n")
PY
}

run_recovery() (
  id() { [[ "${1:-}" == "-u" ]] && { printf '%s\n' 0; return; }; command id "$@"; }
  docker() {
    printf '%s\n' "$*" >>"$DOCKER_LOG"
    case "$1 ${2:-} ${3:-}" in
      "inspect --format {{.Id}}") cat <<<"$CONTAINER_ID" ;;
      "inspect --format {{.Image}}") cat <<<"$IMAGE_ID" ;;
      "inspect --format {{.Config.Image}}") cat <<<"$CONFIG_IMAGE" ;;
      "inspect --format {{.Name}}") printf '%s\n' '/gshsapp-web' ;;
      "inspect --format {{.HostConfig.RestartPolicy.Name}}") cat "$POLICY_FILE" ;;
      "inspect --format {{.State.Running}}") cat "$RUNNING_FILE" ;;
      "inspect --format {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}") cat "$HEALTH_FILE" ;;
      "update --restart=always "*) printf '%s\n' always >"$POLICY_FILE" ;;
      "start $CONTAINER_ID ") printf '%s\n' true >"$RUNNING_FILE" ;;
      *) return 97 ;;
    esac
  }
  export -f id docker
  LIFECYCLE_LOCK_HELD=1 DEPLOY_ROOT="$TEST_ROOT" PHASE_FILE="$PHASE_FILE" \
    source "$RECOVERY_COPY"
)

# Malformed or partial durable state must fail closed instead of being treated
# as the already-healthy sentinel.
printf '%s\n' '{not-json' >"$PHASE_FILE"
if run_recovery >/dev/null 2>&1; then
  printf '%s\n' "Malformed backup recovery state was accepted." >&2
  exit 1
fi

# Recovery restores the exact restart policy, starts the exact retained
# container, waits for health, and only then publishes the healthy state.
write_fixture_phase restart-required
printf '%s\n' no >"$POLICY_FILE"
printf '%s\n' false >"$RUNNING_FILE"
printf '%s\n' healthy >"$HEALTH_FILE"
: >"$DOCKER_LOG"
run_recovery
grep -Fqx "update --restart=always $CONTAINER_ID" "$DOCKER_LOG"
grep -Fqx "start $CONTAINER_ID" "$DOCKER_LOG"
"$PYTHON_BIN" - "$PHASE_FILE" <<'PY'
import json,sys
value=json.load(open(sys.argv[1],encoding="utf-8"))
assert value["phase"] == "healthy"
assert all(value[key] == "" for key in ("containerId","imageId","configImage","restartPolicy","containerName"))
assert value["wasRunning"] is False
PY

# A writer that was already stopped still has its automatic restart policy
# quarantined during the snapshot, but recovery must not start it afterward.
write_fixture_phase restart-required false
printf '%s\n' no >"$POLICY_FILE"
printf '%s\n' false >"$RUNNING_FILE"
printf '%s\n' healthy >"$HEALTH_FILE"
: >"$DOCKER_LOG"
run_recovery
grep -Fqx "update --restart=always $CONTAINER_ID" "$DOCKER_LOG"
if grep -Fq "start $CONTAINER_ID" "$DOCKER_LOG"; then
  printf '%s\n' "Originally stopped writer was started during recovery." >&2
  exit 1
fi

# A start that never becomes healthy must retain restart-required so the next
# serialized lifecycle operation can retry or quarantine it.
write_fixture_phase restart-required
printf '%s\n' no >"$POLICY_FILE"
printf '%s\n' false >"$RUNNING_FILE"
printf '%s\n' unhealthy >"$HEALTH_FILE"
if run_recovery >/dev/null 2>&1; then
  printf '%s\n' "Unhealthy writer recovery was accepted." >&2
  exit 1
fi
"$PYTHON_BIN" - "$PHASE_FILE" <<'PY'
import json,sys
assert json.load(open(sys.argv[1],encoding="utf-8"))["phase"] == "restart-required"
PY

SCHEDULED_SOURCE="$(<"$SCRIPT_ROOT/run-scheduled-backup.sh")"
[[ "$SCHEDULED_SOURCE" == *'LOCK_FILE="${LOCK_FILE:-/run/lock/gshsapp/lifecycle.lock}"'* ]]
[[ "$SCHEDULED_SOURCE" == *'docker ps --all --no-trunc --quiet'* ]]
intent_line="$(grep -nF 'write_phase "restart-required"' "$SCRIPT_ROOT/run-scheduled-backup.sh" | cut -d: -f1)"
disable_line="$(grep -nF 'docker update --restart=no' "$SCRIPT_ROOT/run-scheduled-backup.sh" | cut -d: -f1)"
stop_line="$(grep -nF 'docker stop --time 30' "$SCRIPT_ROOT/run-scheduled-backup.sh" | cut -d: -f1)"
[[ -n "$intent_line" && -n "$disable_line" && -n "$stop_line" && "$intent_line" -lt "$disable_line" && "$disable_line" -lt "$stop_line" ]]
reconcile_line="$(grep -nF '"$PYTHON_BIN" "$CONTROL_ROOT/bootstrap-backup.py" reconcile' "$SCRIPT_ROOT/run-scheduled-backup.sh" | cut -d: -f1)"
freshness_line="$(grep -nF '"$PYTHON_BIN" "$CONTROL_ROOT/bootstrap-backup.py" fresh-offsite' "$SCRIPT_ROOT/run-scheduled-backup.sh" | cut -d: -f1)"
create_line="$(grep -nF '"$PYTHON_BIN" "$CONTROL_ROOT/bootstrap-backup.py" create' "$SCRIPT_ROOT/run-scheduled-backup.sh" | cut -d: -f1)"
local_verify_line="$(grep -nF '"$PYTHON_BIN" "$CONTROL_ROOT/bootstrap-backup.py" verify \' "$SCRIPT_ROOT/run-scheduled-backup.sh" | tail -n1 | cut -d: -f1)"
early_recovery_line="$(grep -nF '/bin/bash "$CONTROL_ROOT/recover-backup-writer.sh"' "$SCRIPT_ROOT/run-scheduled-backup.sh" | tail -n1 | cut -d: -f1)"
export_line="$(grep -nF '"$PYTHON_BIN" "$CONTROL_ROOT/bootstrap-backup.py" export-offsite' "$SCRIPT_ROOT/run-scheduled-backup.sh" | tail -n1 | cut -d: -f1)"
writer_enumeration_line="$(grep -nF 'docker ps --all --no-trunc --quiet' "$SCRIPT_ROOT/run-scheduled-backup.sh" | tail -n1 | cut -d: -f1)"
[[ -n "$reconcile_line" && -n "$freshness_line" && -n "$create_line" &&
   -n "$writer_enumeration_line" && "$reconcile_line" -lt "$freshness_line" &&
   "$freshness_line" -lt "$writer_enumeration_line" && "$writer_enumeration_line" -lt "$create_line" ]]
[[ -n "$local_verify_line" && -n "$early_recovery_line" && -n "$export_line" &&
   "$create_line" -lt "$local_verify_line" && "$local_verify_line" -lt "$early_recovery_line" &&
   "$early_recovery_line" -lt "$export_line" ]]
[[ "$SCHEDULED_SOURCE" == *'--verify-pinned-offsite'* ]]
[[ "$SCHEDULED_SOURCE" == *'GSHSAPP_OFFSITE_PINNED'* ]]
[[ "$SCHEDULED_SOURCE" != *'"$PYTHON_BIN" - <<'"'"'PY'"'"''* ]]
[[ "$SCHEDULED_SOURCE" != *'--backup-needed'* ]]
[[ "$SCHEDULED_SOURCE" == *'[[ "$freshness_status" == 10 ]]'* ]]
[[ "$SCHEDULED_SOURCE" == *'exit "$freshness_status"'* ]]

printf '%s\n' "Backup writer crash-recovery tests passed."
