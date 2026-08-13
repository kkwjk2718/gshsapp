#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_ROOT="$(mktemp -d)"
trap 'rm -rf -- "$TEST_ROOT"' EXIT

if [[ -n "${PYTHON_BIN:-}" ]]; then
  PYTHON="$PYTHON_BIN"
elif command -v python3 >/dev/null 2>&1; then
  PYTHON=python3
else
  PYTHON=python
fi
NODE_BIN="${NODE_BIN:-$(command -v node)}"
export REPO_ROOT NODE_BIN
[[ -f "$REPO_ROOT/.next/standalone/.next/ops/validate-backup.mjs" ]] || {
  echo "Run npm run build:ops before this integration test." >&2
  exit 1
}

FAKE_BIN="$TEST_ROOT/bin"
mkdir -p "$FAKE_BIN"
cat >"$FAKE_BIN/docker" <<'FAKE'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%q ' "$@" >>"$DOCKER_LOG"
printf '\n' >>"$DOCKER_LOG"

if [[ "${1:-}" == "container" && "${2:-}" == "inspect" ]]; then
  if [[ " $* " == *" --format "* ]]; then
    printf 'true\n'
  fi
  exit 0
fi

if [[ "${1:-}" == "exec" ]]; then
  if [[ " $* " == *" test -f /app/.next/ops/run-scheduled-backup.mjs "* ]]; then
    [[ "${OLD_HAS_OPS:-0}" == "1" ]]
    exit
  fi
  if [[ " $* " == *" node /app/.next/ops/run-scheduled-backup.mjs --force "* ]]; then
    [[ "${OLD_HAS_OPS:-0}" == "1" ]] || exit 90
    exit 0
  fi
  exit 91
fi

if [[ "${1:-}" == "run" ]]; then
  [[ "${FAIL_VALIDATION:-0}" != "1" ]] || exit 92
  [[ " $* " == *" --network none "* ]]
  [[ " $* " == *" --read-only "* ]]
  [[ " $* " == *" --cap-drop ALL "* ]]
  [[ " $* " == *" --security-opt no-new-privileges "* ]]
  [[ " $* " == *" $EXPECTED_IMAGE_REF "* ]]
  [[ " $* " == *" node .next/ops/validate-backup.mjs /input/bootstrap.tar.gz /output --migrate-reviewed-input "* ]]

  input=""
  output=""
  for argument in "$@"; do
    case "$argument" in
      type=bind,src=*,dst=/input/bootstrap.tar.gz,readonly)
        input="${argument#type=bind,src=}"
        input="${input%%,dst=*}"
        ;;
      type=bind,src=*,dst=/output)
        output="${argument#type=bind,src=}"
        output="${output%%,dst=*}"
        ;;
      *"src=$LIVE_DATA_DIR"*|*"src=$LIVE_DATABASE"*)
        echo "Candidate validation received a live data mount." >&2
        exit 93
        ;;
    esac
  done
  [[ -n "$input" && -f "$input" && -n "$output" && -d "$output" ]]
  "$NODE_BIN" "$REPO_ROOT/.next/standalone/.next/ops/validate-backup.mjs" \
    "$input" "$output" --migrate-reviewed-input
  exit 0
fi

exit 94
FAKE
chmod 700 "$FAKE_BIN/docker"

DATA_DIR="$TEST_ROOT/data"
mkdir -p "$DATA_DIR"
LIVE_DATABASE="$DATA_DIR/dev.db"
"$PYTHON" - "$LIVE_DATABASE" "$REPO_ROOT/prisma/migrations/20260813000000_baseline/migration.sql" <<'PY'
import pathlib
import sqlite3
import sys

database = pathlib.Path(sys.argv[1])
migration = pathlib.Path(sys.argv[2]).read_text(encoding="utf-8").replace("\r\n", "\n")
connection = sqlite3.connect(database)
connection.executescript(migration)
connection.close()
PY

export PATH="$FAKE_BIN:$PATH"
export PYTHON_BIN="$PYTHON"
export DATA_DIR LIVE_DATABASE
export DB_FILE="$LIVE_DATABASE"
export CONTAINER_NAME=gshsapp-web
export DOCKER_IMAGE=example.invalid/gshsapp
export IMAGE_DIGEST="sha256:$(printf 'a%.0s' {1..64})"
export EXPECTED_IMAGE_REF="$DOCKER_IMAGE@$IMAGE_DIGEST"
export LIVE_DATA_DIR="$DATA_DIR"

BACKUP_DIR="$TEST_ROOT/bootstrap-success"
DOCKER_LOG="$TEST_ROOT/bootstrap-success.log"
export BACKUP_DIR DOCKER_LOG
mkdir -p "$BACKUP_DIR"
bash "$REPO_ROOT/deploy/predeployment-backup.sh"
[[ "$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'backup-*.tar.gz' | wc -l)" -eq 1 ]]
[[ "$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'backup-*.tar.gz.json' | wc -l)" -eq 1 ]]
grep -q '^run ' "$DOCKER_LOG"
if grep -q 'run-scheduled-backup.mjs --force' "$DOCKER_LOG"; then
  echo "Legacy bootstrap unexpectedly used a missing trusted-container operation." >&2
  exit 1
fi

BACKUP_DIR="$TEST_ROOT/trusted-success"
DOCKER_LOG="$TEST_ROOT/trusted-success.log"
OLD_HAS_OPS=1
export BACKUP_DIR DOCKER_LOG OLD_HAS_OPS
mkdir -p "$BACKUP_DIR"
bash "$REPO_ROOT/deploy/predeployment-backup.sh"
[[ -z "$(find "$BACKUP_DIR" -maxdepth 1 -type f -print -quit)" ]]
grep -q 'run-scheduled-backup.mjs --force' "$DOCKER_LOG"
if grep -q '^run ' "$DOCKER_LOG"; then
  echo "Trusted-container backup unexpectedly used the bootstrap validator." >&2
  exit 1
fi
unset OLD_HAS_OPS

BACKUP_DIR="$TEST_ROOT/validation-failure"
DOCKER_LOG="$TEST_ROOT/validation-failure.log"
FAIL_VALIDATION=1
export BACKUP_DIR DOCKER_LOG FAIL_VALIDATION
mkdir -p "$BACKUP_DIR"
if bash "$REPO_ROOT/deploy/predeployment-backup.sh" >"$TEST_ROOT/validation-failure.output" 2>&1; then
  echo "A failed isolated validation must abort deployment backup creation." >&2
  exit 1
fi
grep -q "Isolated bootstrap backup validation failed" "$TEST_ROOT/validation-failure.output"
[[ -z "$(find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -print -quit)" ]]

echo "Pre-deployment backup integration checks passed."
