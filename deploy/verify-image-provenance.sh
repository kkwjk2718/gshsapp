#!/usr/bin/env bash
set -Eeuo pipefail

CANDIDATE_SHA="${CANDIDATE_SHA:?CANDIDATE_SHA is required}"
REQUESTED_IMAGE_DIGEST="${REQUESTED_IMAGE_DIGEST:?REQUESTED_IMAGE_DIGEST is required}"
IMAGE_REPOSITORY="${IMAGE_REPOSITORY:?IMAGE_REPOSITORY is required}"
TRUSTED_CONTROL_SHA="${TRUSTED_CONTROL_SHA:?TRUSTED_CONTROL_SHA is required}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
GITHUB_REF="${GITHUB_REF:?GITHUB_REF is required}"
GITHUB_OUTPUT="${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"
PYTHON_BIN="${PYTHON_BIN:-python3}"

if [[ "$GITHUB_REF" != "refs/heads/main" ]]; then
  echo "Deployment workflows must be dispatched from refs/heads/main." >&2
  exit 1
fi
if [[ ! "$CANDIDATE_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "CANDIDATE_SHA must be exactly 40 lowercase hexadecimal characters." >&2
  exit 1
fi
if [[ ! "$TRUSTED_CONTROL_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "TRUSTED_CONTROL_SHA must be exactly 40 lowercase hexadecimal characters." >&2
  exit 1
fi
if [[ ! "$REQUESTED_IMAGE_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  echo "REQUESTED_IMAGE_DIGEST must be an exact sha256 digest." >&2
  exit 1
fi
if [[ ! "$IMAGE_REPOSITORY" =~ ^docker\.io/[a-z0-9]+([._-][a-z0-9]+)*/[a-z0-9]+([._/-][a-z0-9]+)*$ ]]; then
  echo "IMAGE_REPOSITORY must be a fully qualified Docker Hub image without a tag or digest." >&2
  exit 1
fi
if [[ ! "$GITHUB_REPOSITORY" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
  echo "GITHUB_REPOSITORY is malformed." >&2
  exit 1
fi

command -v git >/dev/null 2>&1 || { echo "git is required." >&2; exit 1; }
command -v gh >/dev/null 2>&1 || { echo "GitHub CLI is required." >&2; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "curl is required." >&2; exit 1; }
command -v "$PYTHON_BIN" >/dev/null 2>&1 || { echo "Python 3 is required." >&2; exit 1; }

# Fetch only the trusted default branch. An arbitrary dispatch input must never
# become a checkout ref or executable workspace on a runner.
git fetch --force --no-tags origin \
  "refs/heads/main:refs/remotes/origin/main"

checked_out_control="$(git rev-parse --verify HEAD)"
if [[ "$checked_out_control" != "$TRUSTED_CONTROL_SHA" ]] ||
   ! git merge-base --is-ancestor "$TRUSTED_CONTROL_SHA" refs/remotes/origin/main; then
  echo "Trusted deployment controls must be the immutable main SHA that triggered this run." >&2
  exit 1
fi

resolved_candidate="$(git rev-parse --verify "${CANDIDATE_SHA}^{commit}" 2>/dev/null)" || {
  echo "The candidate SHA is not an available commit on origin/main." >&2
  exit 1
}
if [[ "$resolved_candidate" != "$CANDIDATE_SHA" ]] ||
   ! git merge-base --is-ancestor "$CANDIDATE_SHA" "$TRUSTED_CONTROL_SHA"; then
  echo "The candidate commit must be an ancestor of the trusted main control SHA." >&2
  exit 1
fi
control_sha="$TRUSTED_CONTROL_SHA"

image_tag="sha-$CANDIDATE_SHA"
docker_repository="${IMAGE_REPOSITORY#docker.io/}"
registry_token="$(
  curl --silent --show-error --fail --get \
    --data-urlencode "service=registry.docker.io" \
    --data-urlencode "scope=repository:${docker_repository}:pull" \
    https://auth.docker.io/token |
    "$PYTHON_BIN" -c 'import json,sys; token=json.load(sys.stdin).get("token"); isinstance(token,str) and token or sys.exit(1); print(token)'
)"
manifest_file="$(mktemp "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/gshsapp-manifest.XXXXXX")"
trap 'rm -f -- "$manifest_file"' EXIT
manifest_headers="$(
  curl --silent --show-error --fail \
    --dump-header - \
    --output "$manifest_file" \
    --header "Authorization: Bearer ${registry_token}" \
    --header "Accept: application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json" \
    "https://registry-1.docker.io/v2/${docker_repository}/manifests/${image_tag}"
)"
registry_digest="$(
  REGISTRY_HEADERS="$manifest_headers" "$PYTHON_BIN" - <<'PY'
import os
import re

values = []
for line in os.environ["REGISTRY_HEADERS"].splitlines():
    name, separator, value = line.partition(":")
    if separator and name.strip().lower() == "docker-content-digest":
        values.append(value.strip())
if len(set(values)) != 1 or re.fullmatch(r"sha256:[0-9a-f]{64}", values[0]) is None:
    raise SystemExit("Docker Hub did not return one valid manifest digest")
print(values[0])
PY
)"
manifest_digest="$(
  MANIFEST_FILE="$manifest_file" "$PYTHON_BIN" - <<'PY'
import hashlib
import os

with open(os.environ["MANIFEST_FILE"], "rb") as manifest:
    print(f"sha256:{hashlib.file_digest(manifest, 'sha256').hexdigest()}")
PY
)"
if [[ "$manifest_digest" != "$registry_digest" ]]; then
  echo "Downloaded manifest bytes do not match Docker Hub's content digest." >&2
  exit 1
fi
if [[ "$registry_digest" != "$REQUESTED_IMAGE_DIGEST" ]]; then
  echo "Requested digest does not match Docker Hub's current immutable digest for $image_tag." >&2
  exit 1
fi

signer_workflow="${GITHUB_REPOSITORY}/.github/workflows/publish-and-deploy-test.yml"

# Hashing the authenticated manifest locally lets gh query GitHub's attestation
# API by the exact registry digest without depending on separate OCI-client
# credentials. GitHub then verifies the Sigstore certificate and provenance;
# the source and signer constraints bind it to the reviewed main workflow.
verified_json="$(
  gh attestation verify "$manifest_file" \
    --repo "$GITHUB_REPOSITORY" \
    --signer-workflow "$signer_workflow" \
    --source-ref refs/heads/main \
    --source-digest "$CANDIDATE_SHA" \
    --signer-digest "$CANDIDATE_SHA" \
    --predicate-type https://slsa.dev/provenance/v1 \
    --deny-self-hosted-runners \
    --format json
)"

verified_digest="$(
  VERIFIED_ATTESTATIONS="$verified_json" EXPECTED_SUBJECT="$IMAGE_REPOSITORY" "$PYTHON_BIN" - <<'PY'
import json
import os
import re

try:
    attestations = json.loads(os.environ["VERIFIED_ATTESTATIONS"])
except (KeyError, json.JSONDecodeError) as error:
    raise SystemExit("GitHub CLI returned malformed attestation JSON") from error

if not isinstance(attestations, list) or not attestations:
    raise SystemExit("No verified provenance attestation was returned")

expected_subject = os.environ["EXPECTED_SUBJECT"]
digests = set()
for item in attestations:
    try:
        subjects = item["verificationResult"]["statement"]["subject"]
    except (KeyError, TypeError):
        continue
    if not isinstance(subjects, list):
        continue
    for subject in subjects:
        if not isinstance(subject, dict) or subject.get("name") != expected_subject:
            continue
        digest = subject.get("digest")
        if isinstance(digest, dict) and isinstance(digest.get("sha256"), str):
            digests.add(f"sha256:{digest['sha256']}")

if len(digests) != 1:
    raise SystemExit("The verified attestation did not identify one unambiguous image digest")
verified = digests.pop()
if re.fullmatch(r"sha256:[0-9a-f]{64}", verified) is None:
    raise SystemExit("The verified image digest is malformed")
print(verified)
PY
)"

if [[ "$verified_digest" != "$REQUESTED_IMAGE_DIGEST" ]]; then
  echo "Requested digest does not match the attested digest currently published for $image_tag." >&2
  exit 1
fi

{
  echo "source_sha=$CANDIDATE_SHA"
  echo "control_sha=$control_sha"
  echo "image_tag=$image_tag"
  echo "image_digest=$verified_digest"
  echo "image_repository=$IMAGE_REPOSITORY"
} >>"$GITHUB_OUTPUT"
