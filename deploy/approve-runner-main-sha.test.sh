#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
APPROVER_SOURCE="$SCRIPT_DIR/approve-runner-main-sha.sh"
temporary_directory="$(mktemp -d)"
trap 'rm -rf -- "$temporary_directory"' EXIT
test_root="$temporary_directory/root"
mkdir -p "$test_root/etc/gshsapp-runner-trust"
chmod 0755 "$test_root" "$test_root/etc" "$test_root/etc/gshsapp-runner-trust"

APPROVER="$temporary_directory/approve-runner-main-sha.sh"
cp "$APPROVER_SOURCE" "$APPROVER"
sed -i "s|/etc/gshsapp-runner-trust|$test_root/etc/gshsapp-runner-trust|g" "$APPROVER"
sed -i "s|readonly EXPECTED_ROOT_UID=0|readonly EXPECTED_ROOT_UID=$(id -u)|" "$APPROVER"
sed -i "s|readonly EXPECTED_ROOT_GID=0|readonly EXPECTED_ROOT_GID=$(id -g)|" "$APPROVER"
sed -i "s|/usr/bin/git|$(command -v git)|g" "$APPROVER"

historic_sha="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
bundle_source="$temporary_directory/bundle-source"
git init -q "$bundle_source"
git -C "$bundle_source" config user.name 'Runner Trust Test'
git -C "$bundle_source" config user.email 'runner-trust-test@example.invalid'
printf '%s\n' 'reviewed protected-main content' >"$bundle_source/reviewed.txt"
git -C "$bundle_source" add reviewed.txt
git -C "$bundle_source" commit -q -m 'reviewed protected main'
git -C "$bundle_source" branch -M main
approved_sha="$(git -C "$bundle_source" rev-parse HEAD)"
trusted_archive="$temporary_directory/gshsapp-$approved_sha.bundle"
git -C "$bundle_source" bundle create "$trusted_archive" main
archive_sha256="$(sha256sum "$trusted_archive" | awk '{print $1}')"

invalid_bundle="$temporary_directory/gshsapp-$approved_sha-invalid.bundle"
printf '%s\n' 'not a Git bundle' >"$invalid_bundle"
invalid_bundle_sha256="$(sha256sum "$invalid_bundle" | awk '{print $1}')"

if "$APPROVER" --role test --sha "$approved_sha" \
  --commit-bundle "$invalid_bundle" \
  --commit-bundle-sha256 "$invalid_bundle_sha256" >/dev/null 2>&1; then
  echo "Approver accepted a non-Git artifact named after the requested SHA." >&2
  exit 1
fi

"$APPROVER" \
  --role test \
  --sha "$approved_sha" \
  --commit-bundle "$trusted_archive" \
  --commit-bundle-sha256 "$archive_sha256"

approval_file="$test_root/etc/gshsapp-runner-trust/approved-main-test.sha"
[[ "$(cat "$approval_file")" == "$approved_sha" ]]
[[ "$(stat -c '%a' "$approval_file")" == "644" ]]

if "$APPROVER" --role test --sha "$historic_sha" \
  --commit-bundle "$trusted_archive" \
  --commit-bundle-sha256 "$archive_sha256" >/dev/null 2>&1; then
  echo "Approver accepted an archive whose name did not bind the approved SHA." >&2
  exit 1
fi
[[ "$(cat "$approval_file")" == "$approved_sha" ]]

if "$APPROVER" --role test --sha "$approved_sha" \
  --commit-bundle "$trusted_archive" \
  --commit-bundle-sha256 "${archive_sha256/0/1}" >/dev/null 2>&1; then
  echo "Approver accepted an archive with the wrong out-of-band digest." >&2
  exit 1
fi
[[ "$(cat "$approval_file")" == "$approved_sha" ]]

if "$APPROVER" --role staging --sha "$approved_sha" \
  --commit-bundle "$trusted_archive" \
  --commit-bundle-sha256 "$archive_sha256" >/dev/null 2>&1; then
  echo "Approver accepted an unknown runner role." >&2
  exit 1
fi

if "$APPROVER" --role test --sha "${approved_sha^^}" \
  --commit-bundle "$trusted_archive" \
  --commit-bundle-sha256 "$archive_sha256" >/dev/null 2>&1; then
  echo "Approver accepted a non-canonical commit SHA." >&2
  exit 1
fi

echo "runner approved-main SHA tests: ok"
