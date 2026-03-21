#!/usr/bin/env bash
set -Eeuo pipefail

CONTAINER_NAME="${CONTAINER_NAME:-gshsapp-web}"
APP_ROOT="${APP_ROOT:-/app}"
BACKUP_COMMAND="${BACKUP_COMMAND:-node_modules/.bin/tsx scripts/run-scheduled-backup.ts}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required to run scheduled backups." >&2
  exit 1
fi

if ! docker container inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
  echo "Container $CONTAINER_NAME was not found." >&2
  exit 1
fi

docker exec "$CONTAINER_NAME" sh -lc "cd '$APP_ROOT' && $BACKUP_COMMAND"
