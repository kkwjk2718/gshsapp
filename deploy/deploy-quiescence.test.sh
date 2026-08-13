#!/usr/bin/env bash
set -Eeuo pipefail

TEST_ROOT="$(mktemp -d)"
trap 'rm -rf -- "$TEST_ROOT"' EXIT
SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -n "${PYTHON_BIN:-}" ]]; then
  PYTHON_BIN="$(command -v "$PYTHON_BIN" 2>/dev/null || printf '%s' "$PYTHON_BIN")"
else
  PYTHON_BIN=""
  for candidate in python3 python; do
    if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -c 'raise SystemExit(0)' >/dev/null 2>&1; then
      PYTHON_BIN="$(command -v "$candidate")"
      break
    fi
  done
  [[ -n "$PYTHON_BIN" ]] || { printf '%s\n' "Python is required for deploy lifecycle tests." >&2; exit 1; }
fi
CONTAINER_ID="$(printf 'b%.0s' {1..64})"
IMAGE_ID="sha256:$(printf 'c%.0s' {1..64})"
CONFIG_IMAGE="registry.example/gshsapp@sha256:$(printf 'd%.0s' {1..64})"
NETWORK_ID="$(printf '9%.0s' {1..64})"

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

assert_line() {
  grep -Fxq "$1" "$2" || fail "Missing expected event: $1"
}

run_deploy_function_tests() (
  set -Eeuo pipefail
  export CONTROL_ROOT="$SCRIPT_ROOT"
  export DEPLOY_ROOT="$TEST_ROOT/deploy"
  export EXPECTED_APP_ORIGIN="https://test.gshs.app"
  export IMAGE_TAG="sha-0123456789abcdef0123456789abcdef01234567"
  export IMAGE_DIGEST="sha256:$(printf 'a%.0s' {1..64})"
  export DOCKER_IMAGE="registry.example/gshsapp"
  export CONTAINER_NAME="gshsapp-web"
  export OFFSITE_DIR="$TEST_ROOT/offsite"
  export OFFSITE_MOUNT_SOURCE="test-source"
  export OFFSITE_FSTYPE="ext4"
  export PYTHON_BIN
  mkdir -p "$DEPLOY_ROOT" "$OFFSITE_DIR"

  # shellcheck source=deploy.sh
  source "$SCRIPT_ROOT/deploy.sh"
  trap - EXIT

  DOCKER_LOG="$TEST_ROOT/deploy-docker.log"
  : >"$DOCKER_LOG"
  DOCKER_PRESENT=true
  DOCKER_RUNNING=true
  DOCKER_LIST_FAIL=false
  DOCKER_RUNNING_LIST_FAIL=false
  INSPECTED_ID="$CONTAINER_ID"
  INSPECTED_IMAGE_ID="$IMAGE_ID"
  INSPECTED_CONFIG_IMAGE="$CONFIG_IMAGE"
  INSPECTED_RESTART_POLICY=always
  EXPECT_INTENT_ON_UPDATE=true

  sync() { :; }
  docker() {
    local joined=" $* "
    if [[ "$1 $2" == "network inspect" ]]; then
      printf '%s\n' "$NETWORK_ID"
      return 0
    fi
    if [[ "$1" == "ps" && "$joined" == *" --all "* ]]; then
      [[ "$DOCKER_LIST_FAIL" != "true" ]] || return 70
      [[ "$DOCKER_PRESENT" == "true" ]] && printf '%s\n' "$CONTAINER_ID"
      return 0
    fi
    if [[ "$1" == "ps" ]]; then
      [[ "$DOCKER_RUNNING_LIST_FAIL" != "true" ]] || return 71
      [[ "$DOCKER_PRESENT" == "true" && "$DOCKER_RUNNING" == "true" ]] && printf '%s\n' "$CONTAINER_ID"
      return 0
    fi
    if [[ "$1 $2" == "inspect --format" ]]; then
      case "$3" in
        *'.Id'*) printf '%s\n' "$INSPECTED_ID" ;;
        *'.HostConfig.RestartPolicy.Name'*) printf '%s\n' "$INSPECTED_RESTART_POLICY" ;;
        *'.Name'*) printf '%s\n' "/$CONTAINER_NAME" ;;
        *'.Config.Image'*) printf '%s\n' "$INSPECTED_CONFIG_IMAGE" ;;
        *'.Image'*) printf '%s\n' "$INSPECTED_IMAGE_ID" ;;
        *'.State.Running'*) printf '%s\n' "$DOCKER_RUNNING" ;;
        *'.NetworkSettings.Networks'*) printf '{"gshsapp-web":{"NetworkID":"%s"}}\n' "$NETWORK_ID" ;;
        *) return 72 ;;
      esac
      return 0
    fi
    if [[ "$1" == "stop" ]]; then
      [[ "${*: -1}" == "$CONTAINER_ID" ]] || return 73
      [[ -f "$DEPLOY_ROOT/deployment-restart.json" ]] || return 77
      printf 'stop:%s\n' "$CONTAINER_ID" >>"$DOCKER_LOG"
      DOCKER_RUNNING=false
      return 0
    fi
    if [[ "$1" == "update" && "$2" == "--restart=no" && "$3" == "$CONTAINER_ID" ]]; then
      if [[ "$EXPECT_INTENT_ON_UPDATE" == "true" ]]; then
        [[ -f "$DEPLOY_ROOT/deployment-restart.json" ]] || return 78
      else
        [[ ! -e "$DEPLOY_ROOT/deployment-restart.json" ]] || return 79
      fi
      printf 'restart-policy:no:%s\n' "$3" >>"$DOCKER_LOG"
      INSPECTED_RESTART_POLICY=no
      return 0
    fi
    if [[ "$1" == "update" && "$2" == "--restart=always" && "$3" == "$CONTAINER_ID" ]]; then
      printf 'restart-policy:always:%s\n' "$3" >>"$DOCKER_LOG"
      INSPECTED_RESTART_POLICY=always
      return 0
    fi
    if [[ "$1" == "start" ]]; then
      [[ "$2" == "$CONTAINER_ID" ]] || return 74
      printf 'start:%s\n' "$2" >>"$DOCKER_LOG"
      DOCKER_RUNNING=true
      return 0
    fi
    if [[ "$1" == "rm" ]]; then
      [[ "${*: -1}" == "$CONTAINER_ID" ]] || return 75
      printf 'rm:%s\n' "$CONTAINER_ID" >>"$DOCKER_LOG"
      DOCKER_PRESENT=false
      return 0
    fi
    return 76
  }

  quiesce_web_container
  [[ "$OLD_WEB_ID" == "$CONTAINER_ID" ]] || fail "Quiescence did not retain the exact container ID."
  [[ "$OLD_WEB_IMAGE_ID" == "$IMAGE_ID" ]] || fail "Quiescence did not retain the exact image ID."
  [[ "$OLD_WEB_CONFIG_IMAGE" == "$CONFIG_IMAGE" ]] || fail "Quiescence did not retain the configured image identity."
  [[ "$OLD_WEB_WAS_RUNNING" == "true" && "$DOCKER_RUNNING" == "false" ]] || fail "The writer was not stopped."
  assert_line "stop:$CONTAINER_ID" "$DOCKER_LOG"
  assert_line "restart-policy:no:$CONTAINER_ID" "$DOCKER_LOG"
  [[ "$(grep -n -E 'restart-policy:no|stop:' "$DOCKER_LOG")" == $'1:restart-policy:no:'"$CONTAINER_ID"$'\n2:stop:'"$CONTAINER_ID" ]] || fail "The writer stopped before automatic restart was disabled."
  ! grep -q '^rm:' "$DOCKER_LOG" || fail "Quiescence removed the preserved container before migration."
  [[ -f "$DEPLOY_ROOT/deployment-restart.json" ]] || fail "A durable restart intent was not published."
  EXPECTED_ID="$CONTAINER_ID" EXPECTED_IMAGE="$IMAGE_ID" EXPECTED_CONFIG="$CONFIG_IMAGE" \
    "$PYTHON_BIN" - "$DEPLOY_ROOT/deployment-restart.json" <<'PY'
import json, os, sys
value = json.load(open(sys.argv[1], encoding="utf-8"))
assert value["containerId"] == os.environ["EXPECTED_ID"]
assert value["imageId"] == os.environ["EXPECTED_IMAGE"]
assert value["configImage"] == os.environ["EXPECTED_CONFIG"]
assert value["restartPolicy"] == "always"
PY

  DOCKER_PRESENT=true
  DOCKER_RUNNING=false
  INSPECTED_RESTART_POLICY=always
  EXPECT_INTENT_ON_UPDATE=false
  OLD_WEB_ID=""
  OLD_WEB_IMAGE_ID=""
  OLD_WEB_CONFIG_IMAGE=""
  OLD_WEB_WAS_RUNNING=false
  rm -f -- "$DEPLOY_ROOT/deployment-restart.json"
  : >"$DOCKER_LOG"
  quiesce_web_container
  [[ "$OLD_WEB_ID" == "$CONTAINER_ID" && "$OLD_WEB_IMAGE_ID" == "$IMAGE_ID" ]] || fail "A stopped preserved container was not accepted with exact identity."
  [[ "$OLD_WEB_WAS_RUNNING" == "false" ]] || fail "A previously stopped container was marked for restart."
  [[ ! -e "$DEPLOY_ROOT/deployment-restart.json" ]] || fail "A stopped container incorrectly created a restart intent."
  [[ "$INSPECTED_RESTART_POLICY" == "no" ]] || fail "A stopped preserved container retained an automatic restart policy."

  INSPECTED_IMAGE_ID="sha256:$(printf 'f%.0s' {1..64})"
  remove_preserved_web_container >/dev/null 2>&1 && fail "Cutover removed a container whose exact image identity changed."
  [[ "$DOCKER_PRESENT" == "true" ]] || fail "An identity mismatch removed the preserved container."
  INSPECTED_IMAGE_ID="$IMAGE_ID"
  remove_preserved_web_container
  [[ "$DOCKER_PRESENT" == "false" ]] || fail "The exact preserved container was not removed after migration."
  assert_line "rm:$CONTAINER_ID" "$DOCKER_LOG"

  DOCKER_PRESENT=true
  DOCKER_RUNNING=false
  : >"$DOCKER_LOG"

  DOCKER_LIST_FAIL=true
  quiesce_web_container >/dev/null 2>&1 && fail "A Docker enumeration failure was interpreted as no writer."
  DOCKER_LIST_FAIL=false
  DOCKER_RUNNING=true
  DOCKER_RUNNING_LIST_FAIL=true
  quiesce_web_container >/dev/null 2>&1 && fail "A Docker running-writer verification failure was accepted."
  DOCKER_RUNNING_LIST_FAIL=false
  INSPECTED_ID="$(printf 'e%.0s' {1..64})"
  quiesce_web_container >/dev/null 2>&1 && fail "A mismatched inspected container ID was accepted."
  INSPECTED_ID="$CONTAINER_ID"

  CANDIDATE_IMAGE_ID="$IMAGE_ID"
  INSPECTED_IMAGE_ID="$IMAGE_ID"
  INSPECTED_CONFIG_IMAGE="$DOCKER_IMAGE@$IMAGE_DIGEST"
  INSPECTED_RESTART_POLICY=no
  DOCKER_PRESENT=true
  DOCKER_RUNNING=true
  : >"$DOCKER_LOG"
  PROMOTION_PHASE_LOG="$TEST_ROOT/promotion-phase.log"
  : >"$PROMOTION_PHASE_LOG"
  write_phase() { printf 'phase:%s:%s:%s:%s\n' "$1" "${2:-}" "${3:-}" "${4:-}" >>"$PROMOTION_PHASE_LOG"; }
  record_candidate_promotion
  grep -Fxq "phase:candidate-healthy-pending-promotion:$CONTAINER_ID:$IMAGE_ID:$DOCKER_IMAGE@$IMAGE_DIGEST" "$PROMOTION_PHASE_LOG" || fail "Candidate promotion phase was not bound to exact identity."
  promote_candidate_restart_policy
  assert_line "restart-policy:always:$CONTAINER_ID" "$DOCKER_LOG"
  write_phase healthy
  [[ "$(tail -n 1 "$PROMOTION_PHASE_LOG")" == "phase:healthy:::" ]] || fail "Healthy was not recorded after restart promotion."

  INSPECTED_RESTART_POLICY=no
  INSPECTED_IMAGE_ID="sha256:$(printf 'f%.0s' {1..64})"
  : >"$DOCKER_LOG"
  promote_candidate_restart_policy >/dev/null 2>&1 && fail "A different candidate image was promoted to automatic restart."
  [[ ! -s "$DOCKER_LOG" ]] || fail "Candidate identity failure changed its restart policy."

  HEALTHCHECK_URL=http://127.0.0.1:1234/api/health
  SMOKE_TIMEOUT_SECONDS=7
  SMOKE_INTERVAL_SECONDS=0
  APP_VERSION=test-version
  SECONDS=0
  CURL_ARGS="$TEST_ROOT/curl-args.log"
  : >"$CURL_ARGS"
  curl() {
    printf '%s\n' "$*" >>"$CURL_ARGS"
    return 28
  }
  wait_for_health && fail "A stalled health request was accepted."
  grep -Eq -- '--disable .*--max-redirs 0 .*--connect-timeout 3 .*--max-time [1-7] http://127\.0\.0\.1:1234/api/health' "$CURL_ARGS" || fail "Health requests were not bounded and redirect-free."
  ! grep -Eq -- ' --location( |$)' "$CURL_ARGS" || fail "Health validation followed an untrusted redirect."

  SECONDS=0
  SMOKE_TIMEOUT_SECONDS=1
  curl() {
    "$PYTHON_BIN" -c 'import sys; sys.stdout.write("x" * 20000)'
  }
  wait_for_health && fail "An oversized candidate health response was accepted."

  TRANSITION_LOG="$TEST_ROOT/transition.log"
  : >"$TRANSITION_LOG"
  write_phase() { printf 'phase:%s\n' "$1" >>"$TRANSITION_LOG"; }
  clear_restart_intent() { printf '%s\n' clear-intent >>"$TRANSITION_LOG"; }
  compose() {
    [[ "$*" == "run --rm --no-deps migrate" ]] || return 80
    printf '%s\n' migrate >>"$TRANSITION_LOG"
    [[ "${MIGRATION_FAIL:-false}" != "true" ]]
  }
  remove_preserved_web_container() {
    printf '%s\n' remove-old >>"$TRANSITION_LOG"
    [[ "${REMOVE_FAIL:-false}" != "true" ]]
  }
  SCHEMA_TRANSITION_STARTED=false
  begin_schema_transition
  [[ "$SCHEMA_TRANSITION_STARTED" == "true" ]] || fail "Schema transition boundary was not armed."
  [[ "$(cat "$TRANSITION_LOG")" == $'phase:schema-transition\nclear-intent\nmigrate\nphase:migration-complete\nremove-old' ]] || fail "The preserved container was not retained through successful migration."

  : >"$TRANSITION_LOG"
  SCHEMA_TRANSITION_STARTED=false
  MIGRATION_FAIL=true
  begin_schema_transition >/dev/null 2>&1 && fail "A failed migration was accepted."
  [[ "$(cat "$TRANSITION_LOG")" == $'phase:schema-transition\nclear-intent\nmigrate' ]] || fail "A failed migration removed the preserved legacy container."

  : >"$TRANSITION_LOG"
  MIGRATION_FAIL=false
  REMOVE_FAIL=true
  OLD_WEB_WAS_RUNNING=true
  begin_schema_transition >/dev/null 2>&1 && fail "A failed exact legacy-container removal was accepted."
  [[ "$OLD_WEB_WAS_RUNNING" == "true" ]] || fail "Failed post-migration removal discarded the preserved-container state."
)

run_predeployment_identity_tests() (
  set -Eeuo pipefail
  export CONTROL_ROOT="$SCRIPT_ROOT"
  export DEPLOY_ROOT="$TEST_ROOT/predeployment"
  export DATA_DIR="$DEPLOY_ROOT/data"
  export BACKUP_DIR="$DEPLOY_ROOT/root-backup"
  export DB_FILE="$DATA_DIR/dev.db"
  export CONTAINER_NAME="gshsapp-web"
  export DOCKER_IMAGE="registry.example/gshsapp"
  export IMAGE_DIGEST="sha256:$(printf 'a%.0s' {1..64})"
  export OFFSITE_DIR="$TEST_ROOT/offsite"
  export OFFSITE_RECEIPT_DIR="$OFFSITE_DIR/.gshsapp-receipts"
  export OFFSITE_MOUNT_SOURCE="test-source"
  export OFFSITE_FSTYPE="ext4"
  export PYTHON_BIN
  export PRESERVED_WEB_ID="$CONTAINER_ID"
  export PRESERVED_WEB_IMAGE_ID="$IMAGE_ID"
  export PRESERVED_WEB_CONFIG_IMAGE="$CONFIG_IMAGE"
  mkdir -p "$DATA_DIR" "$BACKUP_DIR" "$OFFSITE_DIR" "$OFFSITE_RECEIPT_DIR"

  # shellcheck source=predeployment-backup.sh
  source "$SCRIPT_ROOT/predeployment-backup.sh"
  trap - EXIT

  DOCKER_FAIL=false
  ACTUAL_IMAGE="$IMAGE_ID"
  ACTUAL_RESTART_POLICY=no
  docker() {
    [[ "$DOCKER_FAIL" != "true" ]] || return 90
    local joined=" $* "
    if [[ "$1" == "ps" && "$joined" != *" --all "* ]]; then
      return 0
    fi
    if [[ "$1" == "ps" && "$joined" == *" --all "* ]]; then
      printf '%s\n' "$CONTAINER_ID"
      return 0
    fi
    if [[ "$1 $2" == "inspect --format" ]]; then
      case "$3" in
        *'.Id'*) printf '%s\n' "$CONTAINER_ID" ;;
        *'.HostConfig.RestartPolicy.Name'*) printf '%s\n' "$ACTUAL_RESTART_POLICY" ;;
        *'.Config.Image'*) printf '%s\n' "$CONFIG_IMAGE" ;;
        *'.Image'*) printf '%s\n' "$ACTUAL_IMAGE" ;;
        *'.State.Running'*) printf '%s\n' false ;;
        *'.Name'*) printf '%s\n' "/$CONTAINER_NAME" ;;
        *) return 91 ;;
      esac
      return 0
    fi
    return 92
  }

  assert_quiesced_writer
  ACTUAL_RESTART_POLICY=always
  assert_quiesced_writer >/dev/null 2>&1 && fail "Pre-deployment backup accepted an auto-restarting preserved container."
  ACTUAL_RESTART_POLICY=no
  ACTUAL_IMAGE="sha256:$(printf 'f%.0s' {1..64})"
  assert_quiesced_writer >/dev/null 2>&1 && fail "Pre-deployment backup accepted a different preserved image."
  ACTUAL_IMAGE="$IMAGE_ID"
  DOCKER_FAIL=true
  assert_quiesced_writer >/dev/null 2>&1 && fail "Pre-deployment backup accepted a Docker API failure."
  :
)

run_candidate_validator_tests() (
  set -Eeuo pipefail
  export CONTROL_ROOT="$SCRIPT_ROOT"
  export DEPLOY_ROOT="$TEST_ROOT/validator"
  export DATA_DIR="$DEPLOY_ROOT/data"
  export BACKUP_DIR="$DEPLOY_ROOT/root-backup"
  export DB_FILE="$DATA_DIR/dev.db"
  export DOCKER_IMAGE="registry.example/gshsapp"
  export IMAGE_DIGEST="sha256:$(printf 'a%.0s' {1..64})"
  export OFFSITE_DIR="$TEST_ROOT/offsite"
  export OFFSITE_RECEIPT_DIR="$OFFSITE_DIR/.gshsapp-receipts"
  export OFFSITE_MOUNT_SOURCE="test-source"
  export OFFSITE_FSTYPE="ext4"
  export PYTHON_BIN
  export TIMEOUT_BIN=timeout
  mkdir -p "$DATA_DIR" "$BACKUP_DIR" "$OFFSITE_DIR" "$OFFSITE_RECEIPT_DIR"

  # shellcheck source=predeployment-backup.sh
  source "$SCRIPT_ROOT/predeployment-backup.sh"
  trap - EXIT

  VALIDATION_ROOT="$DEPLOY_ROOT/.bootstrap-validate.test"
  mkdir -p "$VALIDATION_ROOT"
  archive_path="$BACKUP_DIR/backup-20260813-000000-aaaaaaaa.tar.gz"
  : >"$archive_path"
  VALIDATOR_LOG="$TEST_ROOT/validator.log"
  : >"$VALIDATOR_LOG"
  VALIDATOR_MARKER="$TEST_ROOT/validator-present"
  rm -f -- "$VALIDATOR_MARKER"
  VALIDATOR_START_FAIL=false
  VALIDATOR_OUTPUT_FAIL=false
  VALIDATOR_STREAM_FAIL=false
  VALIDATOR_RUNNING=false

  timeout() {
    printf 'timeout:' >>"$VALIDATOR_LOG"
    printf '%q ' "$@" >>"$VALIDATOR_LOG"
    printf '\n' >>"$VALIDATOR_LOG"
    while [[ "$1" == --* || "$1" == *s ]]; do shift; done
    "$@"
  }
  docker() {
    local joined=" $* "
    if [[ "$1" == "create" ]]; then
      [[ "$joined" == *" --tmpfs /output:rw,noexec,nosuid,nodev,size=768m,nr_inodes=12000,uid=61001,gid=61001,mode=0700 "* ]] || return 112
      [[ "$joined" != *"dst=/output"* ]] || return 113
      printf 'create:' >>"$VALIDATOR_LOG"
      printf '%q ' "$@" >>"$VALIDATOR_LOG"
      printf '\n' >>"$VALIDATOR_LOG"
      printf '%s\n' output-tmpfs:ok >>"$VALIDATOR_LOG"
      : >"$VALIDATOR_MARKER"
      printf '%s\n' "$CONTAINER_ID"
      return 0
    fi
    if [[ "$1 $2" == "inspect --format" ]]; then
      case "$3" in
        *'.Id'*) printf '%s\n' "$CONTAINER_ID" ;;
        *'.Name'*) printf '%s\n' "/$VALIDATION_CONTAINER_NAME" ;;
        *'io.gshsapp.backup-validator'*) printf '%s\n' "$VALIDATION_CONTAINER_NONCE" ;;
        *'json .Mounts'*) printf '%s\n' '[{"Type":"tmpfs","Source":"","Destination":"/output","Mode":"rw","RW":true,"Propagation":""}]' ;;
        *'json .HostConfig.Tmpfs'*) printf '%s\n' '{"/tmp":"rw,noexec,nosuid,nodev,size=64m,uid=61001,gid=61001,mode=1700","/output":"rw,noexec,nosuid,nodev,size=768m,nr_inodes=12000,uid=61001,gid=61001,mode=0700"}' ;;
        *'.State.Running'*) printf '%s\n' "$VALIDATOR_RUNNING" ;;
        *'.State.ExitCode'*) if [[ "$VALIDATOR_START_FAIL" == "true" ]]; then printf '%s\n' 1; else printf '%s\n' 0; fi ;;
        *'.Config.Image'*) printf '%s\n' "$DOCKER_IMAGE@$IMAGE_DIGEST" ;;
        *) return 110 ;;
      esac
      return 0
    fi
    if [[ "$1" == "start" && "$2" == "$CONTAINER_ID" ]]; then
      printf 'start:%s\n' "$2" >>"$VALIDATOR_LOG"
      [[ "$VALIDATOR_START_FAIL" != "true" ]] && VALIDATOR_RUNNING=true
      return 0
    fi
    if [[ "$1" == "rm" && "$2" == "--force" && "$3" == "$CONTAINER_ID" ]]; then
      printf 'rm:%s\n' "$3" >>"$VALIDATOR_LOG"
      rm -f -- "$VALIDATOR_MARKER"
      VALIDATOR_RUNNING=false
      return 0
    fi
    if [[ "$1" == "exec" && "$2" == "$CONTAINER_ID" ]]; then
      if [[ "$joined" == *" /tmp/gshsapp-validator-complete "* ]]; then
        printf '%s\n' exec:marker >>"$VALIDATOR_LOG"
        [[ "$VALIDATOR_RUNNING" == "true" ]]
        return
      fi
      if [[ "$joined" == *" /output/data/dev.db "* ]]; then
        printf '%s\n' exec:database-stream >>"$VALIDATOR_LOG"
        [[ "$VALIDATOR_RUNNING" == "true" && "$VALIDATOR_STREAM_FAIL" != "true" ]] || return 115
        printf 'SQLite format 3\000test'
        return 0
      fi
      printf '%s\n' exec:output-tree >>"$VALIDATOR_LOG"
      [[ "$VALIDATOR_RUNNING" == "true" && "$VALIDATOR_OUTPUT_FAIL" != "true" ]] || return 114
      printf '%s\n' ok
      return 0
    fi
    if [[ "$1" == "ps" && "$joined" == *" --all "* ]]; then
      [[ -e "$VALIDATOR_MARKER" ]] && printf '%s\n' "$CONTAINER_ID"
      return 0
    fi
    return 111
  }

  run_candidate_backup_validation
  assert_line output-tmpfs:ok "$VALIDATOR_LOG"
  grep -Eq '^create:.*--memory 1536m .*--memory-swap 1536m .*--pids-limit 128 .*--cpus 2 ' "$VALIDATOR_LOG" || fail "Candidate validation did not apply strict resource bounds."
  grep -Eq '^create:.*--log-driver none .*--network none .*--read-only .*--cap-drop ALL .*--security-opt no-new-privileges ' "$VALIDATOR_LOG" || fail "Candidate validation isolation changed."
  grep -Eq '^create:.*--user 61001:61001 ' "$VALIDATOR_LOG" || fail "Candidate validation did not use the reserved unprivileged identity."
  grep -Eq '^timeout:.*--signal=TERM .*--kill-after=10s .*60s docker start ' "$VALIDATOR_LOG" || fail "Candidate validation start was not externally time bounded."
  assert_line exec:marker "$VALIDATOR_LOG"
  assert_line exec:output-tree "$VALIDATOR_LOG"
  assert_line exec:database-stream "$VALIDATOR_LOG"
  assert_line "rm:$CONTAINER_ID" "$VALIDATOR_LOG"
  [[ ! -e "$VALIDATOR_MARKER" ]] || fail "Successful candidate validation left a container behind."
  [[ -s "$VALIDATION_ROOT/data/dev.db" ]] || fail "Candidate validation did not extract the reviewed database stream."

  rm -rf -- "$VALIDATION_ROOT/data"
  : >"$VALIDATOR_LOG"
  VALIDATOR_START_FAIL=true
  run_candidate_backup_validation >/dev/null 2>&1 && fail "A timed-out candidate validator was accepted."
  assert_line "rm:$CONTAINER_ID" "$VALIDATOR_LOG"
  [[ ! -e "$VALIDATOR_MARKER" ]] || fail "Failed candidate validation left a container behind."

  : >"$VALIDATOR_LOG"
  VALIDATOR_START_FAIL=false
  VALIDATOR_OUTPUT_FAIL=true
  run_candidate_backup_validation >/dev/null 2>&1 && fail "A failed bounded tmpfs output verification was accepted."
  assert_line "rm:$CONTAINER_ID" "$VALIDATOR_LOG"
  [[ ! -e "$VALIDATOR_MARKER" ]] || fail "Failed candidate output verification left a container behind."

  : >"$VALIDATOR_LOG"
  VALIDATOR_OUTPUT_FAIL=false
  VALIDATOR_STREAM_FAIL=true
  run_candidate_backup_validation >/dev/null 2>&1 && fail "A failed bounded database stream was accepted."
  assert_line exec:database-stream "$VALIDATOR_LOG"
  assert_line "rm:$CONTAINER_ID" "$VALIDATOR_LOG"
  [[ ! -e "$VALIDATOR_MARKER" ]] || fail "Failed candidate database streaming left a container behind."
)

run_recovery_tests() (
  set -Eeuo pipefail
  export DEPLOY_ROOT="$TEST_ROOT/recovery"
  export LOCK_FILE="$TEST_ROOT/recovery-lifecycle.lock"
  export PYTHON_BIN
  mkdir -p "$DEPLOY_ROOT"

  # shellcheck source=recover-deployment-writer.sh
  source "$SCRIPT_ROOT/recover-deployment-writer.sh"

  RECOVERY_LOG="$TEST_ROOT/recovery.log"
  : >"$RECOVERY_LOG"
  ACTUAL_ID="$CONTAINER_ID"
  ACTUAL_IMAGE="$IMAGE_ID"
  ACTUAL_CONFIG="$CONFIG_IMAGE"
  ACTUAL_RUNNING=false
  ACTUAL_RESTART_POLICY=no
  RECOVERY_CONTAINER_PRESENT=false
  id() { [[ "$1" == "-u" ]] && printf '%s\n' 0; }
  install() { mkdir -p "${*: -1}"; }
  flock() { printf '%s\n' lock >>"$RECOVERY_LOG"; }
  sync() { :; }
  docker() {
    local joined=" $* "
    if [[ "$1" == "ps" && "$joined" == *" --all "* ]]; then
      [[ "$RECOVERY_CONTAINER_PRESENT" == "true" ]] && printf '%s\n' "$CONTAINER_ID"
      return 0
    fi
    if [[ "$1 $2" == "inspect --format" ]]; then
      case "$3" in
        *'.Id'*) printf '%s\n' "$ACTUAL_ID" ;;
        *'com.docker.compose.project'*) printf '%s\n' gshsapp ;;
        *'com.docker.compose.service'*) printf '%s\n' web ;;
        *'.HostConfig.RestartPolicy.Name'*) printf '%s\n' "$ACTUAL_RESTART_POLICY" ;;
        *'.Name'*) printf '%s\n' /gshsapp-web ;;
        *'.Config.Image'*) printf '%s\n' "$ACTUAL_CONFIG" ;;
        *'.Image'*) printf '%s\n' "$ACTUAL_IMAGE" ;;
        *'.State.Running'*) printf '%s\n' "$ACTUAL_RUNNING" ;;
        *) return 100 ;;
      esac
      return 0
    fi
    if [[ "$1" == "start" && "$2" == "$CONTAINER_ID" ]]; then
      printf 'start:%s\n' "$2" >>"$RECOVERY_LOG"
      ACTUAL_RUNNING=true
      return 0
    fi
    if [[ "$1" == "update" && "$2" == "--restart=always" && "$3" == "$CONTAINER_ID" ]]; then
      printf 'restart-policy:always:%s\n' "$3" >>"$RECOVERY_LOG"
      ACTUAL_RESTART_POLICY=always
      return 0
    fi
    if [[ "$1" == "update" && "$2" == "--restart=no" && "$3" == "$CONTAINER_ID" ]]; then
      printf 'restart-policy:no:%s\n' "$3" >>"$RECOVERY_LOG"
      ACTUAL_RESTART_POLICY=no
      return 0
    fi
    if [[ "$1" == "stop" && "$2" == "--time" && "$4" == "$CONTAINER_ID" ]]; then
      printf 'stop:%s\n' "$4" >>"$RECOVERY_LOG"
      ACTUAL_RUNNING=false
      return 0
    fi
    return 101
  }

  write_recovery_files() {
    local phase="$1"
    PHASE="$phase" CONTAINER_ID_VALUE="$CONTAINER_ID" IMAGE_ID_VALUE="$IMAGE_ID" CONFIG_IMAGE_VALUE="$CONFIG_IMAGE" \
      "$PYTHON_BIN" - "$DEPLOY_ROOT/deployment-phase.json" "$DEPLOY_ROOT/deployment-restart.json" <<'PY'
import datetime, json, os, sys
now = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
with open(sys.argv[1], "w", encoding="utf-8") as output:
    json.dump({"format":"gshsapp-deployment-phase","version":1,"phase":os.environ["PHASE"],"imageTag":"sha-"+"0"*40,"imageDigest":"sha256:"+"a"*64,"updatedAt":now}, output, separators=(",",":")); output.write("\n")
with open(sys.argv[2], "w", encoding="utf-8") as output:
    json.dump({"format":"gshsapp-restart-intent","version":2,"phase":"restart-old-on-failure","containerId":os.environ["CONTAINER_ID_VALUE"],"imageId":os.environ["IMAGE_ID_VALUE"],"configImage":os.environ["CONFIG_IMAGE_VALUE"],"restartPolicy":"always","createdAt":now}, output, separators=(",",":")); output.write("\n")
PY
  }

  write_recovery_files pre-migration-ready
  unset LIFECYCLE_LOCK_HELD
  recover_deployment_writer_main
  assert_line lock "$RECOVERY_LOG"
  assert_line "restart-policy:always:$CONTAINER_ID" "$RECOVERY_LOG"
  assert_line "start:$CONTAINER_ID" "$RECOVERY_LOG"
  [[ ! -e "$DEPLOY_ROOT/deployment-restart.json" ]] || fail "Recovered deployment intent was not cleared."

  : >"$RECOVERY_LOG"
  ACTUAL_RUNNING=false
  ACTUAL_RESTART_POLICY=no
  ACTUAL_ID="$(printf 'e%.0s' {1..64})"
  write_recovery_files pre-migration-ready
  recover_deployment_writer_main >/dev/null 2>&1 && fail "Recovery restarted a different container ID."
  [[ -e "$DEPLOY_ROOT/deployment-restart.json" ]] || fail "Failed recovery destroyed its forensic intent."
  ! grep -q '^start:' "$RECOVERY_LOG" || fail "Failed identity validation started a container."

  : >"$RECOVERY_LOG"
  ACTUAL_ID="$CONTAINER_ID"
  ACTUAL_RUNNING=false
  ACTUAL_RESTART_POLICY=no
  write_recovery_files schema-transition
  LIFECYCLE_LOCK_HELD=1 recover_deployment_writer_main
  [[ ! -s "$RECOVERY_LOG" ]] || fail "Lock-held post-schema reconciliation restarted the legacy writer or reacquired the lock."
  [[ ! -e "$DEPLOY_ROOT/deployment-restart.json" ]] || fail "Post-schema reconciliation did not clear stale restart intent."

  : >"$RECOVERY_LOG"
  RECOVERY_CONTAINER_PRESENT=true
  ACTUAL_RUNNING=true
  ACTUAL_RESTART_POLICY=always
  write_recovery_files migration-complete
  rm -f -- "$DEPLOY_ROOT/deployment-restart.json"
  LIFECYCLE_LOCK_HELD=1 recover_deployment_writer_main
  assert_line "restart-policy:no:$CONTAINER_ID" "$RECOVERY_LOG"
  assert_line "stop:$CONTAINER_ID" "$RECOVERY_LOG"
  ! grep -q '^start:' "$RECOVERY_LOG" || fail "Post-schema crash recovery restarted an unaccepted candidate."
  RECOVERY_CONTAINER_PRESENT=false

  : >"$RECOVERY_LOG"
  RECOVERY_CONTAINER_PRESENT=true
  ACTUAL_RUNNING=true
  ACTUAL_RESTART_POLICY=no
  "$PYTHON_BIN" - "$DEPLOY_ROOT/deployment-phase.json" <<PY
import datetime, json, sys
now=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00","Z")
json.dump({"format":"gshsapp-deployment-phase","version":2,"phase":"candidate-healthy-pending-promotion","imageTag":"sha-"+"0"*40,"imageDigest":"sha256:"+"a"*64,"containerId":"$CONTAINER_ID","imageId":"$IMAGE_ID","configImage":"$CONFIG_IMAGE","updatedAt":now},open(sys.argv[1],"w",encoding="utf-8"),separators=(",",":"))
PY
  LIFECYCLE_LOCK_HELD=1 recover_deployment_writer_main
  assert_line "restart-policy:always:$CONTAINER_ID" "$RECOVERY_LOG"
  PHASE_FILE_VALUE="$DEPLOY_ROOT/deployment-phase.json" "$PYTHON_BIN" - <<'PY'
import json, os
value=json.load(open(os.environ["PHASE_FILE_VALUE"],encoding="utf-8"))
assert value["phase"] == "healthy"
PY

  : >"$RECOVERY_LOG"
  ACTUAL_RUNNING=false
  ACTUAL_RESTART_POLICY=no
  "$PYTHON_BIN" - "$DEPLOY_ROOT/deployment-phase.json" <<PY
import datetime, json, sys
now=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00","Z")
json.dump({"format":"gshsapp-deployment-phase","version":2,"phase":"candidate-healthy-pending-promotion","imageTag":"sha-"+"0"*40,"imageDigest":"sha256:"+"a"*64,"containerId":"$CONTAINER_ID","imageId":"$IMAGE_ID","configImage":"$CONFIG_IMAGE","updatedAt":now},open(sys.argv[1],"w",encoding="utf-8"),separators=(",",":"))
PY
  if LIFECYCLE_LOCK_HELD=1 recover_deployment_writer_main >/dev/null 2>&1; then
    fail "A stopped pending-promotion candidate was silently accepted."
  fi
  PHASE_FILE_VALUE="$DEPLOY_ROOT/deployment-phase.json" "$PYTHON_BIN" - <<'PY'
import json, os
value=json.load(open(os.environ["PHASE_FILE_VALUE"],encoding="utf-8"))
assert value["phase"] == "migration-complete"
PY
  ! grep -q '^restart-policy:always:' "$RECOVERY_LOG" || fail "Stopped pending candidate was promoted without a new health gate."
  RECOVERY_CONTAINER_PRESENT=false

  mkdir "$DEPLOY_ROOT/deployment-restart.json"
  LIFECYCLE_LOCK_HELD=1 recover_deployment_writer_main >/dev/null 2>&1 && fail "An unsafe existing deployment intent was treated as absent."
  rmdir "$DEPLOY_ROOT/deployment-restart.json"
)

run_deploy_function_tests
run_predeployment_identity_tests
run_candidate_validator_tests
run_recovery_tests
printf '%s\n' "Deploy lifecycle tests passed."
