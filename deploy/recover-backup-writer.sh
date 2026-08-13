#!/usr/bin/env bash
set -Eeuo pipefail

PATH=/usr/sbin:/usr/bin:/sbin:/bin
LC_ALL=C
export PATH LC_ALL
IFS=$' \t\n'
DEPLOY_ROOT="${DEPLOY_ROOT:-/opt/gshsapp}"
PHASE_FILE="${PHASE_FILE:-$DEPLOY_ROOT/backup-phase.json}"
LOCK_FILE="${LOCK_FILE:-/run/lock/gshsapp/lifecycle.lock}"

[[ "$(id -u)" == "0" ]] || exit 1
CONTROL_ROOT=/usr/local/lib/gshsapp-operations
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  current_script="$(readlink -f -- "${BASH_SOURCE[0]}")" || exit 1
  [[ "$current_script" == "$CONTROL_ROOT/recover-backup-writer.sh" && -f "$current_script" && ! -L "$current_script" && "$(stat -c '%u:%g:%a:%h' "$current_script")" == "0:0:400:1" ]] || exit 1
  /bin/bash "$CONTROL_ROOT/install-root-operations.sh" --verify-installed >/dev/null || exit 1
fi
if [[ "${LIFECYCLE_LOCK_HELD:-0}" != "1" ]]; then
  install -d -o root -g root -m 0700 "$(dirname "$LOCK_FILE")"
  exec 8>"$LOCK_FILE"
  flock 8
fi
[[ -f "$PHASE_FILE" && ! -L "$PHASE_FILE" ]] || exit 0
phase_output="$(/usr/bin/python3 - "$PHASE_FILE" <<'PY'
import json,re,sys
try: value=json.load(open(sys.argv[1],encoding="utf-8"))
except Exception: raise SystemExit(1)
keys={"format","version","phase","containerId","imageId","configImage","restartPolicy","containerName","wasRunning","updatedAt"}
if set(value)!=keys or value["format"]!="gshsapp-backup-phase" or value["version"]!=3 or type(value["wasRunning"]) is not bool: raise SystemExit(1)
if value["phase"]=="healthy": print("healthy"); raise SystemExit(0)
if (value["phase"]!="restart-required" or re.fullmatch(r"[0-9a-f]{64}",value["containerId"]) is None
    or re.fullmatch(r"sha256:[0-9a-f]{64}",value["imageId"]) is None
    or re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._/@:+-]{0,254}",value["configImage"]) is None
    or value["restartPolicy"] not in {"always","unless-stopped","no","on-failure"}
    or re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,127}",value["containerName"]) is None): raise SystemExit(1)
print("restart-required");print(value["containerId"]);print(value["imageId"]);print(value["configImage"]);print(value["restartPolicy"]);print(value["containerName"]);print("true" if value["wasRunning"] else "false")
PY
)" || exit 1
phase_output="${phase_output//$'\r'/}"
readarray -t values <<<"$phase_output"
[[ "${values[0]:-}" == "healthy" && "${#values[@]}" == "1" ]] && exit 0
[[ "${values[0]:-}" == "restart-required" && "${#values[@]}" == "7" ]] || exit 1
container_id="${values[1]}"; expected_image="${values[2]}"; expected_config="${values[3]}"; original_policy="${values[4]}"; expected_name="${values[5]}"; was_running="${values[6]}"
[[ "$was_running" =~ ^(true|false)$ ]] || exit 1
actual_id="$(docker inspect --format '{{.Id}}' "$container_id")" || exit 1
actual_image="$(docker inspect --format '{{.Image}}' "$container_id")" || exit 1
actual_config="$(docker inspect --format '{{.Config.Image}}' "$container_id")" || exit 1
actual_name="$(docker inspect --format '{{.Name}}' "$container_id")" || exit 1
[[ "$actual_id" == "$container_id" && "$actual_image" == "$expected_image" &&
   "$actual_config" == "$expected_config" && "$actual_name" == "/$expected_name" ]] || exit 1
actual_policy="$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$container_id")" || exit 1
[[ "$actual_policy" == "no" || "$actual_policy" == "$original_policy" ]] || exit 1
if [[ "$actual_policy" != "$original_policy" ]]; then
  docker update --restart="$original_policy" "$container_id" >/dev/null || exit 1
  [[ "$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$container_id")" == "$original_policy" ]] || exit 1
fi
running="$(docker inspect --format '{{.State.Running}}' "$container_id")" || exit 1
if [[ "$was_running" == "true" ]]; then
  if [[ "$running" == "false" ]]; then docker start "$container_id" >/dev/null; elif [[ "$running" != "true" ]]; then exit 1; fi
  deadline=$((SECONDS + 120))
  while (( SECONDS < deadline )); do
    [[ "$(docker inspect --format '{{.Id}}' "$container_id")" == "$container_id" ]] || exit 1
    [[ "$(docker inspect --format '{{.Image}}' "$container_id")" == "$expected_image" ]] || exit 1
    running="$(docker inspect --format '{{.State.Running}}' "$container_id")" || exit 1
    health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container_id")" || exit 1
    [[ "$running" == "true" ]] || exit 1
    [[ "$health" == "healthy" ]] && break
    [[ "$health" == "starting" ]] || exit 1
    sleep 2
  done
  [[ "${health:-}" == "healthy" ]] || exit 1
else
  [[ "$running" == "false" ]] || exit 1
fi
/usr/bin/python3 - "$PHASE_FILE" <<'PY'
import datetime,json,os,sys,tempfile
directory=os.path.dirname(sys.argv[1]); fd,temp=tempfile.mkstemp(prefix=".backup-phase.",dir=directory)
with os.fdopen(fd,"w",encoding="utf-8",newline="\n") as output:
    json.dump({"format":"gshsapp-backup-phase","version":3,"phase":"healthy","containerId":"","imageId":"","configImage":"","restartPolicy":"","containerName":"","wasRunning":False,"updatedAt":datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00","Z")},output,separators=(",",":")); output.write("\n"); output.flush(); os.fsync(output.fileno())
os.chmod(temp,0o600); os.replace(temp,sys.argv[1])
if os.name != "nt":
    descriptor=os.open(directory,os.O_RDONLY|getattr(os,"O_DIRECTORY",0)); os.fsync(descriptor); os.close(descriptor)
PY
