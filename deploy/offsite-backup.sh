#!/usr/bin/env bash
set -Eeuo pipefail

DEPLOY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$DEPLOY_ROOT/backup}"
DATA_DIR="${DATA_DIR:-$DEPLOY_ROOT/data}"
DB_FILE="${DB_FILE:-$DATA_DIR/dev.db}"
OFFSITE_TARGET="${OFFSITE_TARGET:?OFFSITE_TARGET is required}"
RSYNC_BIN="${RSYNC_BIN:-rsync}"
SOURCE_PATH=""
TEMP_BACKUP=""

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

cleanup() {
  if [[ -n "$TEMP_BACKUP" && -f "$TEMP_BACKUP" ]]; then
    rm -f "$TEMP_BACKUP"
  fi
}

trap cleanup EXIT

select_latest_backup() {
  find "$BACKUP_DIR" -maxdepth 1 -type f \( -name '*.bak' -o -name '*.db' -o -name '*.tar.gz' \) -printf '%T@ %p\n' \
    | sort -nr \
    | head -n 1 \
    | cut -d' ' -f2-
}

require_command "$RSYNC_BIN"
mkdir -p "$BACKUP_DIR"

if [[ -d "$BACKUP_DIR" ]]; then
  SOURCE_PATH="$(select_latest_backup || true)"
fi

if [[ -z "$SOURCE_PATH" ]]; then
  if [[ ! -f "$DB_FILE" ]]; then
    echo "No backup file was found in $BACKUP_DIR and no live DB exists at $DB_FILE." >&2
    exit 1
  fi

  timestamp="$(date '+%Y%m%d-%H%M%S')"
  TEMP_BACKUP="$BACKUP_DIR/dev.db.${timestamp}.manual-export.bak"
  cp "$DB_FILE" "$TEMP_BACKUP"
  SOURCE_PATH="$TEMP_BACKUP"
fi

echo "Copying $(basename "$SOURCE_PATH") to $OFFSITE_TARGET"
"$RSYNC_BIN" -av "$SOURCE_PATH" "$OFFSITE_TARGET"
echo "Offsite backup export completed successfully."
