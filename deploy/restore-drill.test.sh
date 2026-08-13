#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_ROOT="$(mktemp -d)"
PYTHON_LOG="$TEST_ROOT/python.log"
: >"$PYTHON_LOG"
FLOCK_LOG="$TEST_ROOT/flock.log"
: >"$FLOCK_LOG"
MOUNT_STATE_FILE="$TEST_ROOT/restore-data.mount"
: >"$MOUNT_STATE_FILE"
LIFECYCLE_LOCK_FILE="$TEST_ROOT/lifecycle.lock"
SERVER_PID=""
cleanup_test() {
  if [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" 2>/dev/null || :
    wait "$SERVER_PID" 2>/dev/null || :
  fi
  if [[ -n "${CREATED_TEMP_STATE:-}" && -f "$CREATED_TEMP_STATE" ]]; then
    while IFS= read -r created_temp; do
      case "$created_temp" in
        "$DEPLOY_ROOT"/.restore-drill.*)
          [[ ! -e "$created_temp" && ! -L "$created_temp" ]] || rm -rf -- "$created_temp"
          ;;
        *)
          printf 'Refusing to clean an unexpected restore-drill test path: %s\n' "$created_temp" >&2
          ;;
      esac
    done <"$CREATED_TEMP_STATE"
  fi
  if [[ "${KEEP_RESTORE_DRILL_TEST_ROOT:-0}" == "1" ]]; then
    printf 'Preserved restore-drill test root: %s\n' "$TEST_ROOT" >&2
  else
    rm -rf -- "$TEST_ROOT"
  fi
}
trap cleanup_test EXIT

if [[ -n "${PYTHON_BIN:-}" ]]; then
  PYTHON="$PYTHON_BIN"
elif command -v python3 >/dev/null 2>&1; then
  PYTHON=python3
else
  PYTHON=python
fi
NODE="$(command -v node)"
[[ -x "$NODE" ]]

FAKE_BIN="$TEST_ROOT/bin"
mkdir -p "$FAKE_BIN"
CREATED_TEMP_STATE="$TEST_ROOT/created-production-temp-paths"
: >"$CREATED_TEMP_STATE"
{
  printf '#!/usr/bin/env bash\nset -Eeuo pipefail\n'
  printf 'REAL_MKTEMP=%q\n' "$(command -v mktemp)"
  cat <<'FAKE'
created="$($REAL_MKTEMP "$@")"
case "$created" in
  */.restore-drill.*) printf '%s\n' "$created" >>"$CREATED_TEMP_STATE" ;;
esac
printf '%s\n' "$created"
FAKE
} >"$FAKE_BIN/mktemp"
cat >"$FAKE_BIN/timeout" <<'FAKE'
#!/usr/bin/env bash
set -Eeuo pipefail
shift
exec "$@"
FAKE
cat >"$FAKE_BIN/chown" <<'FAKE'
#!/usr/bin/env bash
set -Eeuo pipefail
# The production script runs as root. Windows focused tests cannot assign the
# numeric container identity, while the fake container runs as this test user.
exit 0
FAKE
cat >"$FAKE_BIN/findmnt" <<'FAKE'
#!/usr/bin/env bash
set -Eeuo pipefail
if [[ "$*" == *"FSTYPE,OPTIONS"* ]]; then
  [[ -s "$MOUNT_STATE_FILE" ]]
  printf '%s\n' 'tmpfs rw,nosuid,nodev,noexec,size=786432k,nr_inodes=12000,uid=61001,gid=61001,mode=700'
else
  printf '%s\n' "$OFFSITE_MOUNT_SOURCE"
fi
FAKE
cat >"$FAKE_BIN/mount" <<'FAKE'
#!/usr/bin/env bash
set -Eeuo pipefail
target="${!#}"
[[ "$*" == *' -t tmpfs '* || " $* " == *' -t tmpfs '* ]]
printf '%s\n' "$target" >"$MOUNT_STATE_FILE"
FAKE
cat >"$FAKE_BIN/umount" <<'FAKE'
#!/usr/bin/env bash
set -Eeuo pipefail
target="${!#}"
[[ "$(<"$MOUNT_STATE_FILE")" == "$target" ]]
: >"$MOUNT_STATE_FILE"
FAKE
cat >"$FAKE_BIN/sync" <<'FAKE'
#!/usr/bin/env bash
set -Eeuo pipefail
exit 0
FAKE
cat >"$FAKE_BIN/flock" <<'FAKE'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$*" >>"$FLOCK_LOG"
[[ "${FAIL_FLOCK:-0}" != "1" ]]
FAKE
cat >"$FAKE_BIN/id" <<'FAKE'
#!/usr/bin/env bash
set -Eeuo pipefail
if [[ "${1:-}" == "-u" ]]; then printf '%s\n' 0; exit 0; fi
exec /usr/bin/id "$@"
FAKE
cat >"$FAKE_BIN/install" <<'FAKE'
#!/usr/bin/env bash
set -Eeuo pipefail
if [[ " $* " == " -d -o root -g root -m 0700 "* ]]; then
  target="${!#}"
  mkdir -p "$target"
  chmod 0700 "$target"
  exit 0
fi
exec /usr/bin/install "$@"
FAKE
cat >"$FAKE_BIN/stat" <<'FAKE'
#!/usr/bin/env bash
set -Eeuo pipefail
if [[ "$*" == *"%u:%g:%a:%h"* ]]; then
  target="${!#}"
  if [[ "$target" == *restore-drill-phase.json ]]; then printf '%s\n' '0:0:600:1'; else printf '%s\n' '0:0:400:1'; fi
  exit 0
fi
if [[ "$*" == *"%u:%g:%a"* ]]; then
  target="${!#}"
  if [[ "$target" == "$DEPLOY_ROOT" ]]; then printf '%s\n' '0:0:755'; else printf '%s\n' '0:0:700'; fi
  exit 0
fi
if [[ "$*" == *"%d"* ]]; then
  target="${!#}"
  if [[ "$target" == "$OFFSITE_DIR" ]]; then printf '%s\n' 2; else printf '%s\n' 1; fi
  exit 0
fi
exec /usr/bin/stat "$@"
FAKE
{
  printf '#!/usr/bin/env bash\nset -Eeuo pipefail\n'
  printf 'REAL_PYTHON=%q\n' "$PYTHON"
  printf 'PYTHON_LOG=%q\n' "$PYTHON_LOG"
  cat <<'FAKE'
for variable in BACKUP_DIR RECEIPT_DIR STAGING_DIR VALIDATED_ROOT; do
  value="${!variable:-}"
  if [[ "$value" == /* ]] && command -v cygpath >/dev/null 2>&1; then
    printf -v "$variable" '%s' "$(cygpath -w "$value")"
    export "$variable"
  fi
done
if [[ "${1:-}" == */bootstrap-backup.py && "${2:-}" == "verify-receipt" ]]; then
  printf '%s\n' "$*" >>"$PYTHON_LOG"
  if [[ "${MUTATE_OFFSITE_AFTER_RECEIPT:-0}" == "1" && ! -e "$MUTATION_DONE_FILE" ]]; then
    printf '%s' 'substituted-offsite-generation' >"$OFFSITE_ARCHIVE_BASH"
    "$REAL_PYTHON" - "$OFFSITE_ARCHIVE_NATIVE" "$OFFSITE_METADATA_NATIVE" <<'PY'
import hashlib
import json
import pathlib
import sys
archive = pathlib.Path(sys.argv[1])
metadata_path = pathlib.Path(sys.argv[2])
metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
metadata["size"] = archive.stat().st_size
metadata["sha256"] = hashlib.sha256(archive.read_bytes()).hexdigest()
metadata_path.write_text(json.dumps(metadata), encoding="utf-8")
PY
    : >"$MUTATION_DONE_FILE"
  fi
  exit 0
fi
exec "$REAL_PYTHON" "$@"
FAKE
} >"$FAKE_BIN/python"
{
  printf '#!/usr/bin/env bash\nset -Eeuo pipefail\n'
  printf 'REAL_NODE=%q\n' "$NODE"
  cat <<'FAKE'
printf '%q ' "$@" >>"$DOCKER_LOG"
printf '\n' >>"$DOCKER_LOG"

remove_all() {
  : >"$1"
}

if [[ "${1:-}" == "compose" ]]; then
  shift
  project=""
  compose_file=""
  env_file=""
  action=""
  while [[ "$#" -gt 0 ]]; do
    case "$1" in
      --project-name) project="$2"; shift 2 ;;
      --env-file) env_file="$2"; shift 2 ;;
      -f) compose_file="$2"; shift 2 ;;
      version|config|run|up|ps|down) action="$1"; shift; break ;;
      *) shift ;;
    esac
  done
  case "$action" in
    version|config) exit 0 ;;
    run)
      [[ " $* " == *" --rm "* && " $* " == *" --no-deps "* && " $* " == *" migrate "* ]]
      exit 0
      ;;
    up)
      [[ " $* " == *" -d "* && " $* " == *" --wait "* && " $* " == *" --wait-timeout 90 "* && " $* " == *" web "* ]]
      cp "$compose_file" "$CAPTURE_DIR/compose.yml"
      cp "$(dirname "$compose_file")/.env" "$CAPTURE_DIR/runtime.env"
      printf '%s\n' "$project" >"$PROJECT_STATE"
      printf '%s\n' cccccccccccc >"$CONTAINER_STATE"
      : >"$NETWORK_STATE"
      exit 0
      ;;
    ps)
      [[ " $* " == *" -q "* && " $* " == *" web "* ]]
      printf '%s\n' cccccccccccc
      exit 0
      ;;
    down)
      if [[ "${FAIL_COMPOSE_DOWN:-0}" == "1" ]]; then exit 73; fi
      remove_all "$CONTAINER_STATE"
      remove_all "$NETWORK_STATE"
      remove_all "$VOLUME_STATE"
      exit 0
      ;;
  esac
  exit 90
fi

case "${1:-} ${2:-}" in
  "info ") exit 0 ;;
  "container ls")
    [[ "${FAIL_CONTAINER_LIST:-0}" != "1" ]] || exit 71
    cat "$CONTAINER_STATE"
    exit 0
    ;;
  "container rm") remove_all "$CONTAINER_STATE"; exit 0 ;;
  "network ls") cat "$NETWORK_STATE"; exit 0 ;;
  "network rm") remove_all "$NETWORK_STATE"; exit 0 ;;
  "volume ls") cat "$VOLUME_STATE"; exit 0 ;;
  "volume rm") remove_all "$VOLUME_STATE"; exit 0 ;;
  "image inspect") printf '%s\n' "${IMAGE_TAG#sha-}"; exit 0 ;;
  "network inspect")
    echo "A network-none restore drill must not inspect a Docker network." >&2
    exit 92
    ;;
esac

case "${1:-}" in
  pull) exit 0 ;;
  inspect)
    printf '%s\n' '61001:61001|managed-v1|none|true|["no-new-privileges:true"]|["ALL"]|no|false|null|false|{}|null|none'
    exit 0
    ;;
  exec)
    [[ " $* " == *" -i "* && " $* " == *" --env EXPECTED_VERSION="* && " $* " == *" cccccccccccc node -e "* ]]
    probe_input="$(cat)"
    [[ "$probe_input" == *'admin-private-fixture'* && "$probe_input" == *'password-private-fixture'* ]]
    expected_version=""
    for argument in "$@"; do
      case "$argument" in
        EXPECTED_VERSION=*) expected_version="${argument#EXPECTED_VERSION=}" ;;
      esac
    done
    [[ -n "$expected_version" ]]
    probe_script="${!#}"
    probe_script="${probe_script//127.0.0.1:3000/127.0.0.1:$RESTORE_DRILL_PORT}"
    printf '%s' "$probe_input" | EXPECTED_VERSION="$expected_version" "$REAL_NODE" -e "$probe_script"
    exit 0
    ;;
  run)
    [[ " $* " == *" --network none "* ]]
    [[ " $* " == *" --read-only "* ]]
    [[ " $* " == *" --cap-drop ALL "* ]]
    [[ " $* " == *" --security-opt no-new-privileges "* ]]
    [[ " $* " == *" --label io.gshsapp.restore-drill=managed-v1 "* ]]
    output=""
    for argument in "$@"; do
      case "$argument" in
        type=bind,src=*,dst=/output)
          output="${argument#type=bind,src=}"
          output="${output%%,dst=*}"
          ;;
      esac
    done
    [[ -n "$output" ]]
    mkdir -p "$output/data"
    printf 'isolated sqlite fixture' >"$output/data/dev.db"
    exit 0
    ;;
esac

exit 91
FAKE
} >"$FAKE_BIN/docker"
chmod 700 "$FAKE_BIN/mktemp" "$FAKE_BIN/timeout" "$FAKE_BIN/chown" "$FAKE_BIN/findmnt" "$FAKE_BIN/mount" "$FAKE_BIN/umount" "$FAKE_BIN/sync" "$FAKE_BIN/flock" "$FAKE_BIN/id" "$FAKE_BIN/install" "$FAKE_BIN/stat" "$FAKE_BIN/python" "$FAKE_BIN/docker"

PORT_FILE="$TEST_ROOT/http-port"
AUTH_PROBE_LOG="$TEST_ROOT/auth-probe.log"
: >"$AUTH_PROBE_LOG"
EXPECTED_VERSION="sha-$(printf 'a%.0s' {1..40})"
"$PYTHON" - "$PORT_FILE" "$AUTH_PROBE_LOG" "$EXPECTED_VERSION" 'admin-private-fixture' 'password-private-fixture' <<'PY' &
import http.server
import json
import sys
import urllib.parse

port_file, auth_probe_log, version, expected_user, expected_password = sys.argv[1:]

class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, _format, *_args):
        pass
    def has_canonical_forwarded_loopback(self):
        return self.headers.get_all("x-forwarded-for", []) == ["127.0.0.1"]
    def log_auth_request(self):
        with open(auth_probe_log, "a", encoding="utf-8") as output:
            output.write(f"{self.command} {self.path} x-forwarded-for={self.headers.get('x-forwarded-for', '')}\n")
    def send_body(self, status, body, *, content_type=None, location=None, cookie=None):
        self.send_response(status)
        if content_type:
            self.send_header("Content-Type", content_type)
        if location:
            self.send_header("Location", location)
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def do_GET(self):
        if self.path == "/api/health":
            body = json.dumps({"ok": True, "service": "gshsapp", "version": version, "memberServiceSuspended": False}).encode()
            self.send_body(200, body, content_type="application/json")
        elif self.path == "/api/auth/csrf":
            self.log_auth_request()
            if not self.has_canonical_forwarded_loopback():
                self.send_body(400, b"untrusted proxy chain")
                return
            body = b'{"csrfToken":"drill-csrf"}'
            self.send_body(200, body, content_type="application/json", cookie="csrf=drill; HttpOnly; Path=/")
        elif self.path == "/admin":
            self.log_auth_request()
            if not self.has_canonical_forwarded_loopback() or "session=drill" not in self.headers.get("Cookie", ""):
                self.send_body(302, b"", location="/login")
                return
            body = b"<html>isolated admin</html>"
            self.send_body(200, body, content_type="text/html")
        elif self.path == "/login":
            self.send_body(200, b"<html>login</html>", content_type="text/html")
        else:
            self.send_body(404, b"not found")
    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length)
        if self.path != "/api/auth/callback/credentials":
            self.send_body(404, b"not found")
            return
        self.log_auth_request()
        values = urllib.parse.parse_qs(body.decode("utf-8"), strict_parsing=True)
        expected_origin = f"http://127.0.0.1:{self.server.server_port}"
        valid = (
            self.has_canonical_forwarded_loopback()
            and self.headers.get("Origin") == expected_origin
            and self.headers.get("Referer") == expected_origin + "/login"
            and "csrf=drill" in self.headers.get("Cookie", "")
            and values == {
                "csrfToken": ["drill-csrf"],
                "userId": [expected_user],
                "password": [expected_password],
                "callbackUrl": [expected_origin + "/admin"],
                "json": ["true"],
            }
        )
        if not valid:
            self.send_body(401, b"invalid restore-drill login")
            return
        self.send_body(302, b"", location="/admin", cookie="session=drill; HttpOnly; Path=/")

server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
with open(port_file, "w", encoding="utf-8") as output:
    output.write(str(server.server_port))
server.serve_forever()
PY
SERVER_PID="$!"
for _ in {1..100}; do
  [[ -s "$PORT_FILE" ]] && break
  sleep 0.05
done
[[ -s "$PORT_FILE" ]]
RESTORE_DRILL_PORT="$(cat "$PORT_FILE")"

BACKUP_DIR_BASH="$TEST_ROOT/app-writable-backup"
OFFSITE_DIR_BASH="$TEST_ROOT/offsite"
OFFSITE_RECEIPT_DIR_BASH="$OFFSITE_DIR_BASH/.gshsapp-receipts"
mkdir -p "$BACKUP_DIR_BASH" "$OFFSITE_DIR_BASH" "$OFFSITE_RECEIPT_DIR_BASH"
BACKUP_NAME="backup-20260813-010203-abcdef12.tar.gz"
MALICIOUS_LOCAL_NAME="backup-20260813-020304-deadbeef.tar.gz"
printf 'reviewed-offsite-archive' >"$OFFSITE_DIR_BASH/$BACKUP_NAME"
printf 'app-controlled-canonical-archive' >"$BACKUP_DIR_BASH/$MALICIOUS_LOCAL_NAME"
"$PYTHON" - "$OFFSITE_DIR_BASH/$BACKUP_NAME" "$OFFSITE_RECEIPT_DIR_BASH" "$BACKUP_DIR_BASH/$MALICIOUS_LOCAL_NAME" <<'PY'
import datetime
import hashlib
import json
import pathlib
import sys

archive = pathlib.Path(sys.argv[1])
receipt_dir = pathlib.Path(sys.argv[2])
local_archive = pathlib.Path(sys.argv[3])
metadata = {
    "format": "gshsapp-backup",
    "version": 2,
    "file": archive.name,
    "createdAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
    "reason": "scheduled",
    "size": archive.stat().st_size,
    "sha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
}
archive.with_name(archive.name + ".json").write_text(json.dumps(metadata), encoding="utf-8")
receipt = {
    "format": "gshsapp-offsite-receipt",
    "version": 1,
    "file": archive.name,
    "createdAt": metadata["createdAt"],
    "exportedAt": metadata["createdAt"],
    "size": metadata["size"],
    "sha256": metadata["sha256"],
}
(receipt_dir / f"{archive.name}.receipt.json").write_text(json.dumps(receipt), encoding="utf-8")
local_metadata = dict(metadata)
local_metadata.update({
    "file": local_archive.name,
    "createdAt": (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=1)).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
    "size": local_archive.stat().st_size,
    "sha256": hashlib.sha256(local_archive.read_bytes()).hexdigest(),
})
local_archive.with_name(local_archive.name + ".json").write_text(json.dumps(local_metadata), encoding="utf-8")
PY
BACKUP_DIR="$("$PYTHON" -c 'import os,sys; print(os.path.abspath(sys.argv[1]))' "$BACKUP_DIR_BASH")"
OFFSITE_DIR="$("$PYTHON" -c 'import os,sys; print(os.path.abspath(sys.argv[1]))' "$OFFSITE_DIR_BASH")"
OFFSITE_RECEIPT_DIR="$OFFSITE_DIR/.gshsapp-receipts"
OFFSITE_MOUNT_SOURCE='test-offsite-device'
EXPECTED_OFFSITE_NAME="$BACKUP_NAME"
OFFSITE_ARCHIVE_BASH="$OFFSITE_DIR_BASH/$BACKUP_NAME"
OFFSITE_ARCHIVE_NATIVE="$OFFSITE_DIR/$BACKUP_NAME"
OFFSITE_METADATA_NATIVE="$OFFSITE_DIR/$BACKUP_NAME.json"
MUTATION_DONE_FILE="$TEST_ROOT/offsite-mutation.done"
cp "$OFFSITE_ARCHIVE_BASH" "$TEST_ROOT/original-offsite-archive"
cp "$OFFSITE_DIR_BASH/$BACKUP_NAME.json" "$TEST_ROOT/original-offsite-metadata"

CAPTURE_DIR="$TEST_ROOT/capture"
mkdir -p "$CAPTURE_DIR"
DEPLOY_ROOT="$TEST_ROOT/deploy-state"
mkdir -p "$DEPLOY_ROOT"
# A crash after deleting the private workspace but before deleting its durable
# phase must be recovered idempotently by the next invocation.
printf '%s\n' '{"format":"gshsapp-restore-drill-phase","version":1,"workspace":".restore-drill.ABC123","mountSource":"gshsapp-restore-drill-data","createdAt":"2026-08-13T00:00:00.000Z"}' >"$DEPLOY_ROOT/restore-drill-phase.json"
TEST_CONTROL_ROOT="$TEST_ROOT/installed-controls"
mkdir -p "$TEST_CONTROL_ROOT"
cp "$REPO_ROOT/deploy/restore-drill.sh" "$TEST_CONTROL_ROOT/restore-drill.sh"
sed -i "s|^CONTROL_ROOT=/usr/local/lib/gshsapp-operations$|CONTROL_ROOT=$TEST_CONTROL_ROOT|" "$TEST_CONTROL_ROOT/restore-drill.sh"
sed -i 's|^PATH=/usr/sbin:/usr/bin:/sbin:/bin$|PATH='"$FAKE_BIN"':/usr/sbin:/usr/bin:/sbin:/bin|' "$TEST_CONTROL_ROOT/restore-drill.sh"
sed -i 's|^assert_restore_candidate_approval$|: # approval boundary is covered by source-policy tests|' "$TEST_CONTROL_ROOT/restore-drill.sh"
sed -i 's|^publish_restore_receipt$|: # receipt publication is covered by source-policy tests|' "$TEST_CONTROL_ROOT/restore-drill.sh"
printf '%s\n' '# test fixture intercepted by the Python wrapper' >"$TEST_CONTROL_ROOT/bootstrap-backup.py"
printf '%s\n' 'raise SystemExit(0)' >"$TEST_CONTROL_ROOT/validate-operations-config.py"
cat >"$TEST_CONTROL_ROOT/install-root-operations.sh" <<'FAKE'
#!/usr/bin/env bash
set -Eeuo pipefail
[[ "$#" == 1 && "$1" == "--verify-installed" ]]
FAKE
cat >"$TEST_CONTROL_ROOT/recover-backup-writer.sh" <<'FAKE'
#!/usr/bin/env bash
set -Eeuo pipefail
[[ "${LIFECYCLE_LOCK_HELD:-0}" == "1" ]]
[[ "${DEPLOY_ROOT:-}" == "$EXPECTED_DEPLOY_ROOT" ]]
printf '%s\n' recovered >"$RECOVERY_LOG"
FAKE
cat >"$TEST_CONTROL_ROOT/recover-deployment-writer.sh" <<'FAKE'
#!/usr/bin/env bash
set -Eeuo pipefail
[[ "${LIFECYCLE_LOCK_HELD:-0}" == "1" ]]
[[ "${DEPLOY_ROOT:-}" == "$EXPECTED_DEPLOY_ROOT" ]]
FAKE
chmod 0500 "$TEST_CONTROL_ROOT"
chmod 0400 "$TEST_CONTROL_ROOT/restore-drill.sh" "$TEST_CONTROL_ROOT/bootstrap-backup.py" \
  "$TEST_CONTROL_ROOT/validate-operations-config.py" \
  "$TEST_CONTROL_ROOT/install-root-operations.sh" "$TEST_CONTROL_ROOT/recover-backup-writer.sh" \
  "$TEST_CONTROL_ROOT/recover-deployment-writer.sh"
DRILL_SCRIPT="$TEST_CONTROL_ROOT/restore-drill.sh"
EXPECTED_DEPLOY_ROOT="$DEPLOY_ROOT"
RECOVERY_LOG="$TEST_ROOT/recovery.log"
DOCKER_LOG="$TEST_ROOT/docker.log"
CONTAINER_STATE="$TEST_ROOT/containers"
NETWORK_STATE="$TEST_ROOT/networks"
VOLUME_STATE="$TEST_ROOT/volumes"
PROJECT_STATE="$TEST_ROOT/project"
printf '%s\n' aaaaaaaaaaaa >"$CONTAINER_STATE"
printf '%s\n' bbbbbbbbbbbb >"$NETWORK_STATE"
printf '%s\n' gshsapp_restore_drill_volume >"$VOLUME_STATE"
: >"$DOCKER_LOG"

export PATH="$FAKE_BIN:$PATH"
export PYTHON_BIN="$FAKE_BIN/python"
export BACKUP_DIR OFFSITE_DIR OFFSITE_RECEIPT_DIR OFFSITE_MOUNT_SOURCE
export GSHSAPP_OFFSITE_PINNED=manual
export EXPECTED_OFFSITE_NAME PYTHON_LOG
export OFFSITE_ARCHIVE_BASH OFFSITE_ARCHIVE_NATIVE OFFSITE_METADATA_NATIVE MUTATION_DONE_FILE
export FLOCK_LOG LIFECYCLE_LOCK_FILE
export MOUNT_STATE_FILE
export DEPLOY_ROOT EXPECTED_DEPLOY_ROOT RECOVERY_LOG
export CAPTURE_DIR DOCKER_LOG CONTAINER_STATE NETWORK_STATE VOLUME_STATE PROJECT_STATE CREATED_TEMP_STATE
export IMAGE_TAG="$EXPECTED_VERSION"
export IMAGE_DIGEST="sha256:$(printf 'b%.0s' {1..64})"
export DOCKER_IMAGE=example.invalid/gshsapp
export APP_VERSION="$EXPECTED_VERSION"
export HOST_BIND_IP=127.0.0.1
export RESTORE_DRILL_PORT
export E2E_ADMIN_USER='admin-private-fixture'
export E2E_ADMIN_PASSWORD='password-private-fixture'
# A caller-controlled environment value must never choose the trusted proxy
# identity used by the in-container authentication probe.
export X_FORWARDED_FOR='203.0.113.99'
export AUTH_SECRET='production-secret-must-not-be-copied'
export BREVO_API_KEY='provider-secret-must-not-be-copied'
export NEXT_PUBLIC_NEIS_API_KEY='provider-key-must-not-be-copied'
export RESTORE_DRILL_OUTPUT_FILE="$TEST_ROOT/result.env"

assert_no_restore_temp_leaks() {
  local created_temp
  while IFS= read -r created_temp; do
    case "$created_temp" in
      "$DEPLOY_ROOT"/.restore-drill.*) ;;
      *)
        echo "Restore drill created mutable state outside the configured deployment root." >&2
        return 1
        ;;
    esac
    [[ -z "$created_temp" || ( ! -e "$created_temp" && ! -L "$created_temp" ) ]] || {
      echo "Restore drill left its private temporary root behind." >&2
      return 1
    }
  done <"$CREATED_TEMP_STATE"
}

/bin/bash "$DRILL_SCRIPT" >"$TEST_ROOT/success.stdout" 2>"$TEST_ROOT/success.stderr"
assert_no_restore_temp_leaks
grep -Fxq recovered "$RECOVERY_LOG"
if [[ -n "$(find "$REPO_ROOT/deploy" -maxdepth 1 -name '.restore-drill.*' -print -quit)" ]]; then
  echo "Restore drill wrote mutable state into the installed control directory." >&2
  exit 1
fi
grep -Fxq -- '-n 9' "$FLOCK_LOG"
[[ -f "$LIFECYCLE_LOCK_FILE" ]]
diff -u <(printf 'Restore drill started.\nRestore drill succeeded.\n') "$TEST_ROOT/success.stdout"
[[ ! -s "$TEST_ROOT/success.stderr" ]]
if grep -Fq -e "$E2E_ADMIN_USER" -e "$E2E_ADMIN_PASSWORD" -e "$AUTH_SECRET" -e "$BREVO_API_KEY" "$TEST_ROOT/success.stdout" "$TEST_ROOT/success.stderr"; then
  echo "Restore drill leaked a credential to its process output." >&2
  exit 1
fi

runtime_env="$CAPTURE_DIR/runtime.env"
[[ -f "$runtime_env" ]]
if grep -Eq '^(BREVO_|NEXT_PUBLIC_NEIS_API_KEY|GOOGLE_|SMTP_|AUTH_SECRET=production-secret)' "$runtime_env"; then
  echo "Restore drill copied production or provider secrets into the candidate environment." >&2
  exit 1
fi
diff -u \
  <(printf '%s\n' AUTH_SECRET AUTH_TRUST_HOST AUTH_URL DATABASE_URL NEXTAUTH_URL NEXT_PUBLIC_APP_URL TRUSTED_PROXY_HOPS | sort) \
  <(cut -d= -f1 "$runtime_env" | sort)
generated_secret="$(sed -n 's/^AUTH_SECRET=//p' "$runtime_env")"
[[ "$generated_secret" =~ ^[a-f0-9]{96}$ ]]
grep -Fxq 'TRUSTED_PROXY_HOPS=1' "$runtime_env"

compose_file="$CAPTURE_DIR/compose.yml"
[[ "$(grep -Fc 'network_mode: none' "$compose_file")" -eq 2 ]]
grep -Fq 'restart: "no"' "$compose_file"
grep -Fq 'user: "61001:61001"' "$compose_file"
grep -Fq 'read_only: true' "$compose_file"
grep -Fq 'no-new-privileges:true' "$compose_file"
[[ "$(grep -Fc 'mem_limit:' "$compose_file")" -eq 2 ]]
[[ "$(grep -Fc 'memswap_limit:' "$compose_file")" -eq 2 ]]
[[ "$(grep -Fc 'cpus: 2.0' "$compose_file")" -eq 2 ]]
if grep -Eq 'network_mode: host|internal: true|^[[:space:]]+ports:' "$compose_file"; then
  echo "Restore drill attached a candidate container to a routable network." >&2
  exit 1
fi
grep -Eq 'exec -i --env EXPECTED_VERSION=[^ ]+ cccccccccccc node -e' "$DOCKER_LOG"
# The non-suspended restored member must complete a real CSRF/login/admin
# session while every auth request presents the one fixed trusted hop.
grep -Fxq 'GET /api/auth/csrf x-forwarded-for=127.0.0.1' "$AUTH_PROBE_LOG"
grep -Fxq 'POST /api/auth/callback/credentials x-forwarded-for=127.0.0.1' "$AUTH_PROBE_LOG"
grep -Fxq 'GET /admin x-forwarded-for=127.0.0.1' "$AUTH_PROBE_LOG"
if grep -Ev '^(GET /api/auth/csrf|POST /api/auth/callback/credentials|GET /admin) x-forwarded-for=127\.0\.0\.1$' "$AUTH_PROBE_LOG" | grep -q .; then
  echo "Restore-drill authentication used a non-canonical forwarded client identity." >&2
  exit 1
fi

grep -Fq 'container rm --force aaaaaaaaaaaa' "$DOCKER_LOG"
grep -Fq 'network rm bbbbbbbbbbbb' "$DOCKER_LOG"
grep -Fq 'volume rm --force gshsapp_restore_drill_volume' "$DOCKER_LOG"
pull_line="$(grep -n '^pull ' "$DOCKER_LOG" | head -n 1 | cut -d: -f1)"
inspect_line="$(grep -n '^image inspect ' "$DOCKER_LOG" | head -n 1 | cut -d: -f1)"
validator_line="$(grep -n '^run ' "$DOCKER_LOG" | head -n 1 | cut -d: -f1)"
[[ -n "$pull_line" && -n "$inspect_line" && -n "$validator_line" ]]
(( pull_line < inspect_line && inspect_line < validator_line ))
[[ ! -s "$CONTAINER_STATE" && ! -s "$NETWORK_STATE" && ! -s "$VOLUME_STATE" ]]
[[ ! -s "$MOUNT_STATE_FILE" ]]
grep -Fq -- "--name $BACKUP_NAME" "$PYTHON_LOG"
grep -Fq -- "--offsite-dir $OFFSITE_DIR" "$PYTHON_LOG"
grep -Fq -- "--receipt-dir $OFFSITE_RECEIPT_DIR" "$PYTHON_LOG"
diff -u <(printf '%s\n' \
  "RESTORE_SOURCE_NAME=$BACKUP_NAME" \
  "LATEST_BACKUP_NAME=$BACKUP_NAME" \
  'RESTORE_BASE_URL=http://127.0.0.1:3000' \
  "RESTORE_VERSION=$EXPECTED_VERSION") "$RESTORE_DRILL_OUTPUT_FILE"

# The exact root receipt remains authoritative if the offsite pair is swapped
# after verify-receipt but before staging.
: >"$DOCKER_LOG"
printf '%s' 'substituted-offsite-generation' >"$OFFSITE_ARCHIVE_BASH"
"$PYTHON" - "$OFFSITE_ARCHIVE_NATIVE" "$OFFSITE_METADATA_NATIVE" <<'PY'
import hashlib
import json
import pathlib
import sys
archive = pathlib.Path(sys.argv[1])
metadata_path = pathlib.Path(sys.argv[2])
metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
metadata["size"] = archive.stat().st_size
metadata["sha256"] = hashlib.sha256(archive.read_bytes()).hexdigest()
metadata_path.write_text(json.dumps(metadata), encoding="utf-8")
PY
if /bin/bash "$DRILL_SCRIPT" >"$TEST_ROOT/swap.stdout" 2>"$TEST_ROOT/swap.stderr"; then
  echo "An offsite generation swapped after receipt verification must fail." >&2
  exit 1
fi
grep -Fq 'No fresh validated backup pair is available.' "$TEST_ROOT/swap.stderr"
if grep -q '^run ' "$DOCKER_LOG"; then
  echo "Candidate code ran after the offsite pair diverged from its root receipt." >&2
  exit 1
fi
assert_no_restore_temp_leaks
cp "$TEST_ROOT/original-offsite-archive" "$OFFSITE_ARCHIVE_BASH"
cp "$TEST_ROOT/original-offsite-metadata" "$OFFSITE_DIR_BASH/$BACKUP_NAME.json"

# Archive mtime cannot make a stale root receipt fresh.
"$PYTHON" - "$OFFSITE_RECEIPT_DIR_BASH/$BACKUP_NAME.receipt.json" <<'PY'
import json
import pathlib
import sys
metadata = pathlib.Path(sys.argv[1])
value = json.loads(metadata.read_text(encoding="utf-8"))
value["createdAt"] = "2020-01-01T00:00:00.000Z"
metadata.write_text(json.dumps(value), encoding="utf-8")
PY
touch "$OFFSITE_DIR_BASH/$BACKUP_NAME"
: >"$DOCKER_LOG"
if /bin/bash "$DRILL_SCRIPT" >"$TEST_ROOT/stale.stdout" 2>"$TEST_ROOT/stale.stderr"; then
  echo "A stale root receipt timestamp must fail the restore drill." >&2
  exit 1
fi
grep -Fq 'No fresh root-receipted offsite backup is available.' "$TEST_ROOT/stale.stderr"
assert_no_restore_temp_leaks
if grep -q '^run ' "$DOCKER_LOG"; then
  echo "Candidate code ran before backup-pair freshness validation." >&2
  exit 1
fi

# Docker API discovery errors are failures, never an empty stale-resource set.
FAIL_CONTAINER_LIST=1
export FAIL_CONTAINER_LIST
if /bin/bash "$DRILL_SCRIPT" >"$TEST_ROOT/api.stdout" 2>"$TEST_ROOT/api.stderr"; then
  echo "A stale-resource Docker API failure must abort the restore drill." >&2
  exit 1
fi
grep -Fq 'Unable to enumerate managed restore-drill containers.' "$TEST_ROOT/api.stderr"
assert_no_restore_temp_leaks
unset FAIL_CONTAINER_LIST

# A busy shared lifecycle lock aborts before stale-resource discovery or image work.
: >"$DOCKER_LOG"
FAIL_FLOCK=1
export FAIL_FLOCK
if /bin/bash "$DRILL_SCRIPT" >"$TEST_ROOT/lock.stdout" 2>"$TEST_ROOT/lock.stderr"; then
  echo "A busy deployment lifecycle lock must abort the restore drill." >&2
  exit 1
fi
grep -Fq 'Deployment, backup, import, or another restore drill is active.' "$TEST_ROOT/lock.stderr"
[[ ! -s "$DOCKER_LOG" ]]
assert_no_restore_temp_leaks
unset FAIL_FLOCK

# Cleanup is synchronous and its failure changes an otherwise successful run to failure.
"$PYTHON" - "$OFFSITE_RECEIPT_DIR_BASH/$BACKUP_NAME.receipt.json" "$OFFSITE_DIR_BASH/$BACKUP_NAME.json" <<'PY'
import json
import pathlib
import sys
metadata = pathlib.Path(sys.argv[1])
value = json.loads(metadata.read_text(encoding="utf-8"))
offsite = json.loads(pathlib.Path(sys.argv[2]).read_text(encoding="utf-8"))
value["createdAt"] = offsite["createdAt"]
metadata.write_text(json.dumps(value), encoding="utf-8")
PY
printf '%s\n' '{"stale":"must be invalidated"}' >"$DEPLOY_ROOT/restore-drill-receipt.json"
FAIL_COMPOSE_DOWN=1
export FAIL_COMPOSE_DOWN
if /bin/bash "$DRILL_SCRIPT" >"$TEST_ROOT/cleanup.stdout" 2>"$TEST_ROOT/cleanup.stderr"; then
  echo "A failed synchronous cleanup must fail the restore drill." >&2
  exit 1
fi
grep -Fq 'Restore drill cleanup failed.' "$TEST_ROOT/cleanup.stderr"
assert_no_restore_temp_leaks
[[ ! -e "$DEPLOY_ROOT/restore-drill-receipt.json" ]]

cleanup_line="$(grep -nF 'cleanup_runtime || fail "Restore drill cleanup failed."' "$REPO_ROOT/deploy/restore-drill.sh" | tail -1 | cut -d: -f1)"
publish_line="$(grep -nF 'publish_restore_receipt' "$REPO_ROOT/deploy/restore-drill.sh" | tail -1 | cut -d: -f1)"
RESTORE_SOURCE="$(<"$REPO_ROOT/deploy/restore-drill.sh")"
[[ "$RESTORE_SOURCE" == *'validate-operations-config.py" deploy'* ]]
[[ "$RESTORE_SOURCE" == *'--verify-pinned-offsite'* ]]
[[ "$RESTORE_SOURCE" == *'pin-offsite-operation.sh helper'* ]]
[[ "$RESTORE_SOURCE" != *'source_identity="$(findmnt'* ]]
[[ -n "$cleanup_line" && -n "$publish_line" && "$cleanup_line" -lt "$publish_line" ]] || {
  echo "A successful receipt must be published only after synchronous cleanup." >&2
  exit 1
}

echo "Restore drill isolation checks passed."
