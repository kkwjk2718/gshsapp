#!/usr/bin/env bash
set -Eeuo pipefail

DEPLOY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_COMPOSE_FILE="${SOURCE_COMPOSE_FILE:-$DEPLOY_ROOT/compose.yml}"
SOURCE_ENV_FILE="${SOURCE_ENV_FILE:-$DEPLOY_ROOT/.env}"
DATA_DIR="${DATA_DIR:-$DEPLOY_ROOT/data}"
BACKUP_DIR="${BACKUP_DIR:-$DEPLOY_ROOT/backup}"
DB_FILE="${DB_FILE:-$DATA_DIR/dev.db}"

IMAGE_TAG="${IMAGE_TAG:?IMAGE_TAG is required}"
DOCKER_IMAGE="${DOCKER_IMAGE:-kkwjk2718git/gshsapp}"
APP_VERSION="${APP_VERSION:-$IMAGE_TAG}"
RESTORE_DRILL_PORT="${RESTORE_DRILL_PORT:-1235}"
BACKUP_MAX_AGE_HOURS="${BACKUP_MAX_AGE_HOURS:-24}"
HOST_BIND_IP="${HOST_BIND_IP:-127.0.0.1}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
SMOKE_TIMEOUT_SECONDS="${SMOKE_TIMEOUT_SECONDS:-90}"
SMOKE_INTERVAL_SECONDS="${SMOKE_INTERVAL_SECONDS:-3}"
RESTORE_DRILL_OUTPUT_FILE="${RESTORE_DRILL_OUTPUT_FILE:-}"
E2E_ADMIN_USER="${E2E_ADMIN_USER:?E2E_ADMIN_USER is required}"
E2E_ADMIN_PASSWORD="${E2E_ADMIN_PASSWORD:?E2E_ADMIN_PASSWORD is required}"

RESTORE_BASE_URL="http://${HOST_BIND_IP}:${RESTORE_DRILL_PORT}"
TEMP_DIR=""
PROJECT_NAME=""
CONTAINER_NAME=""
DEPLOY_ENV_FILE=""
COMPOSE_FILE=""
RUNTIME_ENV_FILE=""
LATEST_BACKUP_PATH=""
LATEST_BACKUP_NAME="none"
RESTORE_SOURCE_PATH=""
RESTORE_SOURCE_NAME=""

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

compose() {
  docker compose \
    --project-name "$PROJECT_NAME" \
    --env-file "$DEPLOY_ENV_FILE" \
    -f "$COMPOSE_FILE" \
    "$@"
}

cleanup() {
  if [[ -n "$PROJECT_NAME" && -n "$COMPOSE_FILE" && -n "$DEPLOY_ENV_FILE" ]]; then
    compose down --remove-orphans --volumes >/dev/null 2>&1 || true
  fi

  if [[ -n "$TEMP_DIR" && -d "$TEMP_DIR" ]]; then
    rm -rf "$TEMP_DIR"
  fi
}

trap cleanup EXIT

write_runtime_env() {
  if [[ ! -f "$SOURCE_ENV_FILE" ]]; then
    echo "Missing source env file: $SOURCE_ENV_FILE" >&2
    exit 1
  fi

  grep -v -E '^(AUTH_URL|NEXTAUTH_URL|NEXT_PUBLIC_APP_URL|DATABASE_URL)=' "$SOURCE_ENV_FILE" >"$RUNTIME_ENV_FILE" || true

  cat >>"$RUNTIME_ENV_FILE" <<EOF
AUTH_URL=$RESTORE_BASE_URL
NEXTAUTH_URL=$RESTORE_BASE_URL
NEXT_PUBLIC_APP_URL=$RESTORE_BASE_URL
DATABASE_URL=file:/app/data/dev.db
EOF
}

write_compose_env() {
  cat >"$DEPLOY_ENV_FILE" <<EOF
IMAGE_TAG=$IMAGE_TAG
DOCKER_IMAGE=$DOCKER_IMAGE
APP_VERSION=$APP_VERSION
HOST_BIND_IP=$HOST_BIND_IP
HOST_PORT=$RESTORE_DRILL_PORT
CONTAINER_NAME=$CONTAINER_NAME
BACKUP_MAX_AGE_HOURS=$BACKUP_MAX_AGE_HOURS
EOF
}

select_latest_backup() {
  local selection

  selection="$(
    BACKUP_DIR="$BACKUP_DIR" BACKUP_MAX_AGE_HOURS="$BACKUP_MAX_AGE_HOURS" "$PYTHON_BIN" - <<'PY'
from pathlib import Path
import os
import time

backup_dir = Path(os.environ["BACKUP_DIR"])
threshold_seconds = float(os.environ["BACKUP_MAX_AGE_HOURS"]) * 60 * 60

if not backup_dir.exists():
    print("")
    raise SystemExit(0)

candidates = []
for item in backup_dir.iterdir():
    if not item.is_file():
        continue
    if item.name.endswith(".tar.gz") or item.name.endswith(".db") or item.name.endswith(".bak"):
        candidates.append(item)

if not candidates:
    print("")
    raise SystemExit(0)

latest = max(candidates, key=lambda candidate: candidate.stat().st_mtime)
age_seconds = time.time() - latest.stat().st_mtime
is_fresh = age_seconds <= threshold_seconds
print(str(latest))
print(latest.name)
print("1" if is_fresh else "0")
PY
  )"

  if [[ -z "$selection" ]]; then
    return 1
  fi

  mapfile -t selection_lines <<<"$selection"
  LATEST_BACKUP_PATH="${selection_lines[0]}"
  LATEST_BACKUP_NAME="${selection_lines[1]}"
  LATEST_BACKUP_IS_FRESH="${selection_lines[2]}"
  return 0
}

prepare_restore_source() {
  local source_kind

  if select_latest_backup && [[ "${LATEST_BACKUP_IS_FRESH:-0}" == "1" ]]; then
    RESTORE_SOURCE_PATH="$LATEST_BACKUP_PATH"
    RESTORE_SOURCE_NAME="$LATEST_BACKUP_NAME"
    source_kind="fresh backup"
  elif [[ -f "$DB_FILE" ]]; then
    RESTORE_SOURCE_PATH="$DB_FILE"
    RESTORE_SOURCE_NAME="$(basename "$DB_FILE")"
    source_kind="live database copy"
  elif [[ -n "$LATEST_BACKUP_PATH" ]]; then
    RESTORE_SOURCE_PATH="$LATEST_BACKUP_PATH"
    RESTORE_SOURCE_NAME="$LATEST_BACKUP_NAME"
    source_kind="stale backup"
  else
    echo "No restore source is available. Checked $BACKUP_DIR and $DB_FILE." >&2
    exit 1
  fi

  mkdir -p "$TEMP_DIR/data" "$TEMP_DIR/backup"

  case "$RESTORE_SOURCE_PATH" in
    *.tar.gz)
      tar -xzf "$RESTORE_SOURCE_PATH" -C "$TEMP_DIR"
      ;;
    *.db|*.bak)
      cp "$RESTORE_SOURCE_PATH" "$TEMP_DIR/data/dev.db"
      ;;
    *)
      echo "Unsupported restore source: $RESTORE_SOURCE_PATH" >&2
      exit 1
      ;;
  esac

  if [[ ! -f "$TEMP_DIR/data/dev.db" ]]; then
    echo "Restore drill did not produce $TEMP_DIR/data/dev.db" >&2
    exit 1
  fi

  echo "Using $source_kind for restore drill: $RESTORE_SOURCE_NAME"
}

wait_for_health() {
  local deadline=$((SECONDS + SMOKE_TIMEOUT_SECONDS))
  local health_json

  while (( SECONDS < deadline )); do
    if health_json="$(curl --silent --show-error --fail --location "$RESTORE_BASE_URL/api/health" 2>/dev/null)"; then
      if EXPECTED_VERSION="$APP_VERSION" HEALTH_JSON="$health_json" "$PYTHON_BIN" - <<'PY'
import json
import os
import sys

payload = json.loads(os.environ["HEALTH_JSON"])
if payload.get("ok") is not True:
    sys.exit(1)
if payload.get("service") != "gshsapp":
    sys.exit(1)
if payload.get("version") != os.environ["EXPECTED_VERSION"]:
    sys.exit(1)
PY
      then
        return 0
      fi
    fi

    sleep "$SMOKE_INTERVAL_SECONDS"
  done

  return 1
}

verify_admin_login() {
  RESTORE_BASE_URL="$RESTORE_BASE_URL" \
  E2E_ADMIN_USER="$E2E_ADMIN_USER" \
  E2E_ADMIN_PASSWORD="$E2E_ADMIN_PASSWORD" \
  "$PYTHON_BIN" - <<'PY'
import json
import os
import urllib.parse
import urllib.request
from http.cookiejar import CookieJar

base_url = os.environ["RESTORE_BASE_URL"].rstrip("/")
user_id = os.environ["E2E_ADMIN_USER"]
password = os.environ["E2E_ADMIN_PASSWORD"]

cookie_jar = CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookie_jar))

with opener.open(
    urllib.request.Request(
        base_url + "/api/auth/csrf",
        headers={"User-Agent": "gshsapp-restore-drill"},
    ),
    timeout=30,
) as response:
    csrf_payload = json.loads(response.read().decode("utf-8"))

csrf_token = csrf_payload.get("csrfToken")
if not csrf_token:
    raise SystemExit("Failed to obtain CSRF token for restore drill login.")

payload = urllib.parse.urlencode(
    {
        "csrfToken": csrf_token,
        "userId": user_id,
        "password": password,
        "callbackUrl": base_url + "/admin",
        "json": "true",
    }
).encode("utf-8")

login_request = urllib.request.Request(
    base_url + "/api/auth/callback/credentials",
    data=payload,
    method="POST",
    headers={
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": base_url,
        "Referer": base_url + "/login",
        "User-Agent": "gshsapp-restore-drill",
    },
)

with opener.open(login_request, timeout=30) as response:
    response.read()

with opener.open(
    urllib.request.Request(
        base_url + "/admin",
        headers={"User-Agent": "gshsapp-restore-drill"},
    ),
    timeout=30,
) as response:
    final_url = response.geturl()
    html = response.read().decode("utf-8", errors="ignore")

if "/login" in final_url:
    raise SystemExit(f"Restore drill admin login redirected back to login: {final_url}")

if "Application error" in html:
    raise SystemExit("Restore drill admin page rendered an application error.")
PY
}

write_output_file() {
  if [[ -z "$RESTORE_DRILL_OUTPUT_FILE" ]]; then
    return
  fi

  cat >"$RESTORE_DRILL_OUTPUT_FILE" <<EOF
RESTORE_SOURCE_NAME=$RESTORE_SOURCE_NAME
LATEST_BACKUP_NAME=$LATEST_BACKUP_NAME
RESTORE_BASE_URL=$RESTORE_BASE_URL
RESTORE_VERSION=$APP_VERSION
EOF
}

require_command docker
require_command curl
require_command tar
require_command "$PYTHON_BIN"

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin is required." >&2
  exit 1
fi

TEMP_DIR="$(mktemp -d "$DEPLOY_ROOT/restore-drill.XXXXXX")"
PROJECT_NAME="gshsapp-restore-$(date '+%Y%m%d%H%M%S')"
CONTAINER_NAME="${PROJECT_NAME}-web"
DEPLOY_ENV_FILE="$TEMP_DIR/.deploy.env"
COMPOSE_FILE="$TEMP_DIR/compose.yml"
RUNTIME_ENV_FILE="$TEMP_DIR/.env"

cp "$SOURCE_COMPOSE_FILE" "$COMPOSE_FILE"
write_runtime_env
write_compose_env
prepare_restore_source

if [[ -n "${DOCKERHUB_USERNAME:-}" && -n "${DOCKERHUB_TOKEN:-}" ]]; then
  echo "Logging into Docker Hub..."
  printf '%s' "$DOCKERHUB_TOKEN" | docker login -u "$DOCKERHUB_USERNAME" --password-stdin
fi

echo "Pulling image ${DOCKER_IMAGE}:${IMAGE_TAG} for restore drill..."
docker pull "${DOCKER_IMAGE}:${IMAGE_TAG}"

echo "Starting isolated restore drill container on ${RESTORE_BASE_URL}..."
compose up -d --remove-orphans

if ! wait_for_health; then
  echo "Restore drill health check failed for $RESTORE_BASE_URL/api/health" >&2
  compose ps || true
  compose logs --tail=200 || true
  exit 1
fi

verify_admin_login
write_output_file

echo "Restore drill succeeded with source: $RESTORE_SOURCE_NAME"
