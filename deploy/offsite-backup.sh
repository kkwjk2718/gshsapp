#!/usr/bin/env bash
set -Eeuo pipefail

DEPLOY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$DEPLOY_ROOT/backup}"
OFFSITE_TARGET="${OFFSITE_TARGET:?OFFSITE_TARGET is required}"
RSYNC_BIN="${RSYNC_BIN:-rsync}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
SOURCE_PATH=""

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

select_latest_backup() {
  find "$BACKUP_DIR" -maxdepth 1 -type f -regextype posix-extended \
    -regex '.*/backup-[0-9]{8}-[0-9]{6}-[a-f0-9]{8}\.tar\.gz' -printf '%T@ %p\n' \
    | sort -nr \
    | head -n 1 \
    | cut -d' ' -f2-
}

validate_source() {
  SOURCE_PATH="$SOURCE_PATH" "$PYTHON_BIN" - <<'PY'
import hashlib
import hmac
import json
import os
from pathlib import Path

source = Path(os.environ["SOURCE_PATH"])
metadata = source.with_name(source.name + ".json")
if source.is_symlink() or metadata.is_symlink() or not source.is_file() or not metadata.is_file():
    raise SystemExit("Generated backup and metadata must be regular files.")
try:
    payload = json.loads(metadata.read_text(encoding="utf-8"))
except Exception as error:
    raise SystemExit("Backup metadata validation failed.") from error
if payload.get("format") != "gshsapp-backup" or payload.get("version") != 2 or payload.get("file") != source.name:
    raise SystemExit("Backup metadata validation failed.")
if payload.get("size") != source.stat().st_size or not isinstance(payload.get("sha256"), str):
    raise SystemExit("Backup metadata validation failed.")
digest = hashlib.sha256()
with source.open("rb") as stream:
    for block in iter(lambda: stream.read(1024 * 1024), b""):
        digest.update(block)
if not hmac.compare_digest(digest.hexdigest(), payload["sha256"]):
    raise SystemExit("Backup checksum validation failed.")
PY
}

require_command "$RSYNC_BIN"
require_command "$PYTHON_BIN"
mkdir -p "$BACKUP_DIR"

if [[ -d "$BACKUP_DIR" ]]; then
  SOURCE_PATH="$(select_latest_backup || true)"
fi

if [[ -z "$SOURCE_PATH" ]]; then
  echo "No generated snapshot archive was found in $BACKUP_DIR; live SQLite copies are forbidden." >&2
  exit 1
fi

validate_source

echo "Copying $(basename "$SOURCE_PATH") to $OFFSITE_TARGET"
"$RSYNC_BIN" -av "$SOURCE_PATH" "$SOURCE_PATH.json" "$OFFSITE_TARGET"
echo "Offsite backup export completed successfully."
