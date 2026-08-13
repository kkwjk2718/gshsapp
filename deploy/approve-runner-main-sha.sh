#!/bin/bash
set -Eeuo pipefail

PATH=/usr/sbin:/usr/bin:/sbin:/bin
LC_ALL=C
export PATH LC_ALL
builtin unset BASH_ENV ENV CDPATH GLOBIGNORE GIT_CONFIG_COUNT GIT_CONFIG_KEY_0 GIT_CONFIG_VALUE_0 GIT_DIR GIT_WORK_TREE LD_PRELOAD LD_LIBRARY_PATH PYTHONPATH PYTHONHOME NODE_OPTIONS TMPDIR TMP TEMP
IFS=$' \t\n'
while IFS= read -r inherited_function; do
  builtin unset -f "$inherited_function" 2>/dev/null || true
done < <(builtin compgen -A function)

readonly APPROVAL_DIRECTORY="/etc/gshsapp-runner-trust"
readonly EXPECTED_ROOT_UID=0
readonly EXPECTED_ROOT_GID=0

fail() {
  printf '%s\n' "runner SHA approval failed: $1" >&2
  return 1
}

approve_runner_main_sha() {
  local role=""
  local sha=""
  local commit_bundle=""
  local commit_bundle_sha256=""
  while [[ "$#" -gt 0 ]]; do
    case "$1" in
      --role) role="${2:-}"; shift 2 ;;
      --sha) sha="${2:-}"; shift 2 ;;
      --commit-bundle) commit_bundle="${2:-}"; shift 2 ;;
      --commit-bundle-sha256) commit_bundle_sha256="${2:-}"; shift 2 ;;
      *) fail "unknown argument"; return 1 ;;
    esac
  done

  [[ "$(id -u)" == "$EXPECTED_ROOT_UID" ]] || { fail "approval must run as root"; return 1; }
  [[ "$role" == "test" || "$role" == "prod" ]] || { fail "role must be test or prod"; return 1; }
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { fail "commit SHA must be canonical lowercase 40-hex"; return 1; }
  [[ "$commit_bundle_sha256" =~ ^[0-9a-f]{64}$ ]] || { fail "commit bundle digest must be canonical lowercase SHA256"; return 1; }
  [[ -f "$commit_bundle" && ! -L "$commit_bundle" ]] || { fail "commit bundle must be a regular non-symlink file"; return 1; }
  [[ "$(basename -- "$commit_bundle")" == *"$sha"* ]] || { fail "commit bundle filename is not bound to the approved SHA"; return 1; }
  [[ "$(sha256sum "$commit_bundle" | awk '{print $1}')" == "$commit_bundle_sha256" ]] || { fail "commit bundle does not match its out-of-band digest"; return 1; }
  [[ -x /usr/bin/git ]] || { fail "trusted Git verifier is unavailable"; return 1; }

  local verification_directory verified_sha
  verification_directory="$(mktemp -d)"
  # shellcheck disable=SC2064 # Bind this invocation's local path before RETURN.
  trap "rm -rf -- '$verification_directory'" RETURN
  /usr/bin/git -c protocol.file.allow=always clone --bare --no-local -- "$commit_bundle" "$verification_directory/repository.git" >/dev/null 2>&1 || {
    fail "commit artifact is not a valid self-contained Git bundle"
    return 1
  }
  /usr/bin/git -C "$verification_directory/repository.git" fsck --strict --no-dangling >/dev/null 2>&1 || {
    fail "commit bundle object graph failed strict verification"
    return 1
  }
  verified_sha="$(/usr/bin/git -C "$verification_directory/repository.git" rev-parse --verify 'refs/heads/main^{commit}')" || {
    fail "commit bundle does not contain a protected-main branch tip"
    return 1
  }
  [[ "$verified_sha" == "$sha" ]] || { fail "commit bundle main tip does not match the approved SHA"; return 1; }
  rm -rf -- "$verification_directory"
  trap - RETURN

  local approval_parent
  approval_parent="$(dirname -- "$APPROVAL_DIRECTORY")"
  [[ -d "$approval_parent" && ! -L "$approval_parent" ]] || { fail "approval parent directory is missing or unsafe"; return 1; }
  [[ "$(stat -c '%u:%g:%a' -- "$approval_parent")" == "$EXPECTED_ROOT_UID:$EXPECTED_ROOT_GID:755" ]] || { fail "approval parent directory ownership or mode is unsafe"; return 1; }
  [[ -d "$APPROVAL_DIRECTORY" && ! -L "$APPROVAL_DIRECTORY" ]] || { fail "approval directory is missing or unsafe"; return 1; }
  [[ "$(stat -c '%u:%g:%a' -- "$APPROVAL_DIRECTORY")" == "$EXPECTED_ROOT_UID:$EXPECTED_ROOT_GID:755" ]] || { fail "approval directory ownership or mode is unsafe"; return 1; }

  local target temporary_file
  target="$APPROVAL_DIRECTORY/approved-main-$role.sha"
  [[ ! -L "$target" ]] || { fail "approval target is a symlink"; return 1; }
  [[ ! -e "$target" || -f "$target" ]] || { fail "approval target is not a regular file"; return 1; }
  temporary_file="$(mktemp "$APPROVAL_DIRECTORY/.approved-main-$role.XXXXXX")"
  # shellcheck disable=SC2064 # Bind this invocation's local path before RETURN.
  trap "rm -f -- '$temporary_file'" RETURN
  printf '%s\n' "$sha" >"$temporary_file"
  chmod 0644 -- "$temporary_file"
  mv -fT -- "$temporary_file" "$target"
  trap - RETURN
  printf '%s\n' "approved protected-main SHA for $role runner: $sha"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  approve_runner_main_sha "$@"
fi
