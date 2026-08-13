#!/bin/bash
set -Eeuo pipefail

PATH=/usr/sbin:/usr/bin:/sbin:/bin
LC_ALL=C
export PATH LC_ALL
builtin unset BASH_ENV ENV CDPATH GLOBIGNORE TRUST_ROOT_PREFIX
for inherited_function in cat cmp dirname grep id mktemp pwd readlink rm stat systemctl printf; do
  builtin unset -f "$inherited_function" 2>/dev/null || true
done

RUNNER_TRUST_HOOK_DIR="/usr/local/lib/gshsapp-actions-runner"
RUNNER_TRUST_HOOK_PATH="$RUNNER_TRUST_HOOK_DIR/runner-job-started-hook.sh"
RUNNER_TRUST_POLICY_PATH="$RUNNER_TRUST_HOOK_DIR/runner-job-policy.sh"
VERIFY_RUNNER_TRUST_SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"

runner_trust_fail() {
  printf '%s\n' "runner trust verification failed: $1" >&2
  return 1
}

runner_trust_fs_path() {
  printf '%s%s\n' "${TRUST_ROOT_PREFIX:-}" "$1"
}

runner_trust_validate_inputs() {
  local runner_root="$1"
  local service_unit="$2"
  local role="$3"

  [[ "$runner_root" =~ ^/[A-Za-z0-9._/-]+$ ]] || { runner_trust_fail "runner root must be an absolute path without shell metacharacters"; return 1; }
  [[ -d "$runner_root" && ! -L "$runner_root" ]] || { runner_trust_fail "runner root must be a real directory"; return 1; }
  [[ "$(readlink -f -- "$runner_root")" == "$runner_root" ]] || { runner_trust_fail "runner root must be canonical"; return 1; }
  [[ -f "$runner_root/.runner" && ! -L "$runner_root/.runner" ]] || { runner_trust_fail "runner registration file is missing"; return 1; }
  [[ "$service_unit" =~ ^actions\.runner\.kkwjk2718-gshsapp\.[A-Za-z0-9_.@-]+\.service$ ]] || { runner_trust_fail "runner service unit is not allowlisted"; return 1; }
  [[ "$role" == "test" || "$role" == "prod" ]] || { runner_trust_fail "runner role must be test or prod"; return 1; }
}

runner_trust_assert_node() {
  local path="$1"
  local kind="$2"
  local expected_uid="$3"
  local expected_gid="$4"
  local expected_mode="$5"

  [[ ! -L "$path" ]] || { runner_trust_fail "$kind must not be a symlink: $path"; return 1; }
  if [[ "$kind" == "directory" ]]; then
    [[ -d "$path" ]] || { runner_trust_fail "required directory is missing: $path"; return 1; }
  else
    [[ -f "$path" ]] || { runner_trust_fail "required file is missing: $path"; return 1; }
  fi
  [[ "$(stat -c '%u' -- "$path")" == "$expected_uid" ]] || { runner_trust_fail "$kind is not owned by the required user: $path"; return 1; }
  [[ "$(stat -c '%g' -- "$path")" == "$expected_gid" ]] || { runner_trust_fail "$kind is not owned by the required group: $path"; return 1; }
  [[ "$(stat -c '%a' -- "$path")" == "$expected_mode" ]] || { runner_trust_fail "$kind mode is not $expected_mode: $path"; return 1; }
}

runner_trust_render_hook() {
  local role="$1"
  cat <<EOF
#!/bin/bash
set -Eeuo pipefail
PATH=/usr/sbin:/usr/bin:/sbin:/bin
LC_ALL=C
export PATH LC_ALL
builtin unset BASH_ENV ENV CDPATH GLOBIGNORE
builtin unset -f printf 2>/dev/null || true
readonly HOOK_PATH="$RUNNER_TRUST_HOOK_PATH"
readonly POLICY_PATH="$RUNNER_TRUST_POLICY_PATH"

deny_anchor() {
  printf '%s\\n' "runner trust policy denied: local trust anchor validation failed" >&2
  exit 1
}

check_anchor_directory() {
  local path="\$1"
  [[ -d "\$path" && ! -L "\$path" ]] || deny_anchor
  [[ "\$(/usr/bin/stat -c '%u:%g:%a' -- "\$path")" == "0:0:755" ]] || deny_anchor
}

check_anchor_file() {
  local path="\$1"
  [[ -f "\$path" && ! -L "\$path" ]] || deny_anchor
  [[ "\$(/usr/bin/stat -c '%u:%g:%a' -- "\$path")" == "0:0:755" ]] || deny_anchor
}

[[ "\$0" == "\$HOOK_PATH" ]] || deny_anchor
check_anchor_directory /usr
check_anchor_directory /usr/local
check_anchor_directory /usr/local/lib
check_anchor_directory "$RUNNER_TRUST_HOOK_DIR"
check_anchor_file "\$HOOK_PATH"
check_anchor_file "\$POLICY_PATH"
exec "\$POLICY_PATH" "$role"
EOF
}

runner_trust_render_dropin() {
  local runner_root="$1"
  cat <<EOF
[Service]
Environment=PATH=/usr/sbin:/usr/bin:/sbin:/bin
ReadOnlyPaths=$RUNNER_TRUST_HOOK_DIR
ReadOnlyPaths=$runner_root/.env
EOF
}

verify_runner_trust_hook() {
  local runner_root=""
  local service_unit=""
  local role=""
  while [[ "$#" -gt 0 ]]; do
    case "$1" in
      --runner-root) runner_root="${2:-}"; shift 2 ;;
      --runner-service) service_unit="${2:-}"; shift 2 ;;
      --role) role="${2:-}"; shift 2 ;;
      *) runner_trust_fail "unknown argument"; return 1 ;;
    esac
  done

  [[ "$(id -u)" == "0" ]] || { runner_trust_fail "verification must run as root"; return 1; }
  runner_trust_validate_inputs "$runner_root" "$service_unit" "$role" || return 1

  local load_state runner_user runner_gid active_state effective_read_only
  load_state="$(systemctl show "$service_unit" --property=LoadState --value)"
  [[ "$load_state" == "loaded" ]] || { runner_trust_fail "runner service is not loaded"; return 1; }
  runner_user="$(systemctl show "$service_unit" --property=User --value)"
  [[ -n "$runner_user" && "$runner_user" != "root" ]] || { runner_trust_fail "runner service must use a dedicated non-root user"; return 1; }
  runner_gid="$(id -g "$runner_user")"
  [[ "$runner_gid" =~ ^[0-9]+$ ]] || { runner_trust_fail "runner service group could not be resolved"; return 1; }

  local hook_dir hook_path policy_path runner_env dropin_dir dropin_path
  hook_dir="$(runner_trust_fs_path "$RUNNER_TRUST_HOOK_DIR")"
  hook_path="$(runner_trust_fs_path "$RUNNER_TRUST_HOOK_PATH")"
  policy_path="$(runner_trust_fs_path "$RUNNER_TRUST_POLICY_PATH")"
  runner_env="$runner_root/.env"
  dropin_dir="$(runner_trust_fs_path "/etc/systemd/system/$service_unit.d")"
  dropin_path="$dropin_dir/90-gshs-runner-trust.conf"

  runner_trust_assert_node "$hook_dir" directory 0 0 755 || return 1
  runner_trust_assert_node "$hook_path" file 0 0 755 || return 1
  runner_trust_assert_node "$policy_path" file 0 0 755 || return 1
  runner_trust_assert_node "$runner_env" file 0 "$runner_gid" 640 || return 1
  runner_trust_assert_node "$dropin_dir" directory 0 0 755 || return 1
  runner_trust_assert_node "$dropin_path" file 0 0 644 || return 1

  local expected_file
  expected_file="$(mktemp)"
  trap 'rm -f -- "$expected_file"' RETURN

  runner_trust_render_hook "$role" >"$expected_file"
  cmp -s -- "$expected_file" "$hook_path" || { runner_trust_fail "installed job-started hook does not match the trusted template"; return 1; }
  [[ -f "$VERIFY_RUNNER_TRUST_SCRIPT_DIR/runner-job-policy.sh" && ! -L "$VERIFY_RUNNER_TRUST_SCRIPT_DIR/runner-job-policy.sh" ]] || { runner_trust_fail "trusted policy source is missing"; return 1; }
  cmp -s -- "$VERIFY_RUNNER_TRUST_SCRIPT_DIR/runner-job-policy.sh" "$policy_path" || { runner_trust_fail "installed job policy does not match the reviewed source"; return 1; }
  printf '%s\n' "ACTIONS_RUNNER_HOOK_JOB_STARTED=$RUNNER_TRUST_HOOK_PATH" >"$expected_file"
  cmp -s -- "$expected_file" "$runner_env" || { runner_trust_fail "runner .env contains values outside the trust anchor"; return 1; }
  runner_trust_render_dropin "$runner_root" >"$expected_file"
  cmp -s -- "$expected_file" "$dropin_path" || { runner_trust_fail "systemd read-only policy does not match the trusted template"; return 1; }

  active_state="$(systemctl show "$service_unit" --property=ActiveState --value)"
  [[ "$active_state" == "active" ]] || { runner_trust_fail "runner service is not active"; return 1; }
  effective_read_only="$(systemctl show "$service_unit" --property=ReadOnlyPaths --value)"
  [[ " $effective_read_only " == *" $RUNNER_TRUST_HOOK_DIR "* ]] || { runner_trust_fail "hook directory is not read-only in the service namespace"; return 1; }
  [[ " $effective_read_only " == *" $runner_root/.env "* ]] || { runner_trust_fail "runner .env is not read-only in the service namespace"; return 1; }

  rm -f -- "$expected_file"
  trap - RETURN
  printf '%s\n' "runner trust hook verification: ok"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  verify_runner_trust_hook "$@"
fi
