#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SOURCE="$SCRIPT_DIR/approve-release.sh"
[[ -f "$SOURCE" ]] || { printf '%s\n' "approve-release.sh is missing" >&2; exit 1; }

TEST_ROOT="$(mktemp -d)"
case "$TEST_ROOT" in
  /tmp/*) ;;
  *) printf '%s\n' "refusing unsafe test root: $TEST_ROOT" >&2; exit 1 ;;
esac
trap 'rm -rf -- "$TEST_ROOT"' EXIT

CONTROL_ROOT="$TEST_ROOT/control"
DEPLOY_ROOT="$TEST_ROOT/deploy"
CONFIG_ROOT="$TEST_ROOT/config"
RUNTIME_ROOT="$TEST_ROOT/run"
FAKE_BIN="$TEST_ROOT/bin"
MODE_FILE="$TEST_ROOT/mode"
CALL_LOG="$TEST_ROOT/calls.log"
MAIN_CALLS="$TEST_ROOT/main-calls"
TOKEN_FILE="$CONFIG_ROOT/github-token"
HOST_ROLE_FILE="$CONFIG_ROOT/host-role"
APPROVAL="$CONTROL_ROOT/approve-release.sh"
FAKE_GH_PY="$FAKE_BIN/fake-gh.py"
CANDIDATE_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
OTHER_SHA=dddddddddddddddddddddddddddddddddddddddd
IMAGE_HEX=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
IMAGE_DIGEST="sha256:$IMAGE_HEX"
CONTROL_DIGEST=cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
CONTROL_LINE="$CONTROL_DIGEST  deploy/approve-release.sh"
WORKFLOW_DIGEST=04e892834c7e91d36e06cc7e865a19cf167dbe5a59ad46c6b213dfa271c5c601
WORKFLOW_BYTES=trusted-workflow-v1
WORKFLOW_PATHS=(
  .github/workflows/ci.yml
  .github/workflows/deploy-prod.yml
  .github/workflows/preproduction-rehearsal.yml
  .github/workflows/production-health-monitor.yml
  .github/workflows/publish-and-deploy-test.yml
  .github/workflows/publish-production-release.yml
  .github/workflows/secret-scan.yml
)
GH_TOKEN_VALUE=test-gh-token-not-a-real-secret

mkdir -p -- "$CONTROL_ROOT" "$DEPLOY_ROOT" "$CONFIG_ROOT" "$RUNTIME_ROOT" "$FAKE_BIN"
printf '%s\n' "$CONTROL_LINE" >"$CONTROL_ROOT/control-assets.sha256"
for workflow_path in "${WORKFLOW_PATHS[@]}"; do
  printf '%s  %s\n' "$WORKFLOW_DIGEST" "$workflow_path"
done >"$CONTROL_ROOT/workflow-policy.sha256"
printf '%s\n' "$GH_TOKEN_VALUE" >"$TOKEN_FILE"
printf '%s\n' test >"$HOST_ROLE_FILE"
: >"$CALL_LOG"
: >"$MAIN_CALLS"

REAL_PYTHON=""
for candidate in python3 python; do
  resolved="$(command -v "$candidate" 2>/dev/null || true)"
  if [[ -n "$resolved" ]] && "$resolved" -c 'import json,sys' >/dev/null 2>&1; then
    REAL_PYTHON="$resolved"
    break
  fi
done
[[ -n "$REAL_PYTHON" ]] || { printf '%s\n' "a working Python 3 is required" >&2; exit 1; }
printf '%s\n' "$REAL_PYTHON" >"$FAKE_BIN/real-python"
if "$REAL_PYTHON" -c 'import os,sys;sys.exit(0 if os.name=="nt" else 1)' >/dev/null 2>&1; then
  printf '%s\n' yes >"$FAKE_BIN/native-windows-python"
else
  printf '%s\n' no >"$FAKE_BIN/native-windows-python"
fi

to_python_path() {
  if [[ "$(<"$FAKE_BIN/native-windows-python")" == yes ]]; then
    cygpath -m -- "$1"
  else
    printf '%s\n' "$1"
  fi
}

MODE_PY="$(to_python_path "$MODE_FILE")"
CALL_LOG_PY="$(to_python_path "$CALL_LOG")"
MAIN_CALLS_PY="$(to_python_path "$MAIN_CALLS")"
FAKE_GH_PY_NATIVE="$(to_python_path "$FAKE_GH_PY")"

cat >"$FAKE_BIN/python3" <<'SH'
#!/usr/bin/env bash
set -Eeuo pipefail
HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REAL_PYTHON="$(<"$HERE/real-python")"
if [[ "$(<"$HERE/native-windows-python")" == yes ]]; then
  for name in PROTECTION_FILE CHECKS_FILE TRUSTED_RUNS_FILE PROOF_ZIP RECEIPT_FILE; do
    value="${!name:-}"
    if [[ -n "$value" && "$value" == /* ]]; then
      printf -v "$name" '%s' "$(cygpath -w -- "$value")"
      export "$name"
    fi
  done
  converted=()
  for value in "$@"; do
    if [[ "$value" == /* ]]; then
      value="$(cygpath -w -- "$value")"
    fi
    converted+=("$value")
  done
  exec "$REAL_PYTHON" "${converted[@]}"
fi
exec "$REAL_PYTHON" "$@"
SH

cat >"$FAKE_GH_PY" <<PY
import json
import pathlib
import sys

MODE_FILE = pathlib.Path(r"$MODE_PY")
CALL_LOG = pathlib.Path(r"$CALL_LOG_PY")
MAIN_CALLS = pathlib.Path(r"$MAIN_CALLS_PY")
CANDIDATE_SHA = "$CANDIDATE_SHA"
OTHER_SHA = "$OTHER_SHA"
IMAGE_DIGEST = "$IMAGE_DIGEST"
CONTROL_LINE = "$CONTROL_LINE"
WORKFLOW_BYTES = "$WORKFLOW_BYTES"
WORKFLOW_PATHS = {
    ".github/workflows/ci.yml",
    ".github/workflows/deploy-prod.yml",
    ".github/workflows/preproduction-rehearsal.yml",
    ".github/workflows/production-health-monitor.yml",
    ".github/workflows/publish-and-deploy-test.yml",
    ".github/workflows/publish-production-release.yml",
    ".github/workflows/secret-scan.yml",
}
REPOSITORY = "kkwjk2718/gshsapp"

args = sys.argv[1:]
mode = MODE_FILE.read_text(encoding="utf-8").strip()
with CALL_LOG.open("a", encoding="utf-8") as log:
    log.write("gh " + " ".join(args[:2]) + "\n")

if args[:2] == ["attestation", "verify"]:
    expected = [
        "--repo", REPOSITORY,
        "--signer-workflow", REPOSITORY + "/.github/workflows/publish-and-deploy-test.yml",
        "--source-ref", "refs/heads/main",
        "--source-digest", CANDIDATE_SHA,
        "--signer-digest", CANDIDATE_SHA,
        "--predicate-type", "https://slsa.dev/provenance/v1",
        "--deny-self-hosted-runners",
    ]
    if len(args) < 3 or args[3:] != expected:
        raise SystemExit("unexpected attestation arguments")
    if pathlib.Path(args[2]).read_bytes() != b"approval-test-manifest-v1":
        raise SystemExit("unexpected attestation subject")
    raise SystemExit(0)

if not args or args[0] != "api":
    raise SystemExit("unexpected gh command")
endpoint = args[-1]

if endpoint == f"repos/{REPOSITORY}/git/ref/heads/main":
    count = int(MAIN_CALLS.read_text(encoding="utf-8") or "0") + 1
    MAIN_CALLS.write_text(str(count), encoding="utf-8")
    sha = OTHER_SHA if mode == "main-advances" and count > 1 else CANDIDATE_SHA
    print(json.dumps({"object": {"sha": sha}}))
elif endpoint == f"repos/{REPOSITORY}/branches/main/protection":
    last_push = mode != "weak-last-push"
    reviews = {
        "required_approving_review_count": 1,
        "dismiss_stale_reviews": True,
        "require_code_owner_reviews": True,
        "require_last_push_approval": last_push,
    }
    if mode == "bypass-principal":
        reviews["bypass_pull_request_allowances"] = {
            "users": [{"login": "unreviewed-bypass"}],
            "teams": [],
            "apps": [],
        }
    print(json.dumps({
        "required_status_checks": {
            "strict": True,
            "contexts": ["lint", "test", "firewall-policy", "build", "gitleaks"],
            "checks": [],
        },
        "required_pull_request_reviews": reviews,
        "enforce_admins": {"enabled": True},
        "required_conversation_resolution": {"enabled": True},
        "allow_force_pushes": {"enabled": False},
        "allow_deletions": {"enabled": False},
    }))
elif endpoint == f"repos/{REPOSITORY}/contents/.github/workflows?ref={CANDIDATE_SHA}":
    entries = [
        {"name": relative.rsplit("/", 1)[1], "path": relative, "type": "file", "size": len(WORKFLOW_BYTES) + 1}
        for relative in sorted(WORKFLOW_PATHS)
    ]
    if mode == "extra-workflow":
        entries.append({"name": "evil.yml", "path": ".github/workflows/evil.yml", "type": "file", "size": 80})
    print(json.dumps(entries))
elif endpoint == f"repos/{REPOSITORY}/commits/{CANDIDATE_SHA}/check-runs?filter=latest&per_page=100":
    check_runs = []
    for job_id, name in enumerate(("lint", "test", "firewall-policy", "build", "gitleaks"), start=1):
        run_id = 102 if name == "gitleaks" else 101
        app_id = 999999 if mode == "spoof-app" and name == "build" else 15368
        check_runs.append({
            "name": name,
            "head_sha": CANDIDATE_SHA,
            "status": "completed",
            "conclusion": "success",
            "app": {"id": app_id, "slug": "github-actions"},
            "details_url": f"https://github.com/{REPOSITORY}/actions/runs/{run_id}/job/{job_id}",
        })
    print(json.dumps({"check_runs": check_runs}))
elif endpoint in (
    f"repos/{REPOSITORY}/actions/runs/101",
    f"repos/{REPOSITORY}/actions/runs/102",
):
    run_id = int(endpoint.rsplit("/", 1)[1])
    path = ".github/workflows/secret-scan.yml" if run_id == 102 else ".github/workflows/ci.yml"
    event = "push"
    head_sha = CANDIDATE_SHA
    head_branch = "main"
    if run_id == 101 and mode == "spoof-workflow":
        path = ".github/workflows/untrusted.yml"
    if run_id == 101 and mode == "spoof-head":
        head_sha = OTHER_SHA
    if run_id == 101 and mode == "spoof-event":
        event = "workflow_dispatch"
    print(json.dumps({
        "path": path,
        "event": event,
        "head_branch": head_branch,
        "head_sha": head_sha,
        "status": "completed",
        "conclusion": "success",
        "repository": {"full_name": REPOSITORY},
        "run_attempt": 1,
    }))
elif endpoint == f"repos/{REPOSITORY}/contents/deploy/control-assets.sha256?ref={CANDIDATE_SHA}":
    value = CONTROL_LINE if mode != "control-mismatch" else CONTROL_LINE + "\nmalicious-control-entry"
    sys.stdout.buffer.write((value + "\n").encode("utf-8"))
elif endpoint.startswith(f"repos/{REPOSITORY}/contents/.github/workflows/") and endpoint.endswith(f"?ref={CANDIDATE_SHA}"):
    relative = endpoint.removeprefix(f"repos/{REPOSITORY}/contents/").removesuffix(f"?ref={CANDIDATE_SHA}")
    if relative not in WORKFLOW_PATHS:
        raise SystemExit("unexpected workflow path: " + relative)
    value = "changed-workflow-v1" if mode == "workflow-policy-mismatch" and relative.endswith("ci.yml") else WORKFLOW_BYTES
    sys.stdout.buffer.write((value + "\n").encode("utf-8"))
else:
    raise SystemExit("unexpected gh api endpoint: " + endpoint)
PY

cat >"$FAKE_BIN/gh" <<'SH'
#!/usr/bin/env bash
set -Eeuo pipefail
HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec "$HERE/python3" "$HERE/fake-gh.py" "$@"
SH

cat >"$FAKE_BIN/timeout" <<'SH'
#!/usr/bin/env bash
set -Eeuo pipefail
[[ "${1:-}" =~ ^[0-9]+$ ]] || { printf '%s\n' "invalid fake timeout" >&2; exit 2; }
shift
exec "$@"
SH

cat >"$FAKE_BIN/curl" <<SH
#!/usr/bin/env bash
set -Eeuo pipefail
url=""
output=""
while [[ "\$#" -gt 0 ]]; do
  case "\$1" in
    --output) output="\${2:?}"; shift 2 ;;
    *) url="\$1"; shift ;;
  esac
done
printf 'curl %s\n' "\$url" >>'$CALL_LOG'
case "\$url" in
  https://auth.docker.io/token)
    printf '%s\n' '{"token":"registry-token-for-networkless-test"}'
    ;;
  https://registry-1.docker.io/v2/kkwjk2718git/gshsapp/manifests/sha-$CANDIDATE_SHA)
    [[ -n "\$output" ]] || { printf '%s\n' 'missing output path' >&2; exit 2; }
    printf '%s' 'approval-test-manifest-v1' >"\$output"
    printf 'HTTP/1.1 200 OK\r\nDocker-Content-Digest: %s\r\n\r\n' '$IMAGE_DIGEST'
    ;;
  *)
    printf '%s\n' "unexpected curl URL: \$url" >&2
    exit 2
    ;;
esac
SH

cat >"$FAKE_BIN/sha256sum" <<SH
#!/usr/bin/env bash
set -Eeuo pipefail
target=""
for value in "\$@"; do target="\$value"; done
case "\$target" in
  '$CONTROL_ROOT/control-assets.sha256') printf '%s  %s\n' '$CONTROL_DIGEST' "\$target" ;;
  '$RUNTIME_ROOT'/gshsapp-manifest.*) printf '%s  %s\n' '$IMAGE_HEX' "\$target" ;;
  *) printf '%s\n' "unexpected sha256sum target: \$target" >&2; exit 2 ;;
esac
SH

cat >"$FAKE_BIN/id" <<'SH'
#!/usr/bin/env bash
[[ "$#" == 1 && "$1" == -u ]] || exit 2
printf '%s\n' 0
SH

cat >"$FAKE_BIN/stat" <<SH
#!/usr/bin/env bash
set -Eeuo pipefail
format=""
target=""
while [[ "\$#" -gt 0 ]]; do
  case "\$1" in
    -c) format="\${2:?}"; shift 2 ;;
    *) target="\$1"; shift ;;
  esac
done
case "\$format" in
  '%u:%g:%a:%h')
    case "\$target" in
      '$RUNTIME_ROOT/lock/lifecycle.lock') printf '%s\n' '0:0:600:1' ;;
      *) printf '%s\n' '0:0:400:1' ;;
    esac
    ;;
  '%u:%g:%a')
    case "\$target" in
      '$TOKEN_FILE') printf '%s\n' '0:0:600' ;;
      '$HOST_ROLE_FILE') printf '%s\n' '0:0:400' ;;
      '$RUNTIME_ROOT/lock') printf '%s\n' '0:0:700' ;;
      *) exit 2 ;;
    esac
    ;;
  '%s') exec /usr/bin/stat -c '%s' -- "\$target" ;;
  *) printf '%s\n' "unexpected stat format: \$format" >&2; exit 2 ;;
esac
SH

cat >"$FAKE_BIN/chown" <<'SH'
#!/usr/bin/env bash
exit 0
SH

cat >"$FAKE_BIN/install" <<'SH'
#!/usr/bin/env bash
set -Eeuo pipefail
target="${!#}"
mkdir -p -- "$target"
SH

cat >"$FAKE_BIN/flock" <<SH
#!/usr/bin/env bash
set -Eeuo pipefail
mode="\$(<"$MODE_FILE")"
[[ "\$mode" != lock-busy ]]
SH

cat >"$FAKE_BIN/sync" <<'SH'
#!/usr/bin/env bash
exit 0
SH

cat >"$CONTROL_ROOT/install-root-operations.sh" <<'SH'
#!/usr/bin/env bash
set -Eeuo pipefail
[[ "$#" == 1 && "$1" == --verify-installed ]]
SH

chmod 0700 "$FAKE_BIN"/* "$CONTROL_ROOT/install-root-operations.sh"
cp -- "$SOURCE" "$APPROVAL"

sed -i \
  -e "s|^PATH=.*$|PATH=$FAKE_BIN:/usr/sbin:/usr/bin:/sbin:/bin|" \
  -e "s|^CONTROL_ROOT=.*$|CONTROL_ROOT=$CONTROL_ROOT|" \
  -e "s|^DEPLOY_ROOT=.*$|DEPLOY_ROOT=$DEPLOY_ROOT|" \
  -e "s|^TOKEN_FILE=.*$|TOKEN_FILE=$TOKEN_FILE|" \
  -e "s|^HOST_ROLE_FILE=.*$|HOST_ROLE_FILE=$HOST_ROLE_FILE|" \
  -e "s|^LOCK_ROOT=.*$|LOCK_ROOT=$RUNTIME_ROOT/lock|" \
  -e "s|/run/gshsapp-|$RUNTIME_ROOT/gshsapp-|g" \
  -e 's|import json, os, subprocess|import json, os, subprocess, sys|' \
  -e "s|\[\"/usr/bin/timeout\",\"30\",\"/usr/bin/gh\",\"api\",|[sys.executable,r'$FAKE_GH_PY_NATIVE',\"api\",|" \
  -e "s|/usr/bin/timeout|$FAKE_BIN/timeout|g" \
  -e "s|/usr/bin/gh|$FAKE_BIN/gh|g" \
  -e "s|/usr/bin/python3|$FAKE_BIN/python3|g" \
  -e "s|/usr/bin/curl|$FAKE_BIN/curl|g" \
  -e "s|/usr/bin/install|$FAKE_BIN/install|g" \
  -e "s|/usr/bin/chown|$FAKE_BIN/chown|g" \
  -e "s|/usr/bin/flock|$FAKE_BIN/flock|g" \
  "$APPROVAL"
chmod 0400 "$APPROVAL"

assert_failure() {
  local mode="$1"
  local expected="$2"
  local output status
  printf '%s\n' "$mode" >"$MODE_FILE"
  : >"$CALL_LOG"
  : >"$MAIN_CALLS"
  rm -f -- "$DEPLOY_ROOT/approved-release.json"
  set +e
  output="$(/bin/bash "$APPROVAL" "$CANDIDATE_SHA" "$IMAGE_DIGEST" 2>&1)"
  status="$?"
  set -e
  [[ "$status" -ne 0 ]] || {
    printf '%s\n' "scenario unexpectedly succeeded: $mode" >&2
    exit 1
  }
  [[ "$output" == *"$expected"* ]] || {
    printf '%s\n' "scenario $mode produced the wrong failure:" "$output" >&2
    exit 1
  }
  [[ ! -e "$DEPLOY_ROOT/approved-release.json" ]] || {
    printf '%s\n' "scenario wrote an approval receipt: $mode" >&2
    exit 1
  }
  [[ "$output" != *"$GH_TOKEN_VALUE"* ]] || {
    printf '%s\n' "scenario leaked the GitHub token: $mode" >&2
    exit 1
  }
}

printf '%s\n' success >"$MODE_FILE"
: >"$CALL_LOG"
: >"$MAIN_CALLS"
set +e
success_output="$(/bin/bash "$APPROVAL" "$CANDIDATE_SHA" "$IMAGE_DIGEST" 2>&1)"
success_status="$?"
set -e
if [[ "$success_status" -ne 0 ]]; then
  printf '%s\n' 'success scenario failed:' "$success_output" >&2
  exit 1
fi
[[ "$success_output" == "Exact protected-main image and signed provenance approved for root deployment." ]]
[[ -f "$DEPLOY_ROOT/approved-release.json" ]]
RECEIPT_FILE="$DEPLOY_ROOT/approved-release.json" EXPECTED_SHA="$CANDIDATE_SHA" EXPECTED_DIGEST="$IMAGE_DIGEST" EXPECTED_CONTROL="$CONTROL_DIGEST" \
  "$FAKE_BIN/python3" - <<'PY'
import json, os
with open(os.environ["RECEIPT_FILE"], encoding="utf-8") as source:
    value=json.load(source)
assert value["format"] == "gshsapp-approved-release"
assert value["version"] == 2
assert value["hostRole"] == "test"
assert value["candidateSha"] == os.environ["EXPECTED_SHA"]
assert value["imageDigest"] == os.environ["EXPECTED_DIGEST"]
assert value["controlManifestSha256"] == os.environ["EXPECTED_CONTROL"]
assert value["preproductionRunId"] is None
assert value["preproductionRunAttempt"] is None
PY
grep -Fqx 'gh attestation verify' "$CALL_LOG"
grep -Fq 'curl https://auth.docker.io/token' "$CALL_LOG"
grep -Fq 'curl https://registry-1.docker.io/' "$CALL_LOG"
! grep -Fq "$GH_TOKEN_VALUE" "$CALL_LOG"
[[ "$(<"$MAIN_CALLS")" == 2 ]]

assert_failure lock-busy 'another lifecycle operation is active'
[[ ! -s "$CALL_LOG" ]]

assert_failure main-advances 'candidate is no longer the current protected main tip'
grep -Fqx 'gh attestation verify' "$CALL_LOG"

assert_failure spoof-app 'candidate did not complete the exact trusted required checks'
! grep -Fq 'gh attestation verify' "$CALL_LOG"

assert_failure weak-last-push 'main protection is weaker than the reviewed release policy'
! grep -Fq 'gh attestation verify' "$CALL_LOG"

assert_failure bypass-principal 'main protection is weaker than the reviewed release policy'
! grep -Fq 'gh attestation verify' "$CALL_LOG"

assert_failure spoof-workflow 'required checks were not produced by the exact trusted workflows'
! grep -Fq 'gh attestation verify' "$CALL_LOG"

assert_failure spoof-head 'required checks were not produced by the exact trusted workflows'
! grep -Fq 'gh attestation verify' "$CALL_LOG"

assert_failure spoof-event 'required checks were not produced by the exact trusted workflows'
! grep -Fq 'gh attestation verify' "$CALL_LOG"

assert_failure control-mismatch 'candidate requires a different OOB root control bundle; reinstall reviewed controls first'
! grep -Fq 'curl https://' "$CALL_LOG"
! grep -Fq 'gh attestation verify' "$CALL_LOG"

assert_failure workflow-policy-mismatch 'candidate security workflow differs from the OOB-approved workflow policy'
! grep -Fq 'curl https://' "$CALL_LOG"
! grep -Fq 'gh attestation verify' "$CALL_LOG"

assert_failure extra-workflow 'candidate workflow directory differs from the OOB-approved exact workflow set'
! grep -Fq 'curl https://' "$CALL_LOG"
! grep -Fq 'gh attestation verify' "$CALL_LOG"

printf '%s\n' 'approve-release behavior tests passed'
