#!/usr/bin/env bash
set -Eeuo pipefail

DEPLOY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="${DATA_DIR:-$DEPLOY_ROOT/data}"
BACKUP_DIR="${BACKUP_DIR:-$DEPLOY_ROOT/backup}"
DB_FILE="${DB_FILE:-$DATA_DIR/dev.db}"
CONTAINER_NAME="${CONTAINER_NAME:-gshsapp-web}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
DOCKER_IMAGE="${DOCKER_IMAGE:?DOCKER_IMAGE is required}"
IMAGE_DIGEST="${IMAGE_DIGEST:?IMAGE_DIGEST is required}"
VALIDATION_ROOT=""
BOOTSTRAP_NAME=""
BOOTSTRAP_COMMITTED=false

cleanup() {
  local status=$?
  if [[ -n "$VALIDATION_ROOT" && "$VALIDATION_ROOT" == "$DEPLOY_ROOT"/.bootstrap-validate.* &&
        -d "$VALIDATION_ROOT" && ! -L "$VALIDATION_ROOT" ]]; then
    rm -rf -- "$VALIDATION_ROOT"
  fi
  if [[ "$status" -ne 0 && "$BOOTSTRAP_COMMITTED" != "true" &&
        "$BOOTSTRAP_NAME" =~ ^backup-[0-9]{8}-[0-9]{6}-[a-f0-9]{8}\.tar\.gz$ ]]; then
    rm -f -- "$BACKUP_DIR/$BOOTSTRAP_NAME" "$BACKUP_DIR/$BOOTSTRAP_NAME.json"
  fi
  return "$status"
}
trap cleanup EXIT

if [[ "$IMAGE_DIGEST" != sha256:* || ! "$IMAGE_DIGEST" =~ ^sha256:[a-f0-9]{64}$ ]]; then
  echo "IMAGE_DIGEST must be an exact sha256 digest." >&2
  exit 1
fi
if [[ -L "$DATA_DIR" || ! -d "$DATA_DIR" || -L "$BACKUP_DIR" || ! -d "$BACKUP_DIR" ]]; then
  echo "Data and backup roots must be real directories." >&2
  exit 1
fi
if [[ -L "$DB_FILE" ]]; then
  echo "Refusing to back up a symbolic-link database." >&2
  exit 1
fi
if [[ ! -e "$DB_FILE" ]]; then
  exit 0
fi
if [[ ! -f "$DB_FILE" ]]; then
  echo "The configured database is not a regular file." >&2
  exit 1
fi

echo "Creating a SQLite-consistent pre-deployment backup..."
if ! docker container inspect "$CONTAINER_NAME" >/dev/null 2>&1 ||
   [[ "$(docker container inspect --format '{{.State.Running}}' "$CONTAINER_NAME")" != "true" ]]; then
  echo "An existing database requires an already-running trusted application container during online backup." >&2
  echo "Restore the last known-good service or create a reviewed offline backup before deploying." >&2
  exit 1
fi

if docker exec "$CONTAINER_NAME" test -f /app/.next/ops/run-scheduled-backup.mjs; then
  # This remains the normal path after the first hardened deployment. The
  # already-running accepted image owns live DB access and backup retention.
  docker exec "$CONTAINER_NAME" \
    node /app/.next/ops/run-scheduled-backup.mjs --force
  exit 0
fi

echo "The trusted running image predates the backup runtime; using the reviewed host bootstrap path."
BOOTSTRAP_NAME="$(
  "$PYTHON_BIN" "$DEPLOY_ROOT/bootstrap-backup.py" create \
    --database "$DB_FILE" \
    --data-root "$DATA_DIR" \
    --backup-dir "$BACKUP_DIR"
)"
if [[ ! "$BOOTSTRAP_NAME" =~ ^backup-[0-9]{8}-[0-9]{6}-[a-f0-9]{8}\.tar\.gz$ ]]; then
  echo "Bootstrap backup returned an invalid artifact name." >&2
  exit 1
fi
"$PYTHON_BIN" "$DEPLOY_ROOT/bootstrap-backup.py" verify \
  --backup-dir "$BACKUP_DIR" \
  --name "$BOOTSTRAP_NAME"

archive_path="$BACKUP_DIR/$BOOTSTRAP_NAME"
if [[ -L "$archive_path" || ! -f "$archive_path" ]]; then
  echo "Bootstrap backup artifact changed before isolated validation." >&2
  exit 1
fi
archive_path="$(cd "$(dirname "$archive_path")" && pwd -P)/$(basename "$archive_path")"
VALIDATION_ROOT="$(mktemp -d "$DEPLOY_ROOT/.bootstrap-validate.XXXXXX")"
chmod 700 "$VALIDATION_ROOT"
host_uid="$(id -u)"
host_gid="$(id -g)"

# The candidate receives only the immutable backup artifact read-only. It has
# no runtime secrets, network, live DB, data-root, or backup-directory mount.
if ! docker run --rm \
  --network none \
  --read-only \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --user "$host_uid:$host_gid" \
  --tmpfs "/tmp:rw,noexec,nosuid,nodev,size=1536m,uid=$host_uid,gid=$host_gid,mode=1700" \
  --mount "type=bind,src=$archive_path,dst=/input/bootstrap.tar.gz,readonly" \
  --mount "type=bind,src=$VALIDATION_ROOT,dst=/output" \
  "${DOCKER_IMAGE}@${IMAGE_DIGEST}" \
  node .next/ops/validate-backup.mjs \
    /input/bootstrap.tar.gz /output --migrate-reviewed-input; then
  echo "Isolated bootstrap backup validation failed." >&2
  exit 1
fi

if [[ -L "$VALIDATION_ROOT/data/dev.db" || ! -f "$VALIDATION_ROOT/data/dev.db" ]]; then
  echo "Isolated bootstrap validation did not produce a reviewed migrated database." >&2
  exit 1
fi
"$PYTHON_BIN" "$DEPLOY_ROOT/bootstrap-backup.py" verify \
  --backup-dir "$BACKUP_DIR" \
  --name "$BOOTSTRAP_NAME"
BOOTSTRAP_COMMITTED=true
echo "Bootstrap backup was verified without exposing the live database to the candidate image."
