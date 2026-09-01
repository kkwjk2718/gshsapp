#!/usr/bin/env bash
set -Eeuo pipefail

REHEARSAL_RUN_ID="${REHEARSAL_RUN_ID:?REHEARSAL_RUN_ID is required}"
CANDIDATE_SHA="${CANDIDATE_SHA:?CANDIDATE_SHA is required}"
REQUESTED_IMAGE_DIGEST="${REQUESTED_IMAGE_DIGEST:?REQUESTED_IMAGE_DIGEST is required}"
CONTROL_SHA="${CONTROL_SHA:?CONTROL_SHA is required}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
GITHUB_OUTPUT="${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"
PYTHON_BIN="${PYTHON_BIN:-python3}"

[[ "$REHEARSAL_RUN_ID" =~ ^[1-9][0-9]{0,19}$ ]] || {
  echo "REHEARSAL_RUN_ID must be a positive decimal workflow run ID." >&2
  exit 1
}
[[ "$CANDIDATE_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "CANDIDATE_SHA is malformed." >&2; exit 1; }
[[ "$CONTROL_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "CONTROL_SHA is malformed." >&2; exit 1; }
[[ "$REQUESTED_IMAGE_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]] || { echo "REQUESTED_IMAGE_DIGEST is malformed." >&2; exit 1; }
[[ "$GITHUB_REPOSITORY" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || { echo "GITHUB_REPOSITORY is malformed." >&2; exit 1; }

command -v gh >/dev/null 2>&1 || { echo "GitHub CLI is required." >&2; exit 1; }
command -v unzip >/dev/null 2>&1 || { echo "unzip is required." >&2; exit 1; }
command -v "$PYTHON_BIN" >/dev/null 2>&1 || { echo "Python 3 is required." >&2; exit 1; }

run_json="$(gh api --method GET "repos/${GITHUB_REPOSITORY}/actions/runs/${REHEARSAL_RUN_ID}")"
run_attempt="$(
  RUN_JSON="$run_json" \
  EXPECTED_RUN_ID="$REHEARSAL_RUN_ID" \
  EXPECTED_CONTROL_SHA="$CONTROL_SHA" \
  EXPECTED_REPOSITORY="$GITHUB_REPOSITORY" \
  "$PYTHON_BIN" - <<'PY'
import json
import os

try:
    run = json.loads(os.environ["RUN_JSON"])
except json.JSONDecodeError as error:
    raise SystemExit("GitHub returned malformed workflow run JSON") from error

expected = {
    "id": int(os.environ["EXPECTED_RUN_ID"]),
    "event": "workflow_dispatch",
    "status": "completed",
    "conclusion": "success",
    "head_branch": "main",
    "head_sha": os.environ["EXPECTED_CONTROL_SHA"],
}
for key, value in expected.items():
    if run.get(key) != value:
        raise SystemExit(f"Rehearsal workflow run has an invalid {key}")
workflow_path = ".github/workflows/preproduction-rehearsal.yml"
if run.get("path") not in {workflow_path, f"{workflow_path}@main", f"{workflow_path}@refs/heads/main"}:
    raise SystemExit("Rehearsal workflow run has an invalid path")
if not isinstance(run.get("repository"), dict) or run["repository"].get("full_name") != os.environ["EXPECTED_REPOSITORY"]:
    raise SystemExit("Rehearsal workflow run belongs to a different repository")
attempt = run.get("run_attempt")
if not isinstance(attempt, int) or isinstance(attempt, bool) or attempt < 1:
    raise SystemExit("Rehearsal workflow run attempt is invalid")
print(attempt)
PY
)"

artifact_name="preproduction-rehearsal-proof-${REHEARSAL_RUN_ID}-${run_attempt}"
artifacts_json="$(gh api --method GET "repos/${GITHUB_REPOSITORY}/actions/runs/${REHEARSAL_RUN_ID}/artifacts?per_page=100")"
artifact_id="$(
  ARTIFACTS_JSON="$artifacts_json" \
  EXPECTED_NAME="$artifact_name" \
  EXPECTED_RUN_ID="$REHEARSAL_RUN_ID" \
  "$PYTHON_BIN" - <<'PY'
import json
import os

try:
    response = json.loads(os.environ["ARTIFACTS_JSON"])
except json.JSONDecodeError as error:
    raise SystemExit("GitHub returned malformed artifact JSON") from error

artifacts = response.get("artifacts")
if not isinstance(artifacts, list):
    raise SystemExit("GitHub artifact response is malformed")
matches = [item for item in artifacts if isinstance(item, dict) and item.get("name") == os.environ["EXPECTED_NAME"]]
if len(matches) != 1:
    raise SystemExit("Exactly one rehearsal proof artifact is required")
artifact = matches[0]
if artifact.get("expired") is not False:
    raise SystemExit("Rehearsal proof artifact is expired")
size = artifact.get("size_in_bytes")
if not isinstance(size, int) or isinstance(size, bool) or not 1 <= size <= 1_048_576:
    raise SystemExit("Rehearsal proof artifact size is invalid")
workflow_run = artifact.get("workflow_run")
if not isinstance(workflow_run, dict) or workflow_run.get("id") != int(os.environ["EXPECTED_RUN_ID"]):
    raise SystemExit("Rehearsal proof artifact belongs to a different run")
artifact_id = artifact.get("id")
if not isinstance(artifact_id, int) or isinstance(artifact_id, bool) or artifact_id < 1:
    raise SystemExit("Rehearsal proof artifact ID is invalid")
print(artifact_id)
PY
)"

proof_zip="$(mktemp "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/gshsapp-rehearsal-proof.XXXXXX.zip")"
trap 'rm -f -- "$proof_zip"' EXIT
gh api --method GET "repos/${GITHUB_REPOSITORY}/actions/artifacts/${artifact_id}/zip" >"$proof_zip"

mapfile -t archive_entries < <(unzip -Z1 "$proof_zip")
if [[ "${#archive_entries[@]}" -ne 1 || "${archive_entries[0]}" != "rehearsal-proof.json" ]]; then
  echo "Rehearsal proof artifact must contain only rehearsal-proof.json." >&2
  exit 1
fi
proof_json="$(unzip -p "$proof_zip" rehearsal-proof.json)"
if (( ${#proof_json} > 16384 )); then
  echo "Rehearsal proof JSON is too large." >&2
  exit 1
fi

PROOF_JSON="$proof_json" \
EXPECTED_REPOSITORY="$GITHUB_REPOSITORY" \
EXPECTED_RUN_ID="$REHEARSAL_RUN_ID" \
EXPECTED_RUN_ATTEMPT="$run_attempt" \
EXPECTED_CONTROL_SHA="$CONTROL_SHA" \
EXPECTED_CANDIDATE_SHA="$CANDIDATE_SHA" \
EXPECTED_IMAGE_DIGEST="$REQUESTED_IMAGE_DIGEST" \
"$PYTHON_BIN" - <<'PY'
import json
import os

try:
    proof = json.loads(os.environ["PROOF_JSON"])
except json.JSONDecodeError as error:
    raise SystemExit("Rehearsal proof is malformed JSON") from error

expected = {
    "schemaVersion": 1,
    "repository": os.environ["EXPECTED_REPOSITORY"],
    "workflow": ".github/workflows/preproduction-rehearsal.yml",
    "event": "workflow_dispatch",
    "runId": int(os.environ["EXPECTED_RUN_ID"]),
    "runAttempt": int(os.environ["EXPECTED_RUN_ATTEMPT"]),
    "controlSha": os.environ["EXPECTED_CONTROL_SHA"],
    "candidateSha": os.environ["EXPECTED_CANDIDATE_SHA"],
    "imageTag": f"sha-{os.environ['EXPECTED_CANDIDATE_SHA']}",
    "imageDigest": os.environ["EXPECTED_IMAGE_DIGEST"],
}
if not isinstance(proof, dict) or proof != expected:
    raise SystemExit("Rehearsal proof does not exactly match the requested deployment")
PY

echo "rehearsal_run_id=$REHEARSAL_RUN_ID" >>"$GITHUB_OUTPUT"
