#!/usr/bin/env bash
set -Eeuo pipefail

TEST_ROOT="$(mktemp -d)"
trap 'rm -rf -- "$TEST_ROOT"' EXIT
export EXPECTED_APP_ORIGIN="https://test.gshs.app"
export IMAGE_TAG="sha-0123456789abcdef0123456789abcdef01234567"
export IMAGE_DIGEST="sha256:$(printf 'a%.0s' {1..64})"
export CONTAINER_NAME="gshsapp-web"

# shellcheck source=deploy.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/deploy.sh"

DOCKER_LOG="$TEST_ROOT/docker.log"
docker() {
  case "$1 $2" in
    "ps --all")
      [[ "${DOCKER_API_FAIL:-0}" != "1" ]] || return 70
      if [[ " $* " == *" label=com.docker.compose.service=web "* ]]; then
        printf '%s\n' "container-id"
      elif [[ " $* " == *" id=container-id "* ]] && ! grep -q '^rm:' "$DOCKER_LOG" 2>/dev/null; then
        printf '%s\n' "container-id"
      fi
      ;;
    "inspect --format")
      if [[ "$3" == *".State.Running"* ]]; then
        printf '%s\n' "${DOCKER_RUNNING:-true}"
      elif [[ "$3" == *".Image"* ]]; then
        printf 'sha256:%064d\n' 0
      else
        printf '%s\n' "/gshsapp-web"
      fi
      ;;
    "stop --time")
      printf '%s\n' "stop:$4" >>"$DOCKER_LOG"
      ;;
    "rm container-id")
      printf '%s\n' "rm:$2" >>"$DOCKER_LOG"
      ;;
    *)
      printf 'Unexpected docker invocation: %q ' "$@" >&2
      printf '\n' >&2
      return 1
      ;;
  esac
}

remove_web_container "test-migration"
grep -Fxq "stop:container-id" "$DOCKER_LOG"
grep -Fxq "rm:container-id" "$DOCKER_LOG"

: >"$DOCKER_LOG"
DOCKER_RUNNING=false
TRUSTED_BACKUP_IMAGE_ID=""
TRUSTED_BACKUP_HAS_OPS="false"
capture_trusted_backup_runtime
[[ -z "$TRUSTED_BACKUP_IMAGE_ID" && "$TRUSTED_BACKUP_HAS_OPS" == "false" ]]
remove_web_container "interrupted-deployment-retry"
grep -Fxq "rm:container-id" "$DOCKER_LOG"
unset DOCKER_RUNNING

DOCKER_API_FAIL=1
if capture_trusted_backup_runtime >/dev/null 2>&1 || remove_web_container "api-failure" >/dev/null 2>&1; then
  echo "Docker API failures must not be interpreted as an absent writer" >&2
  exit 1
fi
unset DOCKER_API_FAIL

docker() {
  case "$1 $2" in
    "ps --all") printf '%s\n' "container-id" ;;
    "inspect --format") printf '%s\n' "/unexpected-name" ;;
    *) return 1 ;;
  esac
}
if remove_web_container "identity-mismatch" >/dev/null 2>&1; then
  echo "Expected mismatched container identity to fail closed" >&2
  exit 1
fi

printf '%s\n' "Deploy quiescence tests passed."
