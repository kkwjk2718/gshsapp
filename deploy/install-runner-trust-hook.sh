#!/bin/bash
set -Eeuo pipefail

PATH=/usr/sbin:/usr/bin:/sbin:/bin
LC_ALL=C
export PATH LC_ALL
builtin unset BASH_ENV ENV CDPATH GLOBIGNORE TRUST_ROOT_PREFIX
for inherited_function in cat cmp dirname id install mktemp pwd readlink rm stat systemctl printf; do
  builtin unset -f "$inherited_function" 2>/dev/null || true
done

INSTALL_RUNNER_TRUST_SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
if ! declare -F verify_runner_trust_hook >/dev/null 2>&1; then
  # shellcheck source=verify-runner-trust-hook.sh
  source "$INSTALL_RUNNER_TRUST_SCRIPT_DIR/verify-runner-trust-hook.sh"
fi

runner_trust_assert_safe_install_target() {
  local path="$1"
  local kind="$2"
  [[ ! -L "$path" ]] || { runner_trust_fail "installation target must not be a symlink: $path"; return 1; }
  if [[ -e "$path" ]]; then
    if [[ "$kind" == "directory" ]]; then
      [[ -d "$path" ]] || { runner_trust_fail "installation directory target has the wrong type: $path"; return 1; }
    else
      [[ -f "$path" ]] || { runner_trust_fail "installation file target has the wrong type: $path"; return 1; }
    fi
  fi
}

runner_trust_assert_safe_ancestors() {
  local target="$1"
  local current=""
  local -a components=()
  local index
  IFS='/' read -r -a components <<<"${target#/}"
  for ((index = 0; index < ${#components[@]} - 1; index += 1)); do
    current="$current/${components[$index]}"
    [[ ! -L "$current" ]] || { runner_trust_fail "installation ancestor must not be a symlink: $current"; return 1; }
    [[ ! -e "$current" || -d "$current" ]] || { runner_trust_fail "installation ancestor must be a directory: $current"; return 1; }
  done
}

install_runner_trust_hook() {
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

  [[ "$(id -u)" == "0" ]] || { runner_trust_fail "installation must run as root"; return 1; }
  runner_trust_validate_inputs "$runner_root" "$service_unit" "$role" || return 1

  local load_state runner_user runner_group runner_gid
  load_state="$(systemctl show "$service_unit" --property=LoadState --value)"
  [[ "$load_state" == "loaded" ]] || { runner_trust_fail "runner service is not loaded"; return 1; }
  runner_user="$(systemctl show "$service_unit" --property=User --value)"
  [[ -n "$runner_user" && "$runner_user" != "root" ]] || { runner_trust_fail "runner service must use a dedicated non-root user"; return 1; }
  runner_group="$(id -gn "$runner_user")"
  runner_gid="$(id -g "$runner_user")"
  [[ -n "$runner_group" && "$runner_gid" =~ ^[0-9]+$ ]] || { runner_trust_fail "runner service group could not be resolved"; return 1; }

  local source_policy
  source_policy="$INSTALL_RUNNER_TRUST_SCRIPT_DIR/runner-job-policy.sh"
  [[ -f "$source_policy" && ! -L "$source_policy" ]] || { runner_trust_fail "trusted policy source is missing"; return 1; }

  local staging_directory staged_hook staged_env staged_dropin
  staging_directory="$(mktemp -d)"
  staged_hook="$staging_directory/runner-job-started-hook.sh"
  staged_env="$staging_directory/runner.env"
  staged_dropin="$staging_directory/90-gshs-runner-trust.conf"
  trap 'rm -rf -- "$staging_directory"' RETURN
  runner_trust_render_hook "$role" >"$staged_hook"
  printf '%s\n' "ACTIONS_RUNNER_HOOK_JOB_STARTED=$RUNNER_TRUST_HOOK_PATH" >"$staged_env"
  runner_trust_render_dropin "$runner_root" >"$staged_dropin"

  local hook_dir hook_path policy_path runner_env dropin_dir dropin_path backup_dir backup_path
  hook_dir="$(runner_trust_fs_path "$RUNNER_TRUST_HOOK_DIR")"
  hook_path="$(runner_trust_fs_path "$RUNNER_TRUST_HOOK_PATH")"
  policy_path="$(runner_trust_fs_path "$RUNNER_TRUST_POLICY_PATH")"
  runner_env="$runner_root/.env"
  dropin_dir="$(runner_trust_fs_path "/etc/systemd/system/$service_unit.d")"
  dropin_path="$dropin_dir/90-gshs-runner-trust.conf"
  backup_dir="$(runner_trust_fs_path "/var/lib/gshsapp-runner-trust/$service_unit")"
  backup_path="$backup_dir/runner.env.pre-trust"

  [[ ! -L "$runner_env" ]] || { runner_trust_fail "runner .env must not be a symlink"; return 1; }
  [[ ! -e "$runner_env" || -f "$runner_env" ]] || { runner_trust_fail "runner .env must be a regular file"; return 1; }
  [[ ! -e "$backup_path" || ( -f "$backup_path" && ! -L "$backup_path" ) ]] || { runner_trust_fail "runner .env backup path is unsafe"; return 1; }
  runner_trust_assert_safe_ancestors "$hook_dir" || return 1
  runner_trust_assert_safe_ancestors "$dropin_dir" || return 1
  runner_trust_assert_safe_ancestors "$backup_dir" || return 1
  runner_trust_assert_safe_install_target "$hook_dir" directory || return 1
  runner_trust_assert_safe_install_target "$hook_path" file || return 1
  runner_trust_assert_safe_install_target "$policy_path" file || return 1
  runner_trust_assert_safe_install_target "$dropin_dir" directory || return 1
  runner_trust_assert_safe_install_target "$dropin_path" file || return 1
  runner_trust_assert_safe_install_target "$backup_dir" directory || return 1
  runner_trust_assert_safe_install_target "$backup_path" file || return 1

  local was_active="false"
  if systemctl is-active --quiet "$service_unit"; then
    was_active="true"
  fi
  systemctl stop "$service_unit"

  install -d -o root -g root -m 0755 -- "$hook_dir"
  install -o root -g root -m 0755 -- "$source_policy" "$policy_path"
  install -o root -g root -m 0755 -- "$staged_hook" "$hook_path"
  install -d -o root -g root -m 0700 -- "$backup_dir"
  if [[ -f "$runner_env" && ! -e "$backup_path" ]]; then
    install -o root -g root -m 0600 -- "$runner_env" "$backup_path"
  fi
  install -o root -g "$runner_group" -m 0640 -- "$staged_env" "$runner_env"
  install -d -o root -g root -m 0755 -- "$dropin_dir"
  install -o root -g root -m 0644 -- "$staged_dropin" "$dropin_path"

  systemctl daemon-reload
  systemctl start "$service_unit"
  verify_runner_trust_hook \
    --runner-root "$runner_root" \
    --runner-service "$service_unit" \
    --role "$role" || return 1

  rm -rf -- "$staging_directory"
  trap - RETURN
  if [[ "$was_active" != "true" ]]; then
    printf '%s\n' "runner trust hook installed; the previously inactive service was started"
  else
    printf '%s\n' "runner trust hook installed and the service was restarted safely"
  fi
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  install_runner_trust_hook "$@"
fi
