#!/usr/bin/env bash
set -Eeuo pipefail

CONTAINER_NAME="${CONTAINER_NAME:-gshsapp-web}"
APP_ROOT="${APP_ROOT:-/app}"
BACKUP_COMMAND="${BACKUP_COMMAND:-node .next/ops/run-scheduled-backup.mjs}"
DEPLOY_LOCK_FILE="${DEPLOY_LOCK_FILE:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.deploy.lock}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required to run scheduled backups." >&2
  exit 1
fi
if ! command -v flock >/dev/null 2>&1; then
  echo "flock is required to serialize backup maintenance with deployment." >&2
  exit 1
fi

exec 9>"$DEPLOY_LOCK_FILE"
if ! flock -n 9; then
  echo "Deployment or another backup maintenance run is active; refusing concurrent execution." >&2
  exit 1
fi

if ! docker container inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
  echo "Container $CONTAINER_NAME was not found." >&2
  exit 1
fi

docker exec "$CONTAINER_NAME" sh -lc "cd '$APP_ROOT' && $BACKUP_COMMAND"
