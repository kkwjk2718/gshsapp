#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_UNDER_TEST="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/verify-image-provenance.sh"
FAKE_MANIFEST_PAYLOAD='{"schemaVersion":2,"mediaType":"application/vnd.oci.image.manifest.v1+json"}'
EXPECTED_DIGEST="sha256:$(printf '%s' "$FAKE_MANIFEST_PAYLOAD" | "${PYTHON_BIN:-python}" -c 'import hashlib,sys; print(hashlib.sha256(sys.stdin.buffer.read()).hexdigest())')"

fail() {
  echo "verify-image-provenance test failed: $*" >&2
  exit 1
}

make_fixture() {
  local root="$1"
  git init --bare "$root/origin.git" >/dev/null
  git init -b main "$root/source" >/dev/null
  git -C "$root/source" config user.email security-test@example.invalid
  git -C "$root/source" config user.name security-test
  echo one >"$root/source/file"
  git -C "$root/source" add file
  git -C "$root/source" commit -m one >/dev/null
  echo two >>"$root/source/file"
  git -C "$root/source" commit -am two >/dev/null
  git -C "$root/source" remote add origin "$root/origin.git"
  git -C "$root/source" push -u origin main >/dev/null

  mkdir -p "$root/bin"
  cat >"$root/bin/gh" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
joined=" $* "
manifest_file="$3"
[[ "$1" == "attestation" && "$2" == "verify" && -f "$manifest_file" ]] || {
  echo "attestation verification must receive the downloaded manifest file" >&2
  exit 98
}
actual_digest="sha256:$("${PYTHON_BIN:-python3}" -c 'import hashlib,sys; print(hashlib.sha256(open(sys.argv[1], "rb").read()).hexdigest())' "$manifest_file")"
[[ "$actual_digest" == "$FAKE_REGISTRY_DIGEST" ]] || {
  echo "manifest file digest does not match the registry digest" >&2
  exit 98
}
[[ "$joined" != *" oci://"* && "$joined" != *" --bundle-from-oci "* ]] || {
  echo "GitHub API verification must not depend on OCI client authentication" >&2
  exit 98
}
for required in \
  " attestation verify " \
  " --repo ${GITHUB_REPOSITORY} " \
  " --source-ref refs/heads/main " \
  " --source-digest ${CANDIDATE_SHA} " \
  " --signer-digest ${CANDIDATE_SHA} " \
  " --signer-workflow ${GITHUB_REPOSITORY}/.github/workflows/publish-and-deploy-test.yml " \
  " --predicate-type https://slsa.dev/provenance/v1 " \
  " --deny-self-hosted-runners " \
  " --format json "; do
  [[ "$joined" == *"$required"* ]] || {
    echo "missing provenance policy argument: $required" >&2
    exit 97
  }
done
"${PYTHON_BIN:-python3}" - <<'PY'
import json
import os
print(json.dumps([{
    "verificationResult": {
        "statement": {
            "subject": [{
                "name": os.environ["IMAGE_REPOSITORY"],
                "digest": {"sha256": os.environ["FAKE_VERIFIED_DIGEST"].removeprefix("sha256:")},
            }],
        },
    },
}]))
PY
EOF
  chmod +x "$root/bin/gh"

  cat >"$root/bin/curl" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
joined=" $* "
if [[ "$joined" == *" https://auth.docker.io/token "* ]]; then
  printf '{"token":"test-registry-token"}\n'
elif [[ "$joined" == *" https://registry-1.docker.io/v2/kkwjk2718git/gshsapp/manifests/sha-${CANDIDATE_SHA} "* ]]; then
  output_file=""
  while (( $# )); do
    if [[ "$1" == "--output" ]]; then
      output_file="$2"
      break
    fi
    shift
  done
  [[ -n "$output_file" ]] || { echo "manifest output path missing" >&2; exit 96; }
  printf '%s' "$FAKE_MANIFEST_PAYLOAD" >"$output_file"
  printf 'HTTP/2 200\r\nDocker-Content-Digest: %s\r\n\r\n' "$FAKE_REGISTRY_DIGEST"
else
  echo "unexpected curl invocation: $*" >&2
  exit 96
fi
EOF
  chmod +x "$root/bin/curl"
}

run_verifier() {
  local root="$1"
  local candidate="$2"
  local requested="$3"
  local verified="$4"
  local ref="${5:-refs/heads/main}"
  local registry="${6:-$requested}"
  (
    cd "$root/source"
    PATH="$root/bin:$PATH" \
    CANDIDATE_SHA="$candidate" \
    REQUESTED_IMAGE_DIGEST="$requested" \
    FAKE_VERIFIED_DIGEST="$verified" \
    FAKE_REGISTRY_DIGEST="$registry" \
    FAKE_MANIFEST_PAYLOAD="$FAKE_MANIFEST_PAYLOAD" \
    IMAGE_REPOSITORY="docker.io/kkwjk2718git/gshsapp" \
    TRUSTED_CONTROL_SHA="$(git -C "$root/source" rev-parse main)" \
    GITHUB_REPOSITORY="kkwjk2718/gshsapp" \
    GITHUB_REF="$ref" \
    GITHUB_OUTPUT="$root/output" \
    PYTHON_BIN="${PYTHON_BIN:-python}" \
      "$SCRIPT_UNDER_TEST"
  )
}

root="$(mktemp -d)"
trap 'rm -rf -- "$root"' EXIT
make_fixture "$root"

candidate="$(git -C "$root/source" rev-parse HEAD)"
run_verifier "$root" "$candidate" "$EXPECTED_DIGEST" "$EXPECTED_DIGEST"
grep -Fxq "source_sha=$candidate" "$root/output" || fail "verified source SHA output missing"
grep -Fxq "control_sha=$candidate" "$root/output" || fail "trusted main control SHA output missing"
grep -Fxq "image_tag=sha-$candidate" "$root/output" || fail "verified image tag output missing"
grep -Fxq "image_digest=$EXPECTED_DIGEST" "$root/output" || fail "verified digest output missing"

git -C "$root/source" switch --orphan untrusted >/dev/null
git -C "$root/source" rm -rf . >/dev/null 2>&1 || true
rm -f -- "$root/source/file"
echo untrusted >"$root/source/untrusted"
git -C "$root/source" add untrusted
git -C "$root/source" commit -m untrusted >/dev/null
untrusted="$(git -C "$root/source" rev-parse HEAD)"
if run_verifier "$root" "$untrusted" "$EXPECTED_DIGEST" "$EXPECTED_DIGEST" >/dev/null 2>&1; then
  fail "a commit outside origin/main was accepted"
fi

git -C "$root/source" switch main >/dev/null
other_digest="sha256:$(printf 'b%.0s' {1..64})"
if run_verifier "$root" "$candidate" "$EXPECTED_DIGEST" "$other_digest" >/dev/null 2>&1; then
  fail "a registry digest that differs from the signed provenance was accepted"
fi

if run_verifier "$root" "$candidate" "$other_digest" "$EXPECTED_DIGEST" "refs/heads/main" "$EXPECTED_DIGEST" >/dev/null 2>&1; then
  fail "a requested digest that differs from the current registry tag was accepted"
fi

if run_verifier "$root" "$candidate" "$other_digest" "$other_digest" "refs/heads/main" "$other_digest" >/dev/null 2>&1; then
  fail "registry headers that do not match the downloaded manifest bytes were accepted"
fi

if run_verifier "$root" "$candidate" "$EXPECTED_DIGEST" "$EXPECTED_DIGEST" "refs/heads/untrusted" >/dev/null 2>&1; then
  fail "a workflow dispatched from a non-main ref was accepted"
fi

echo "image provenance verifier tests: ok"
