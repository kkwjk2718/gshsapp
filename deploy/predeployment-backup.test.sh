#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_ROOT="$(mktemp -d)"
trap 'rm -rf -- "$TEST_ROOT"' EXIT

export CONTROL_ROOT="$SCRIPT_ROOT"
export DEPLOY_ROOT="$TEST_ROOT/deploy"
export DATA_DIR="$DEPLOY_ROOT/data"
export BACKUP_DIR="$DEPLOY_ROOT/root-backup"
export DB_FILE="$DATA_DIR/dev.db"
export OFFSITE_DIR="$TEST_ROOT/offsite"
export OFFSITE_RECEIPT_DIR="$OFFSITE_DIR/.gshsapp-receipts"
export OFFSITE_MOUNT_SOURCE=test-offsite
export OFFSITE_FSTYPE=ext4
export DOCKER_IMAGE=example.invalid/gshsapp
export IMAGE_DIGEST="sha256:$(printf 'a%.0s' {1..64})"
mkdir -p "$DATA_DIR" "$BACKUP_DIR" "$OFFSITE_RECEIPT_DIR"
: >"$DB_FILE"

# shellcheck source=predeployment-backup.sh
source "$SCRIPT_ROOT/predeployment-backup.sh"

readonly TEST_CONTAINER_ID="$(printf 'b%.0s' {1..64})"
readonly TEST_IMAGE_ID="sha256:$(printf 'c%.0s' {1..64})"
readonly TEST_CONFIG_IMAGE="example.invalid/gshsapp@sha256:$(printf 'd%.0s' {1..64})"
DOCKER_MODE=stopped

docker() {
  local arguments=" $* "
  if [[ "$DOCKER_MODE" == "api-failure" && "${1:-}" == "ps" ]]; then return 70; fi
  if [[ "${1:-}" == "ps" ]]; then
    if [[ "$arguments" == *" --all "* ]]; then
      [[ "$DOCKER_MODE" == "absent" ]] || printf '%s\n' "$TEST_CONTAINER_ID"
    elif [[ "$DOCKER_MODE" == "running" ]]; then
      printf '%s\n' "$TEST_CONTAINER_ID"
    fi
    return 0
  fi
  if [[ "${1:-}" == "inspect" ]]; then
    case "$arguments" in
      *" {{.Id}} "*) printf '%s\n' "$TEST_CONTAINER_ID" ;;
      *" {{.Image}} "*) printf '%s\n' "$TEST_IMAGE_ID" ;;
      *" {{.Config.Image}} "*) printf '%s\n' "$TEST_CONFIG_IMAGE" ;;
      *" {{.State.Running}} "*) [[ "$DOCKER_MODE" == "running" ]] && printf 'true\n' || printf 'false\n' ;;
      *" {{.Name}} "*) printf '%s\n' '/gshsapp-web' ;;
      *" {{.HostConfig.RestartPolicy.Name}} "*) printf '%s\n' 'no' ;;
      *) return 71 ;;
    esac
    return 0
  fi
  return 72
}

PRESERVED_WEB_ID="$TEST_CONTAINER_ID"
PRESERVED_WEB_IMAGE_ID="$TEST_IMAGE_ID"
PRESERVED_WEB_CONFIG_IMAGE="$TEST_CONFIG_IMAGE"
assert_quiesced_writer

DOCKER_MODE=running
if assert_quiesced_writer >/dev/null 2>&1; then
  printf '%s\n' "A running writer must be rejected." >&2
  exit 1
fi

DOCKER_MODE=api-failure
if assert_quiesced_writer >/dev/null 2>&1; then
  printf '%s\n' "A Docker API failure must be fail-closed." >&2
  exit 1
fi

DOCKER_MODE=absent
PRESERVED_WEB_ID=""
PRESERVED_WEB_IMAGE_ID=""
PRESERVED_WEB_CONFIG_IMAGE=""
assert_quiesced_writer

SOURCE="$(<"$SCRIPT_ROOT/predeployment-backup.sh")"
[[ "$SOURCE" == *'run_validator_docker create'* ]]
[[ "$SOURCE" == *'--tmpfs "/output:rw,noexec,nosuid,nodev,size=768m,nr_inodes=12000'* ]]
[[ "$SOURCE" == *'--memory 1536m'* && "$SOURCE" == *'--pids-limit 128'* && "$SOURCE" == *'--cpus 2'* ]]
[[ "$SOURCE" == *'raw=sys.stdin.buffer.read(4)'* ]]
[[ "$SOURCE" == *'O_EXCL'* && "$SOURCE" == *'O_NOFOLLOW'* ]]
[[ "$SOURCE" == *'2>/dev/null'* ]]
[[ "$SOURCE" != *'type=bind,src=$VALIDATION_ROOT,dst=/output'* ]]
[[ "$SOURCE" == *'validate-operations-config.py" deploy'* ]]
[[ "$SOURCE" == *'--verify-pinned-offsite'* ]]
[[ "$SOURCE" == *'GSHSAPP_OFFSITE_PINNED'* ]]
[[ "$SOURCE" != *'offsite_source="$(findmnt'* ]]

printf '%s\n' "Pre-deployment backup boundary checks passed."
