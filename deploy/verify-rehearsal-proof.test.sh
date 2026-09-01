#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_UNDER_TEST="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/verify-rehearsal-proof.sh"
RUN_ID=12345
RUN_ATTEMPT=2
CANDIDATE_SHA="$(printf 'c%.0s' {1..40})"
CONTROL_SHA="$(printf 'd%.0s' {1..40})"
IMAGE_DIGEST="sha256:$(printf 'a%.0s' {1..64})"

fail() {
  echo "verify-rehearsal-proof test failed: $*" >&2
  exit 1
}

make_fixture() {
  local root="$1"
  mkdir -p "$root/bin"
  cat >"$root/bin/gh" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
joined=" $* "
[[ "$joined" == *" --method GET "* ]] || { echo "read-only GitHub API request required" >&2; exit 97; }
case "$joined" in
  *" repos/${GITHUB_REPOSITORY}/actions/runs/${REHEARSAL_RUN_ID} "*)
    "${PYTHON_BIN:-python3}" - <<'PY'
import json, os
print(json.dumps({
    "id": int(os.environ["REHEARSAL_RUN_ID"]),
    "event": "workflow_dispatch",
    "status": "completed",
    "conclusion": os.environ["FAKE_RUN_CONCLUSION"],
    "head_branch": "main",
    "head_sha": os.environ["FAKE_RUN_HEAD"],
    "run_attempt": int(os.environ["RUN_ATTEMPT"]),
    "path": ".github/workflows/preproduction-rehearsal.yml@main",
    "repository": {"full_name": os.environ["GITHUB_REPOSITORY"]},
}))
PY
    ;;
  *" repos/${GITHUB_REPOSITORY}/actions/runs/${REHEARSAL_RUN_ID}/artifacts?per_page=100 "*)
    "${PYTHON_BIN:-python3}" - <<'PY'
import json, os
print(json.dumps({"artifacts": [{
    "id": 42,
    "name": f"preproduction-rehearsal-proof-{os.environ['REHEARSAL_RUN_ID']}-{os.environ['RUN_ATTEMPT']}",
    "expired": False,
    "size_in_bytes": 512,
    "workflow_run": {"id": int(os.environ["REHEARSAL_RUN_ID"])},
}]}))
PY
    ;;
  *" repos/${GITHUB_REPOSITORY}/actions/artifacts/42/zip "*)
    cat "$FAKE_PROOF_ZIP"
    ;;
  *) echo "unexpected gh invocation: $*" >&2; exit 97 ;;
esac
EOF
  chmod +x "$root/bin/gh"
}

run_verifier() {
  local root="$1"
  local run_head="${2:-$CONTROL_SHA}"
  local conclusion="${3:-success}"
  local proof_digest="${4:-$IMAGE_DIGEST}"
  local proof_control="${5:-$CONTROL_SHA}"

  FAKE_PROOF_ZIP="$root/proof.zip" \
  PROOF_DIGEST="$proof_digest" \
  PROOF_CONTROL="$proof_control" \
  CANDIDATE_SHA="$CANDIDATE_SHA" \
  CONTROL_SHA="$CONTROL_SHA" \
  IMAGE_DIGEST="$IMAGE_DIGEST" \
  RUN_ID="$RUN_ID" \
  RUN_ATTEMPT="$RUN_ATTEMPT" \
  GITHUB_REPOSITORY="kkwjk2718/gshsapp" \
  "${PYTHON_BIN:-python}" - <<'PY'
import json, os, zipfile
proof = {
    "schemaVersion": 1,
    "repository": os.environ["GITHUB_REPOSITORY"],
    "workflow": ".github/workflows/preproduction-rehearsal.yml",
    "event": "workflow_dispatch",
    "runId": int(os.environ["RUN_ID"]),
    "runAttempt": int(os.environ["RUN_ATTEMPT"]),
    "controlSha": os.environ["PROOF_CONTROL"],
    "candidateSha": os.environ["CANDIDATE_SHA"],
    "imageTag": f"sha-{os.environ['CANDIDATE_SHA']}",
    "imageDigest": os.environ["PROOF_DIGEST"],
}
with zipfile.ZipFile(os.environ["FAKE_PROOF_ZIP"], "w") as archive:
    archive.writestr("rehearsal-proof.json", json.dumps(proof, separators=(",", ":")))
PY

  PATH="$root/bin:$PATH" \
  REHEARSAL_RUN_ID="$RUN_ID" \
  CANDIDATE_SHA="$CANDIDATE_SHA" \
  REQUESTED_IMAGE_DIGEST="$IMAGE_DIGEST" \
  CONTROL_SHA="$CONTROL_SHA" \
  FAKE_RUN_HEAD="$run_head" \
  FAKE_RUN_CONCLUSION="$conclusion" \
  FAKE_PROOF_ZIP="$root/proof.zip" \
  RUN_ATTEMPT="$RUN_ATTEMPT" \
  GITHUB_REPOSITORY="kkwjk2718/gshsapp" \
  GITHUB_OUTPUT="$root/output" \
  PYTHON_BIN="${PYTHON_BIN:-python}" \
    "$SCRIPT_UNDER_TEST"
}

root="$(mktemp -d)"
trap 'rm -rf -- "$root"' EXIT
make_fixture "$root"

run_verifier "$root"
grep -Fxq "rehearsal_run_id=$RUN_ID" "$root/output" || fail "verified run ID output missing"

if run_verifier "$root" "$(printf 'e%.0s' {1..40})" >/dev/null 2>&1; then
  fail "a rehearsal run from a different control SHA was accepted"
fi
if run_verifier "$root" "$CONTROL_SHA" failure >/dev/null 2>&1; then
  fail "a failed rehearsal run was accepted"
fi
if run_verifier "$root" "$CONTROL_SHA" success "sha256:$(printf 'b%.0s' {1..64})" >/dev/null 2>&1; then
  fail "a rehearsal proof for a different image digest was accepted"
fi
if run_verifier "$root" "$CONTROL_SHA" success "$IMAGE_DIGEST" "$(printf 'e%.0s' {1..40})" >/dev/null 2>&1; then
  fail "a rehearsal proof from a different control SHA was accepted"
fi

echo "rehearsal proof verifier tests: ok"
