#!/usr/bin/env bash
set -Eeuo pipefail

PATH=/usr/sbin:/usr/bin:/sbin:/bin
LC_ALL=C
export PATH LC_ALL
IFS=$' \t\n'
umask 077

CONTROL_ROOT="${CONTROL_ROOT:-/usr/local/lib/gshsapp-operations}"
DEPLOY_ROOT="${DEPLOY_ROOT:-/opt/gshsapp}"
DATA_DIR="$DEPLOY_ROOT/data"
OFFSITE_DIR="${OFFSITE_DIR:?OFFSITE_DIR is required}"
OFFSITE_RECEIPT_DIR="$OFFSITE_DIR/.gshsapp-receipts"
OFFSITE_MOUNT_SOURCE="${OFFSITE_MOUNT_SOURCE:?OFFSITE_MOUNT_SOURCE is required}"
OFFSITE_FSTYPE="${OFFSITE_FSTYPE:?OFFSITE_FSTYPE is required}"
OFFSITE_REQUIRED_OPTIONS="${OFFSITE_REQUIRED_OPTIONS:-rw,nodev,nosuid,noexec}"
BACKUP_NAME="${BACKUP_NAME:-}"
DOCKER_IMAGE="${DOCKER_IMAGE:-kkwjk2718git/gshsapp}"
IMAGE_DIGEST="${IMAGE_DIGEST:-}"
IMAGE_TAG="${IMAGE_TAG:-}"
EXPECTED_OFFSITE_RECEIPT_SHA256="${EXPECTED_OFFSITE_RECEIPT_SHA256:-}"
LOCK_FILE=/run/lock/gshsapp/lifecycle.lock
WORK=""
IMPORT_PHASE_FILE="$DEPLOY_ROOT/import-phase.json"
VALIDATOR_CONTAINER_ID=""
VALIDATOR_CONTAINER_NAME=""
VALIDATOR_CONTAINER_NONCE=""
VALIDATOR_OUTPUT_LIMIT_BYTES=$((512 * 1024 * 1024))
VALIDATOR_DATABASE_LIMIT_BYTES=$((512 * 1024 * 1024))
VALIDATOR_TIMEOUT_SECONDS=1200
VALIDATOR_DOCKER_TIMEOUT_SECONDS=30

cleanup() {
  local status=$?
  if [[ -n "$VALIDATOR_CONTAINER_ID" && "$VALIDATOR_CONTAINER_ID" =~ ^[0-9a-f]{64}$ ]]; then
    /usr/bin/timeout --signal=TERM --kill-after=10s "${VALIDATOR_DOCKER_TIMEOUT_SECONDS}s" \
      docker rm --force "$VALIDATOR_CONTAINER_ID" >/dev/null 2>&1 || :
  fi
  if [[ -n "$WORK" && ! -e "$IMPORT_PHASE_FILE" && ! -L "$IMPORT_PHASE_FILE" ]]; then
    rm -rf -- "$WORK"
  fi
  return "$status"
}
trap cleanup EXIT
fail() { printf '%s\n' "Offline import refused: $1" >&2; exit 1; }

receipt_digest() {
  local path="$1"
  RECEIPT_PATH="$path" python3 - <<'PY'
import hashlib,os,stat
path=os.environ["RECEIPT_PATH"]
before=os.lstat(path)
if not stat.S_ISREG(before.st_mode) or stat.S_ISLNK(before.st_mode) or before.st_nlink!=1: raise SystemExit(1)
descriptor=os.open(path,os.O_RDONLY|getattr(os,"O_CLOEXEC",0)|getattr(os,"O_NOFOLLOW",0))
digest=hashlib.sha256()
try:
    with os.fdopen(descriptor,"rb",closefd=True) as source:
        while block:=source.read(1024*1024): digest.update(block)
finally:
    after=os.lstat(path)
if stat.S_ISLNK(after.st_mode) or not stat.S_ISREG(after.st_mode) or after.st_nlink!=1 or (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns): raise SystemExit(1)
print(digest.hexdigest())
PY
}

run_validator_docker() {
  /usr/bin/timeout --signal=TERM --kill-after=10s \
    "${VALIDATOR_DOCKER_TIMEOUT_SECONDS}s" docker "$@"
}

cleanup_import_validator() {
  local by_id by_label by_name actual_id actual_name actual_label
  if ! by_label="$(run_validator_docker ps --all --no-trunc --quiet \
      --filter "label=io.gshsapp.import-validator=$VALIDATOR_CONTAINER_NONCE")"; then
    return 1
  fi
  if ! by_name="$(run_validator_docker ps --all --no-trunc --quiet \
      --filter "name=^/${VALIDATOR_CONTAINER_NAME}$")"; then
    return 1
  fi
  if [[ -z "$by_label" && -z "$by_name" ]]; then
    VALIDATOR_CONTAINER_ID=""
    VALIDATOR_CONTAINER_NAME=""
    VALIDATOR_CONTAINER_NONCE=""
    return 0
  fi
  [[ "$by_label" == "$by_name" && "$by_label" =~ ^[0-9a-f]{64}$ ]] || return 1
  by_id="$by_label"
  [[ -z "$VALIDATOR_CONTAINER_ID" || "$VALIDATOR_CONTAINER_ID" == "$by_id" ]] || return 1
  actual_id="$(run_validator_docker inspect --format '{{.Id}}' "$by_id")" || return 1
  actual_name="$(run_validator_docker inspect --format '{{.Name}}' "$by_id")" || return 1
  actual_label="$(run_validator_docker inspect --format '{{ index .Config.Labels "io.gshsapp.import-validator" }}' "$by_id")" || return 1
  [[ "$actual_id" == "$by_id" && "$actual_name" == "/$VALIDATOR_CONTAINER_NAME" &&
     "$actual_label" == "$VALIDATOR_CONTAINER_NONCE" ]] || return 1
  run_validator_docker rm --force "$by_id" >/dev/null || return 1
  by_id="$(run_validator_docker ps --all --no-trunc --quiet --filter "id=$by_id")" || return 1
  [[ -z "$by_id" ]] || return 1
  VALIDATOR_CONTAINER_ID=""
  VALIDATOR_CONTAINER_NAME=""
  VALIDATOR_CONTAINER_NONCE=""
}

sweep_stale_import_validators() {
  local output id actual_id actual_name actual_label network_mode read_only
  local -a ids=()
  output="$(run_validator_docker ps --all --no-trunc --quiet \
    --filter 'label=io.gshsapp.import-validator')" || return 1
  [[ -z "$output" ]] || mapfile -t ids <<<"$output"
  for id in "${ids[@]}"; do
    [[ "$id" =~ ^[0-9a-f]{64}$ ]] || return 1
    actual_id="$(run_validator_docker inspect --format '{{.Id}}' "$id")" || return 1
    actual_name="$(run_validator_docker inspect --format '{{.Name}}' "$id")" || return 1
    actual_label="$(run_validator_docker inspect --format '{{ index .Config.Labels "io.gshsapp.import-validator" }}' "$id")" || return 1
    network_mode="$(run_validator_docker inspect --format '{{.HostConfig.NetworkMode}}' "$id")" || return 1
    read_only="$(run_validator_docker inspect --format '{{.HostConfig.ReadonlyRootfs}}' "$id")" || return 1
    [[ "$actual_id" == "$id" && "$actual_label" =~ ^[a-f0-9]{16}$ &&
       "$actual_name" == "/gshsapp-import-validator-$actual_label" &&
       "$network_mode" == "none" && "$read_only" == "true" ]] || return 1
    run_validator_docker rm --force "$id" >/dev/null || return 1
  done
  output="$(run_validator_docker ps --all --no-trunc --quiet \
    --filter 'label=io.gshsapp.import-validator')" || return 1
  [[ -z "$output" ]]
}

run_import_validator() {
  local archive="$1" output_file="$2" image_ref="$3"
  local wrapper_script tree_script stream_script create_output actual_id actual_name actual_label actual_image
  local mounts_json tmpfs_json running exit_code proof deadline status=0

  VALIDATOR_CONTAINER_NONCE="$(python3 -c 'import secrets; print(secrets.token_hex(8))')" || return 1
  [[ "$VALIDATOR_CONTAINER_NONCE" =~ ^[0-9a-f]{16}$ ]] || return 1
  VALIDATOR_CONTAINER_NAME="gshsapp-import-validator-$VALIDATOR_CONTAINER_NONCE"
  read -r -d '' wrapper_script <<'JS' || :
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const child = spawn(process.execPath, [
  ".next/ops/validate-backup.mjs",
  "/input/generation.tar.gz",
  "/output",
  "--migrate-reviewed-input",
], { stdio: "ignore", env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" } });
child.once("error", () => process.exit(1));
child.once("exit", (code, signal) => {
  if (code !== 0 || signal !== null) process.exit(1);
  const descriptor = fs.openSync("/tmp/gshsapp-import-complete", "wx", 0o400);
  fs.writeSync(descriptor, "ok\n");
  fs.fsyncSync(descriptor);
  fs.closeSync(descriptor);
  setInterval(() => {}, 1073741824);
});
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => {
  if (child.exitCode === null && child.signalCode === null) child.kill(signal);
  process.exit(signal === "SIGTERM" ? 143 : 130);
});
JS
  create_output="$(run_validator_docker create --name "$VALIDATOR_CONTAINER_NAME" \
    --label "io.gshsapp.import-validator=$VALIDATOR_CONTAINER_NONCE" \
    --log-driver none --network none --read-only --cap-drop ALL --security-opt no-new-privileges \
    --memory 1536m --memory-swap 1536m --pids-limit 128 --cpus 2 \
    --user 61001:61001 --env NODE_OPTIONS= --env NODE_PATH= \
    --tmpfs /tmp:rw,noexec,nosuid,nodev,size=64m,uid=61001,gid=61001,mode=1700 \
    --tmpfs /output:rw,noexec,nosuid,nodev,size=768m,nr_inodes=12000,uid=61001,gid=61001,mode=0700 \
    --mount "type=bind,src=$archive,dst=/input/generation.tar.gz,readonly" \
    "$image_ref" node -e "$wrapper_script")" || return 1
  create_output="${create_output%$'\r'}"
  [[ "$create_output" =~ ^[0-9a-f]{64}$ ]] || return 1
  VALIDATOR_CONTAINER_ID="$create_output"

  actual_id="$(run_validator_docker inspect --format '{{.Id}}' "$VALIDATOR_CONTAINER_ID")" || status=1
  actual_name="$(run_validator_docker inspect --format '{{.Name}}' "$VALIDATOR_CONTAINER_ID")" || status=1
  actual_label="$(run_validator_docker inspect --format '{{ index .Config.Labels "io.gshsapp.import-validator" }}' "$VALIDATOR_CONTAINER_ID")" || status=1
  actual_image="$(run_validator_docker inspect --format '{{.Config.Image}}' "$VALIDATOR_CONTAINER_ID")" || status=1
  mounts_json="$(run_validator_docker inspect --format '{{json .Mounts}}' "$VALIDATOR_CONTAINER_ID")" || status=1
  tmpfs_json="$(run_validator_docker inspect --format '{{json .HostConfig.Tmpfs}}' "$VALIDATOR_CONTAINER_ID")" || status=1
  if [[ "$status" != 0 || "$actual_id" != "$VALIDATOR_CONTAINER_ID" ||
        "$actual_name" != "/$VALIDATOR_CONTAINER_NAME" || "$actual_label" != "$VALIDATOR_CONTAINER_NONCE" ||
        "$actual_image" != "$image_ref" ]]; then
    status=1
  elif ! MOUNTS_JSON="$mounts_json" TMPFS_JSON="$tmpfs_json" python3 - <<'PY'
import json, os
try:
    mounts=json.loads(os.environ["MOUNTS_JSON"]); tmpfs=json.loads(os.environ["TMPFS_JSON"])
except Exception: raise SystemExit(1)
outputs=[item for item in mounts if isinstance(item,dict) and item.get("Destination")=="/output"]
if len(outputs)!=1 or outputs[0].get("Type")!="tmpfs" or outputs[0].get("RW") is not True: raise SystemExit(1)
if not isinstance(tmpfs,dict) or set(tmpfs)!={"/tmp","/output"}: raise SystemExit(1)
expected={"rw","noexec","nosuid","nodev","size=768m","nr_inodes=12000","uid=61001","gid=61001","mode=0700"}
if set(tmpfs["/output"].split(","))!=expected: raise SystemExit(1)
PY
  then
    status=1
  elif ! run_validator_docker start "$VALIDATOR_CONTAINER_ID" >/dev/null 2>&1; then
    status=1
  else
    deadline=$((SECONDS + VALIDATOR_TIMEOUT_SECONDS))
    while (( SECONDS < deadline )); do
      running="$(run_validator_docker inspect --format '{{.State.Running}}' "$VALIDATOR_CONTAINER_ID")" || { status=1; break; }
      if [[ "$running" != "true" ]]; then
        exit_code="$(run_validator_docker inspect --format '{{.State.ExitCode}}' "$VALIDATOR_CONTAINER_ID" 2>/dev/null || true)"
        printf 'Import validator exited before success (exit=%s).\n' "${exit_code:-unknown}" >&2
        status=1
        break
      fi
      if run_validator_docker exec "$VALIDATOR_CONTAINER_ID" node -e \
          'require("node:fs").accessSync("/tmp/gshsapp-import-complete", require("node:fs").constants.R_OK)' \
          >/dev/null 2>&1; then
        break
      fi
      sleep 1
    done
    (( SECONDS < deadline )) || status=1
  fi

  if [[ "$status" == 0 ]]; then
    read -r -d '' tree_script <<'JS' || :
const fs=require("node:fs"), path=require("node:path");
const maximum=Number(process.argv[1]); let entries=0, bytes=0, database=false; const stack=["/output"];
while(stack.length){const current=stack.pop(), details=fs.lstatSync(current); if(details.isSymbolicLink())process.exit(1);
  if(details.isDirectory()){for(const name of fs.readdirSync(current).sort().reverse()){entries+=1;if(entries>12000)process.exit(1);stack.push(path.join(current,name));}}
  else if(details.isFile()&&details.nlink===1){bytes+=details.size;if(!Number.isSafeInteger(bytes)||bytes>maximum)process.exit(1);if(current==="/output/data/dev.db"&&details.size>0)database=true;}
  else process.exit(1);}
if(!database)process.exit(1);process.stdout.write("ok\n");
JS
    proof="$(
      run_validator_docker exec "$VALIDATOR_CONTAINER_ID" node -e "$tree_script" "$VALIDATOR_OUTPUT_LIMIT_BYTES" 2>/dev/null \
        | python3 -c 'import sys; raw=sys.stdin.buffer.read(4); sys.exit(1) if raw != b"ok\n" else sys.stdout.write("ok\n")'
    )" || status=1
    proof="${proof%$'\r'}"
    [[ "$proof" == "ok" ]] || status=1
  fi
  if [[ "$status" == 0 ]]; then
    read -r -d '' stream_script <<'JS' || :
const fs=require("node:fs"), file="/output/data/dev.db", maximum=Number(process.argv[1]), details=fs.lstatSync(file);
if(!details.isFile()||details.isSymbolicLink()||details.nlink!==1||details.size<1||details.size>maximum)process.exit(1);
const source=fs.createReadStream(file);source.on("error",()=>process.exit(1));process.stdout.on("error",()=>process.exit(1));source.pipe(process.stdout);
JS
    mkdir -m 0700 "$(dirname "$output_file")" || status=1
  fi
  if [[ "$status" == 0 ]]; then
    if ! /usr/bin/timeout --signal=TERM --kill-after=10s 180s \
        docker exec "$VALIDATOR_CONTAINER_ID" node -e "$stream_script" "$VALIDATOR_DATABASE_LIMIT_BYTES" 2>/dev/null \
      | VALIDATOR_OUTPUT_FILE="$output_file" VALIDATOR_MAX_BYTES="$VALIDATOR_DATABASE_LIMIT_BYTES" python3 -c '
import os, sys
path=os.environ["VALIDATOR_OUTPUT_FILE"]; maximum=int(os.environ["VALIDATOR_MAX_BYTES"])
flags=os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,"O_NOFOLLOW",0); descriptor=os.open(path,flags,0o600); total=0
try:
    with os.fdopen(descriptor,"wb",closefd=True) as output:
        while True:
            block=sys.stdin.buffer.read(1024*1024)
            if not block: break
            total+=len(block)
            if total>maximum: raise ValueError("validator output exceeded limit")
            output.write(block)
        if total<1: raise ValueError("validator output was empty")
        output.flush(); os.fsync(output.fileno())
except BaseException:
    try: os.unlink(path)
    except FileNotFoundError: pass
    raise
'
    then
      status=1
    fi
  fi
  cleanup_import_validator || status=1
  [[ "$status" == 0 ]]
}

tree_digest() {
  local root="$1"
  TREE_ROOT="$root" python3 - <<'PY'
import hashlib,json,os,stat
root=os.path.realpath(os.environ["TREE_ROOT"])
listed=os.lstat(root)
if not stat.S_ISDIR(listed.st_mode) or stat.S_ISLNK(listed.st_mode): raise SystemExit(1)
entries=[]
for directory, names, files in os.walk(root, topdown=True, followlinks=False):
    names.sort(); files.sort()
    relative_directory=os.path.relpath(directory,root)
    if relative_directory != ".":
        info=os.lstat(directory)
        if not stat.S_ISDIR(info.st_mode) or stat.S_ISLNK(info.st_mode): raise SystemExit(1)
        entries.append({"path":relative_directory.replace(os.sep,"/"),"type":"directory"})
    for name in files:
        path=os.path.join(directory,name); info=os.lstat(path)
        if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode) or info.st_nlink != 1: raise SystemExit(1)
        digest=hashlib.sha256()
        with open(path,"rb",buffering=0) as stream:
            while block:=stream.read(1024*1024): digest.update(block)
        entries.append({"path":os.path.relpath(path,root).replace(os.sep,"/"),"type":"file","size":info.st_size,"sha256":digest.hexdigest()})
print(hashlib.sha256(json.dumps(entries,separators=(",",":"),ensure_ascii=False).encode()).hexdigest())
PY
}

publish_bootstrap_marker() {
  local backup_name="$1" receipt_digest="$2" image_tag="$3" image_digest="$4" tree_sha256="$5"
  local marker
  marker="$(mktemp "$DEPLOY_ROOT/.bootstrap-complete.XXXXXX")"
  BACKUP_NAME_VALUE="$backup_name" IMAGE_TAG_VALUE="$image_tag" IMAGE_DIGEST_VALUE="$image_digest" \
    RECEIPT_SHA256_VALUE="$receipt_digest" TREE_SHA256_VALUE="$tree_sha256" python3 - "$marker" <<'PY'
import datetime,json,os,sys
with open(sys.argv[1],"w",encoding="utf-8",newline="\n") as output:
    json.dump({"format":"gshsapp-bootstrap","version":3,"backup":os.environ["BACKUP_NAME_VALUE"],"receiptSha256":os.environ["RECEIPT_SHA256_VALUE"],"treeSha256":os.environ["TREE_SHA256_VALUE"],"imageTag":os.environ["IMAGE_TAG_VALUE"],"imageDigest":os.environ["IMAGE_DIGEST_VALUE"],"completedAt":datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00","Z")},output,separators=(",",":"));output.write("\n");output.flush();os.fsync(output.fileno())
PY
  chmod 0400 "$marker"
  chown root:root "$marker"
  mv -fT "$marker" "$DEPLOY_ROOT/bootstrap-complete.json"
  sync -d "$DEPLOY_ROOT"
}

write_import_phase() {
  local staging_name="$1" tree_sha256="$2" receipt_sha256="$3" control_sha256="$4" temporary
  temporary="$(mktemp "$DEPLOY_ROOT/.import-phase.XXXXXX")"
  STAGING_NAME="$staging_name" TREE_SHA256="$tree_sha256" RECEIPT_SHA256="$receipt_sha256" \
    BACKUP_NAME_VALUE="$BACKUP_NAME" IMAGE_TAG_VALUE="$IMAGE_TAG" IMAGE_DIGEST_VALUE="$IMAGE_DIGEST" \
    CONTROL_SHA256_VALUE="$control_sha256" \
    python3 - "$temporary" <<'PY'
import datetime,json,os,sys
with open(sys.argv[1],"w",encoding="utf-8",newline="\n") as output:
    json.dump({"format":"gshsapp-import-phase","version":2,"phase":"ready-to-promote","backup":os.environ["BACKUP_NAME_VALUE"],"receiptSha256":os.environ["RECEIPT_SHA256"],"treeSha256":os.environ["TREE_SHA256"],"controlManifestSha256":os.environ["CONTROL_SHA256_VALUE"],"imageTag":os.environ["IMAGE_TAG_VALUE"],"imageDigest":os.environ["IMAGE_DIGEST_VALUE"],"stagingDirectory":os.environ["STAGING_NAME"],"createdAt":datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00","Z")},output,separators=(",",":"));output.write("\n");output.flush();os.fsync(output.fileno())
PY
  chmod 0600 "$temporary"
  chown root:root "$temporary"
  mv -fT "$temporary" "$IMPORT_PHASE_FILE"
  sync -d "$IMPORT_PHASE_FILE"
  sync -d "$DEPLOY_ROOT"
}

recover_pending_import() {
  [[ -e "$IMPORT_PHASE_FILE" || -L "$IMPORT_PHASE_FILE" ]] || return 2
  [[ -f "$IMPORT_PHASE_FILE" && ! -L "$IMPORT_PHASE_FILE" && "$(stat -c '%u:%g:%a:%h' "$IMPORT_PHASE_FILE")" == "0:0:600:1" ]] || fail "pending import phase is unsafe"
  local phase_raw staging_name expected_tree expected_receipt expected_control phase_backup phase_tag phase_digest staging_data current_tree
  phase_raw="$(PHASE_FILE="$IMPORT_PHASE_FILE" python3 - <<'PY'
import datetime,json,os,re
def raise_system_exit(): raise SystemExit(1)
try: value=json.load(open(os.environ["PHASE_FILE"],encoding="utf-8"))
except Exception: raise SystemExit(1)
keys={"format","version","phase","backup","receiptSha256","treeSha256","controlManifestSha256","imageTag","imageDigest","stagingDirectory","createdAt"}
valid=(set(value)==keys and value["format"]=="gshsapp-import-phase" and value["version"]==2 and value["phase"]=="ready-to-promote" and re.fullmatch(r"backup-[0-9]{8}-[0-9]{6}-[a-f0-9]{8}\.tar\.gz",value["backup"] or "") and re.fullmatch(r"[0-9a-f]{64}",value["receiptSha256"] or "") and re.fullmatch(r"[0-9a-f]{64}",value["treeSha256"] or "") and re.fullmatch(r"[0-9a-f]{64}",value["controlManifestSha256"] or "") and re.fullmatch(r"sha-[0-9a-f]{40}",value["imageTag"] or "") and re.fullmatch(r"sha256:[0-9a-f]{64}",value["imageDigest"] or "") and re.fullmatch(r"\.offline-import\.[A-Za-z0-9]{6,32}",value["stagingDirectory"] or ""))
valid or raise_system_exit()
created=datetime.datetime.fromisoformat(value["createdAt"].replace("Z","+00:00")); now=datetime.datetime.now(datetime.timezone.utc)
if created.tzinfo is None or created>now+datetime.timedelta(minutes=5): raise SystemExit(1)
for key in ("stagingDirectory","treeSha256","receiptSha256","controlManifestSha256","backup","imageTag","imageDigest"): print(value[key])
PY
)" || fail "pending import phase is malformed"
  phase_raw="${phase_raw//$'\r'/}"
  readarray -t phase_values <<<"$phase_raw"
  [[ "${#phase_values[@]}" == "7" ]] || fail "pending import phase is incomplete"
  staging_name="${phase_values[0]}"; expected_tree="${phase_values[1]}"; expected_receipt="${phase_values[2]}"
  expected_control="${phase_values[3]}"; phase_backup="${phase_values[4]}"; phase_tag="${phase_values[5]}"; phase_digest="${phase_values[6]}"
  [[ "$expected_control" == "$CONTROL_MANIFEST_DIGEST" ]] || fail "pending import control manifest changed"
  if [[ -n "$BACKUP_NAME" ]]; then [[ "$phase_backup" == "$BACKUP_NAME" ]] || fail "pending import belongs to another backup"; fi
  if [[ -n "$IMAGE_TAG" ]]; then [[ "$phase_tag" == "$IMAGE_TAG" ]] || fail "pending import belongs to another release tag"; fi
  if [[ -n "$IMAGE_DIGEST" ]]; then [[ "$phase_digest" == "$IMAGE_DIGEST" ]] || fail "pending import belongs to another image digest"; fi
  [[ "$(receipt_digest "$OFFSITE_RECEIPT_DIR/$phase_backup.receipt.json")" == "$expected_receipt" ]] || fail "pending import receipt changed"
  python3 "$CONTROL_ROOT/bootstrap-backup.py" verify-receipt --offsite-dir "$OFFSITE_DIR" --receipt-dir "$OFFSITE_RECEIPT_DIR" --name "$phase_backup" >/dev/null || fail "pending import offsite receipt no longer verifies"
  WORK="$DEPLOY_ROOT/$staging_name"
  staging_data="$WORK/live-data"
  [[ "$WORK" == "$DEPLOY_ROOT"/.offline-import.* && -d "$WORK" && ! -L "$WORK" && "$(stat -c '%u:%g:%a' "$WORK")" == "0:0:700" ]] || fail "pending import staging root is unavailable"

  if [[ -d "$DATA_DIR" && ! -L "$DATA_DIR" && -n "$(find "$DATA_DIR" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
    current_tree="$(tree_digest "$DATA_DIR")" || fail "promoted import tree is unsafe"
    [[ "$current_tree" == "$expected_tree" ]] || fail "promoted import tree differs from the durable phase"
  else
    if [[ -e "$DATA_DIR" || -L "$DATA_DIR" ]]; then
      [[ -d "$DATA_DIR" && ! -L "$DATA_DIR" && -z "$(find "$DATA_DIR" -mindepth 1 -maxdepth 1 -print -quit)" ]] || fail "fresh data target is unsafe"
    fi
    [[ -d "$staging_data" && ! -L "$staging_data" ]] || fail "pending import staging data is unavailable"
    [[ "$(tree_digest "$staging_data")" == "$expected_tree" ]] || fail "pending import staging tree changed"
    if [[ -d "$DATA_DIR" ]]; then rmdir "$DATA_DIR"; fi
    mv -T "$staging_data" "$DATA_DIR"
    sync -d "$DATA_DIR/dev.db"
    sync -d "$DEPLOY_ROOT"
  fi

  python3 "$CONTROL_ROOT/validate-live-database.py" "$DATA_DIR/dev.db" >/dev/null || fail "promoted database failed root-reviewed validation"
  [[ "$(tree_digest "$DATA_DIR")" == "$expected_tree" ]] || fail "promoted import tree failed its final digest"
  publish_bootstrap_marker "$phase_backup" "$expected_receipt" "$phase_tag" "$phase_digest" "$expected_tree"
  rm -f -- "$IMPORT_PHASE_FILE"
  sync -d "$DEPLOY_ROOT"
  rm -rf -- "$WORK"
  WORK=""
  return 0
}
import_main() {
[[ "$(id -u)" == "0" ]] || fail "trusted root console is required"
current_script="$(readlink -f -- "${BASH_SOURCE[0]}")" || fail "import control path cannot be resolved"
[[ "$current_script" == "$CONTROL_ROOT/import-backup.sh" ]] || fail "run only the installed authenticated import control"
[[ -f "$current_script" && ! -L "$current_script" && "$(stat -c '%u:%g:%a:%h' "$current_script")" == "0:0:400:1" ]] || fail "installed import control is unsafe"
[[ -d "$CONTROL_ROOT" && ! -L "$CONTROL_ROOT" && "$(stat -c '%u:%g:%a' "$CONTROL_ROOT")" == "0:0:700" ]] || fail "root control directory is unsafe"
manifest="$CONTROL_ROOT/control-assets.sha256"
/bin/bash "$CONTROL_ROOT/install-root-operations.sh" --verify-installed || fail "installed root controls failed verification"
[[ "${GSHSAPP_OFFSITE_PINNED:-}" == manual ]] || fail "run import through the authenticated pin-offsite-operation.sh helper"
[[ -f "$manifest" && ! -L "$manifest" && "$(stat -c '%u:%g:%a:%h' "$manifest")" == "0:0:400:1" ]] || fail "root control manifest is unsafe"
CONTROL_MANIFEST_DIGEST="$(sha256sum "$manifest" | awk '{print $1}')"
[[ "$CONTROL_MANIFEST_DIGEST" =~ ^[0-9a-f]{64}$ ]] || fail "root control manifest digest is malformed"
install -d -o root -g root -m 0700 /run/lock/gshsapp
exec 9>"$LOCK_FILE"
flock -n 9 || fail "deployment, backup, or restore is active"
LIFECYCLE_LOCK_HELD=1 DEPLOY_ROOT="$DEPLOY_ROOT" /bin/bash "$CONTROL_ROOT/recover-backup-writer.sh" || fail "pending writer recovery failed"
LIFECYCLE_LOCK_HELD=1 DEPLOY_ROOT="$DEPLOY_ROOT" /bin/bash "$CONTROL_ROOT/recover-deployment-writer.sh" || fail "pending deployment recovery failed"
sweep_stale_import_validators || fail "stale managed import validators could not be safely removed"
if ! container_ids="$(docker ps --all --quiet --filter 'name=^/gshsapp-web$')"; then fail "application container state could not be enumerated"; fi
[[ -z "$container_ids" ]] || fail "application container state must be absent"
[[ -d "$OFFSITE_DIR" && ! -L "$OFFSITE_DIR" && "$(stat -c '%u:%g:%a' "$OFFSITE_DIR")" == "0:0:700" ]] || fail "offsite target is unsafe"
[[ -d "$OFFSITE_RECEIPT_DIR" && ! -L "$OFFSITE_RECEIPT_DIR" && "$(stat -c '%u:%g:%a' "$OFFSITE_RECEIPT_DIR")" == "0:0:700" ]] || fail "offsite receipt directory is unsafe"
"$PYTHON_BIN" "$CONTROL_ROOT/validate-operations-config.py" deploy \
  /etc/gshsapp-operations/deploy.env \
  --host-role-file /etc/gshsapp-operations/host-role --verify-pinned-offsite || {
  fail "offsite mount identity, ownership, or hardening is invalid"
}
if [[ -e "$IMPORT_PHASE_FILE" || -L "$IMPORT_PHASE_FILE" ]]; then
  recover_pending_import
  printf '%s\n' "Interrupted offline import recovered; application remains stopped for explicit deployment."
  exit 0
fi
[[ "$BACKUP_NAME" =~ ^backup-[0-9]{8}-[0-9]{6}-[a-f0-9]{8}\.tar\.gz$ ]] || fail "backup name is malformed"
[[ "$IMAGE_DIGEST" =~ ^sha256:[0-9a-f]{64}$ && "$IMAGE_TAG" =~ ^sha-[0-9a-f]{40}$ ]] || fail "candidate identity is malformed"
[[ "$EXPECTED_OFFSITE_RECEIPT_SHA256" =~ ^[0-9a-f]{64}$ ]] || fail "an authenticated offsite receipt digest is required"
approval="$DEPLOY_ROOT/approved-release.json"
host_role_file=/etc/gshsapp-operations/host-role
[[ -f "$approval" && ! -L "$approval" && "$(stat -c '%u:%g:%a:%h' "$approval")" == "0:0:400:1" ]] || fail "fresh root release approval is required"
[[ -f "$host_role_file" && ! -L "$host_role_file" && "$(stat -c '%u:%g:%a:%h' "$host_role_file")" == "0:0:400:1" ]] || fail "immutable host role is unavailable"
host_role="$(<"$host_role_file")"
[[ "$host_role" == "test" || "$host_role" == "prod" ]] || fail "immutable host role is invalid"
APPROVAL_FILE="$approval" EXPECTED_SHA="${IMAGE_TAG#sha-}" EXPECTED_DIGEST="$IMAGE_DIGEST" EXPECTED_HOST_ROLE="$host_role" EXPECTED_CONTROL_DIGEST="$CONTROL_MANIFEST_DIGEST" python3 - <<'PY' || fail "root release approval does not match this import"
import datetime,json,os
try: value=json.load(open(os.environ["APPROVAL_FILE"],encoding="utf-8"))
except Exception: raise SystemExit(1)
keys={"format","version","hostRole","candidateSha","imageDigest","controlManifestSha256","preproductionRunId","preproductionRunAttempt","approvedAt"}
if set(value)!=keys or value["format"]!="gshsapp-approved-release" or value["version"]!=2 or value["hostRole"]!=os.environ["EXPECTED_HOST_ROLE"] or value["candidateSha"]!=os.environ["EXPECTED_SHA"] or value["imageDigest"]!=os.environ["EXPECTED_DIGEST"] or value["controlManifestSha256"]!=os.environ["EXPECTED_CONTROL_DIGEST"]: raise SystemExit(1)
if value["hostRole"]=="prod":
    if not isinstance(value["preproductionRunId"],int) or value["preproductionRunId"]<1 or not isinstance(value["preproductionRunAttempt"],int) or value["preproductionRunAttempt"]<1: raise SystemExit(1)
elif value["preproductionRunId"] is not None or value["preproductionRunAttempt"] is not None: raise SystemExit(1)
approved=datetime.datetime.fromisoformat(value["approvedAt"].replace("Z","+00:00")); now=datetime.datetime.now(datetime.timezone.utc)
if approved.tzinfo is None or approved>now+datetime.timedelta(minutes=5) or now-approved>datetime.timedelta(hours=24): raise SystemExit(1)
PY
python3 "$CONTROL_ROOT/bootstrap-backup.py" verify-receipt --offsite-dir "$OFFSITE_DIR" --receipt-dir "$OFFSITE_RECEIPT_DIR" --name "$BACKUP_NAME" >/dev/null || fail "offsite backup receipt failed verification"
[[ "$(receipt_digest "$OFFSITE_RECEIPT_DIR/$BACKUP_NAME.receipt.json")" == "$EXPECTED_OFFSITE_RECEIPT_SHA256" ]] || fail "offsite receipt does not match the authenticated operations record"
[[ -d "$DATA_DIR" && ! -L "$DATA_DIR" ]] || fail "fresh data root is unavailable"
[[ -z "$(find "$DATA_DIR" -mindepth 1 -maxdepth 1 -print -quit)" ]] || fail "live data root must be empty; in-place restore is forbidden"
[[ ! -e "$DEPLOY_ROOT/bootstrap-complete.json" && ! -L "$DEPLOY_ROOT/bootstrap-complete.json" ]] || fail "host was already bootstrapped"

archive="$OFFSITE_DIR/$BACKUP_NAME"
WORK="$(mktemp -d "$DEPLOY_ROOT/.offline-import.XXXXXX")"
chmod 0700 "$WORK"
install -d -o root -g root -m 0700 "$WORK/output"
python3 "$CONTROL_ROOT/bootstrap-backup.py" extract --backup-dir "$OFFSITE_DIR" --name "$BACKUP_NAME" --output "$WORK/trusted"
image_ref="$DOCKER_IMAGE@$IMAGE_DIGEST"
docker pull "$image_ref" >/dev/null || fail "approved candidate image could not be pulled"
pulled_digests="$(docker image inspect --format '{{join .RepoDigests "\n"}}' "$image_ref")" || fail "approved candidate image could not be inspected"
grep -Fxq "$DOCKER_IMAGE@$IMAGE_DIGEST" <<<"$pulled_digests" || fail "pulled candidate digest mismatch"
image_revision="$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$image_ref")" || fail "candidate revision could not be inspected"
[[ "$image_revision" == "${IMAGE_TAG#sha-}" ]] || fail "candidate revision label mismatch"
run_import_validator "$archive" "$WORK/output/data/dev.db" "$image_ref" || \
  fail "isolated candidate migration validation failed"

[[ -f "$WORK/output/data/dev.db" && ! -L "$WORK/output/data/dev.db" ]] || fail "validated output database is missing"
python3 "$CONTROL_ROOT/validate-live-database.py" "$WORK/output/data/dev.db" >/dev/null || fail "candidate database failed root-reviewed validation"
python3 "$CONTROL_ROOT/bootstrap-backup.py" verify-receipt --offsite-dir "$OFFSITE_DIR" --receipt-dir "$OFFSITE_RECEIPT_DIR" --name "$BACKUP_NAME"
[[ "$(receipt_digest "$OFFSITE_RECEIPT_DIR/$BACKUP_NAME.receipt.json")" == "$EXPECTED_OFFSITE_RECEIPT_SHA256" ]] || fail "offsite receipt changed during import"
"$PYTHON_BIN" "$CONTROL_ROOT/validate-operations-config.py" deploy \
  /etc/gshsapp-operations/deploy.env \
  --host-role-file /etc/gshsapp-operations/host-role --verify-pinned-offsite || {
  fail "offsite mount changed during import"
}
install -d -o root -g root -m 0700 "$WORK/live-data"
install -o root -g root -m 0600 "$WORK/output/data/dev.db" "$WORK/live-data/dev.db"
for root in uploads user-content storage logs; do
  if [[ -d "$WORK/trusted/content/$root" && ! -L "$WORK/trusted/content/$root" ]]; then
    mv -T "$WORK/trusted/content/$root" "$WORK/live-data/$root"
  fi
done
python3 - "$WORK/live-data" <<'PY'
import os,stat,sys
root=os.path.realpath(sys.argv[1])
for directory, names, files in os.walk(root, followlinks=False):
    listed=os.lstat(directory)
    if not stat.S_ISDIR(listed.st_mode) or stat.S_ISLNK(listed.st_mode): raise SystemExit(1)
    for name in names+files:
        path=os.path.join(directory,name); item=os.lstat(path)
        if stat.S_ISLNK(item.st_mode) or not (stat.S_ISDIR(item.st_mode) or stat.S_ISREG(item.st_mode)) or (stat.S_ISREG(item.st_mode) and item.st_nlink!=1): raise SystemExit(1)
PY
chown -R 61001:61001 "$WORK/live-data"
find "$WORK/live-data" -type d -exec chmod 0700 {} +
find "$WORK/live-data" -type f -exec chmod 0600 {} +
python3 - "$WORK/live-data" <<'PY' || fail "prepared live data could not be durably synchronized"
import os,stat,sys
root=os.path.realpath(sys.argv[1])
for directory,names,files in os.walk(root,topdown=False,followlinks=False):
    for name in files:
        path=os.path.join(directory,name); info=os.lstat(path)
        if not stat.S_ISREG(info.st_mode) or stat.S_ISLNK(info.st_mode) or info.st_nlink!=1: raise SystemExit(1)
        descriptor=os.open(path,os.O_RDONLY|getattr(os,"O_CLOEXEC",0)|getattr(os,"O_NOFOLLOW",0)); os.fsync(descriptor); os.close(descriptor)
    descriptor=os.open(directory,os.O_RDONLY|getattr(os,"O_DIRECTORY",0)); os.fsync(descriptor); os.close(descriptor)
PY
receipt_sha256="$(receipt_digest "$OFFSITE_RECEIPT_DIR/$BACKUP_NAME.receipt.json")" || fail "offsite receipt digest could not be recorded"
[[ "$receipt_sha256" =~ ^[0-9a-f]{64}$ ]] || fail "offsite receipt digest is malformed"
live_tree_sha256="$(tree_digest "$WORK/live-data")" || fail "prepared live data tree is unsafe"
[[ "$live_tree_sha256" =~ ^[0-9a-f]{64}$ ]] || fail "prepared live data digest is malformed"
staging_name="$(basename -- "$WORK")"
[[ "$staging_name" =~ ^\.offline-import\.[A-Za-z0-9]{6,32}$ ]] || fail "import staging identity is malformed"
write_import_phase "$staging_name" "$live_tree_sha256" "$receipt_sha256" "$CONTROL_MANIFEST_DIGEST"
recover_pending_import
printf '%s\n' "Offline verified generation imported; application remains stopped for explicit deployment."
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  import_main "$@"
fi
