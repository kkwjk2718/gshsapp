#!/bin/bash
set -Eeuo pipefail

PATH=/usr/sbin:/usr/bin:/sbin:/bin
LC_ALL=C
export PATH LC_ALL
builtin unset BASH_ENV ENV CDPATH GLOBIGNORE TRUST_ROOT_PREFIX RUNNER_TRUST_NODE_BINARY LD_PRELOAD LD_LIBRARY_PATH PYTHONPATH PYTHONHOME NODE_OPTIONS TMPDIR TMP TEMP
IFS=$' \t\n'
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  while IFS= read -r inherited_function; do
    builtin unset -f "$inherited_function" 2>/dev/null || true
  done < <(builtin compgen -A function)
fi

RUNNER_TRUST_HOOK_DIR="/usr/local/lib/gshsapp-actions-runner"
RUNNER_TRUST_HOOK_PATH="$RUNNER_TRUST_HOOK_DIR/runner-job-started-hook.sh"
RUNNER_TRUST_POLICY_PATH="$RUNNER_TRUST_HOOK_DIR/runner-job-policy.sh"
RUNNER_TRUST_STATE_DIR="/etc/gshsapp-runner-trust"
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

runner_trust_assert_registration_policy() {
  local runner_settings="$1"
  if [[ -n "${RUNNER_TRUST_NODE_BINARY:-}" ]]; then
    [[ -x "$RUNNER_TRUST_NODE_BINARY" ]] || { runner_trust_fail "trusted test JSON parser is unavailable"; return 1; }
    "$RUNNER_TRUST_NODE_BINARY" -e '
      const fs = require("fs");
      const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      if (value === null || typeof value !== "object" || Array.isArray(value)) process.exit(1);
      if (value.disableUpdate !== true || value.workFolder !== "_work") process.exit(1);
    ' "$runner_settings" >/dev/null 2>&1 || {
      runner_trust_fail "runner must be registered with --disableupdate and the _work directory"
      return 1
    }
    return 0
  fi
  [[ -x /usr/bin/python3 ]] || { runner_trust_fail "trusted JSON parser is unavailable"; return 1; }
  /usr/bin/python3 - "$runner_settings" <<'PY' >/dev/null 2>&1 || {
import json
import sys

with open(sys.argv[1], encoding="utf-8") as source:
    value = json.load(source)
if not isinstance(value, dict):
    raise SystemExit(1)
if value.get("disableUpdate") is not True or value.get("workFolder") != "_work":
    raise SystemExit(1)
PY
    runner_trust_fail "runner must be registered with --disableupdate and the _work directory"
    return 1
  }
}

runner_trust_assert_trusted_ancestor_chain() {
  local target="$1"
  local boundary="${TRUST_ROOT_PREFIX:-/}"
  local current="$target"
  local mode mode_value

  if [[ "$boundary" == "/" ]]; then
    [[ "$current" == /* ]] || { runner_trust_fail "trusted path is not absolute: $target"; return 1; }
  else
    [[ "$current" == "$boundary" || "$current" == "$boundary/"* ]] || {
      runner_trust_fail "trusted path escapes its verification root: $target"
      return 1
    }
  fi
  while :; do
    [[ -d "$current" && ! -L "$current" ]] || { runner_trust_fail "trusted ancestor is not a real directory: $current"; return 1; }
    [[ "$(stat -c '%u' -- "$current")" == "0" && "$(stat -c '%g' -- "$current")" == "0" ]] || {
      runner_trust_fail "trusted ancestor is not root-owned: $current"
      return 1
    }
    mode="$(stat -c '%a' -- "$current")"
    [[ "$mode" =~ ^[0-7]{3}$ ]] || { runner_trust_fail "trusted ancestor mode is invalid: $current"; return 1; }
    mode_value=$((8#$mode))
    (( (mode_value & 0022) == 0 )) || { runner_trust_fail "trusted ancestor is group/world writable: $current"; return 1; }
    [[ "$current" != "$boundary" ]] || break
    current="${current%/*}"
    [[ -n "$current" ]] || current="/"
  done
}

runner_trust_assert_root_nonwritable_node() {
  local path="$1"
  local kind="$2"
  local mode mode_value
  [[ ! -L "$path" ]] || { runner_trust_fail "runner application $kind is a symlink: $path"; return 1; }
  if [[ "$kind" == "directory" ]]; then
    [[ -d "$path" ]] || { runner_trust_fail "runner application directory is missing: $path"; return 1; }
  else
    [[ -f "$path" ]] || { runner_trust_fail "runner application file is missing: $path"; return 1; }
  fi
  [[ "$(stat -c '%u' -- "$path")" == "0" && "$(stat -c '%g' -- "$path")" == "0" ]] || {
    runner_trust_fail "runner application $kind is not root-owned: $path"
    return 1
  }
  mode="$(stat -c '%a' -- "$path")"
  [[ "$mode" =~ ^[0-7]{3}$ ]] || { runner_trust_fail "runner application $kind mode is invalid: $path"; return 1; }
  mode_value=$((8#$mode))
  (( (mode_value & 0022) == 0 )) || { runner_trust_fail "runner application $kind is group/world writable: $path"; return 1; }
}

runner_trust_assert_real_directory() {
  local path="$1"
  [[ -d "$path" && ! -L "$path" ]] || { runner_trust_fail "bounded writable path is not a real directory: $path"; return 1; }
  [[ "$(readlink -f -- "$path")" == "$path" ]] || { runner_trust_fail "bounded writable path is not canonical: $path"; return 1; }
}

runner_trust_expected_runner_user() {
  case "$1" in
    test) printf '%s\n' 'gshs-runner-test' ;;
    prod) printf '%s\n' 'gshs-runner-prod' ;;
    *) runner_trust_fail "runner role is not recognized"; return 1 ;;
  esac
}

runner_trust_verify_runner_manifest() {
  local manifest="$1"
  local runner_root="$2"
  local expected_paths actual_paths line relative_path
  local has_runsvc="false"
  local has_listener="false"
  local has_worker="false"

  expected_paths="$(mktemp)"
  actual_paths="$(mktemp)"
  # shellcheck disable=SC2064 # Bind this invocation's local paths before RETURN.
  trap "rm -f -- '$expected_paths' '$actual_paths'" RETURN

  : >"$expected_paths"
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^([0-9a-f]{64})[[:space:]][[:space:]]([A-Za-z0-9][A-Za-z0-9._@+/-]*)$ ]] || {
      runner_trust_fail "runner manifest contains an invalid entry"
      return 1
    }
    relative_path="${BASH_REMATCH[2]}"
    [[ "$relative_path" != /* && "/$relative_path/" != *"/../"* && "/$relative_path/" != *"/./"* ]] || {
      runner_trust_fail "runner manifest path is unsafe"
      return 1
    }
    case "$relative_path" in
      .runner|.credentials|.credentials_rsaparams|.service|.env|.path|_work/*|_diag/*)
        runner_trust_fail "runner manifest contains mutable runner state"
        return 1
        ;;
      runsvc.sh) has_runsvc="true" ;;
      bin/Runner.Listener) has_listener="true" ;;
      bin/Runner.Worker) has_worker="true" ;;
    esac
    printf '%s\n' "$relative_path" >>"$expected_paths"
  done <"$manifest"

  [[ "$has_runsvc" == "true" && "$has_listener" == "true" && "$has_worker" == "true" ]] || {
    runner_trust_fail "runner manifest does not cover the executable service chain"
    return 1
  }
  [[ "$(sort "$expected_paths" | uniq -d | wc -l)" == "0" ]] || {
    runner_trust_fail "runner manifest contains duplicate paths"
    return 1
  }

  (
    cd -- "$runner_root"
    sha256sum --check --strict --status -- "$manifest"
  ) || {
    runner_trust_fail "runner files do not match the trusted manifest"
    return 1
  }

  (
    cd -- "$runner_root"
    find . \
      -path './_work' -prune -o \
      -path './_diag' -prune -o \
      -type l -print -o \
      -type f \
      ! -path './.runner' \
      ! -path './.credentials' \
      ! -path './.credentials_rsaparams' \
      ! -path './.service' \
      ! -path './.env' \
      ! -path './.path' \
      -print
  ) | sed 's|^\./||' | sort >"$actual_paths"
  sort "$expected_paths" -o "$expected_paths"
  cmp -s -- "$expected_paths" "$actual_paths" || {
    runner_trust_fail "runner application tree differs from the trusted manifest"
    return 1
  }

  while IFS= read -r relative_path; do
    runner_trust_assert_root_nonwritable_node "$runner_root/$relative_path" file || return 1
  done <"$expected_paths"
  while IFS= read -r -d '' relative_path; do
    runner_trust_assert_root_nonwritable_node "$relative_path" directory || return 1
  done < <(
    find "$runner_root" \
      -path "$runner_root/_work" -prune -o \
      -path "$runner_root/_diag" -prune -o \
      -type d -print0
  )

  rm -f -- "$expected_paths" "$actual_paths"
  trap - RETURN
}

runner_trust_verify_registration_manifest() {
  local manifest="$1"
  local runner_root="$2"
  local paths line
  paths="$(mktemp)"
  # shellcheck disable=SC2064 # Bind this invocation's local path before RETURN.
  trap "rm -f -- '$paths'" RETURN
  : >"$paths"
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[0-9a-f]{64}[[:space:]][[:space:]](\.[A-Za-z0-9_]+)$ ]] || {
      runner_trust_fail "runner registration manifest contains an invalid entry"
      return 1
    }
    printf '%s\n' "${BASH_REMATCH[1]}" >>"$paths"
  done <"$manifest"
  [[ "$(sort "$paths" | tr '\n' ' ')" == ".credentials .credentials_rsaparams .runner .service " ]] || {
    runner_trust_fail "runner registration manifest does not cover the exact clean-registration state"
    return 1
  }
  (
    cd -- "$runner_root"
    sha256sum --check --strict --status -- "$manifest"
  ) || {
    runner_trust_fail "runner registration state does not match the trusted clean-install manifest"
    return 1
  }
  rm -f -- "$paths"
  trap - RETURN
}

runner_trust_verify_bootstrap_manifest() {
  local manifest="$1"
  local source_directory="$2"
  local paths line
  paths="$(mktemp)"
  # shellcheck disable=SC2064 # Bind this invocation's local path before RETURN.
  trap "rm -f -- '$paths'" RETURN
  : >"$paths"
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[0-9a-f]{64}[[:space:]][[:space:]]([A-Za-z0-9-]+\.sh)$ ]] || {
      runner_trust_fail "bootstrap manifest contains an invalid entry"
      return 1
    }
    printf '%s\n' "${BASH_REMATCH[1]}" >>"$paths"
  done <"$manifest"
  [[ "$(sort "$paths" | tr '\n' ' ')" == "install-runner-trust-hook.sh runner-job-policy.sh verify-runner-trust-hook.sh " ]] || {
    runner_trust_fail "bootstrap manifest does not cover the exact trust-chain scripts"
    return 1
  }
  (
    cd -- "$source_directory"
    sha256sum --check --strict --status -- "$manifest"
  ) || {
    runner_trust_fail "bootstrap files do not match the trusted offline manifest"
    return 1
  }
  rm -f -- "$paths"
  trap - RETURN
}

runner_trust_render_hook() {
  local role="$1"
  cat <<EOF
#!/bin/bash
set -Eeuo pipefail
PATH=/usr/sbin:/usr/bin:/sbin:/bin
LC_ALL=C
export PATH LC_ALL
builtin unset BASH_ENV ENV CDPATH GLOBIGNORE LD_PRELOAD LD_LIBRARY_PATH PYTHONPATH PYTHONHOME NODE_OPTIONS
IFS=$' \t\n'
while IFS= read -r inherited_function; do
  builtin unset -f "\$inherited_function" 2>/dev/null || true
done < <(builtin compgen -A function)
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
check_anchor_directory /etc
check_anchor_directory "$RUNNER_TRUST_STATE_DIR"
check_anchor_file "\$HOOK_PATH"
check_anchor_file "\$POLICY_PATH"
exec "\$POLICY_PATH" "$role"
EOF
}

runner_trust_render_dropin() {
  local runner_root="$1"
  local service_unit="$2"
  local role="$3"
  cat <<EOF
[Unit]
ConditionPathExists=$RUNNER_TRUST_STATE_DIR/$service_unit.enabled

[Service]
Environment=PATH=/usr/sbin:/usr/bin:/sbin:/bin
KillMode=control-group
ExecStartPre=+$RUNNER_TRUST_HOOK_DIR/verify-runner-trust-prestart.sh --pre-start --runner-root $runner_root --runner-service $service_unit --role $role
ReadOnlyPaths=$RUNNER_TRUST_HOOK_DIR
ReadOnlyPaths=$RUNNER_TRUST_STATE_DIR
ReadOnlyPaths=$runner_root
ReadWritePaths=$runner_root/_work
ReadWritePaths=$runner_root/_diag
EOF
}

runner_trust_require_exact_path_set() {
  local actual="$1"
  shift
  local -a actual_paths=()
  local expected_path actual_path found
  read -r -a actual_paths <<<"$actual"
  [[ "${#actual_paths[@]}" -eq "$#" ]] || return 1
  for expected_path in "$@"; do
    found="false"
    for actual_path in "${actual_paths[@]}"; do
      if [[ "$actual_path" == "$expected_path" ]]; then
        found="true"
        break
      fi
    done
    [[ "$found" == "true" ]] || return 1
  done
}

runner_trust_assert_service_command_chain() {
  local service_unit="$1"
  local runner_root="$2"
  local role="${3:-}"
  local allow_missing_prestart="${4:-false}"
  local exec_start exec_start_ex exec_start_pre exec_start_pre_ex exec_start_post service_type expected_prefix expected_prestart_prefix property value
  exec_start="$(systemctl show "$service_unit" --property=ExecStart --value)"
  expected_prefix="{ path=$runner_root/runsvc.sh ; argv[]=$runner_root/runsvc.sh ; ignore_errors=no ; "
  [[ "$exec_start" != *$'\n'* && "$exec_start" == "$expected_prefix"*" }" && "$exec_start" != *" } { path="* ]] || {
    runner_trust_fail "runner service must have exactly one trusted ExecStart command"
    return 1
  }
  exec_start_ex="$(systemctl show "$service_unit" --property=ExecStartEx --value)"
  [[ "$exec_start_ex" != *$'\n'* && "$exec_start_ex" == *"path=$runner_root/runsvc.sh"* && "$exec_start_ex" == *"argv[]=$runner_root/runsvc.sh"* && "$exec_start_ex" == *"; flags= ;"* && "$exec_start_ex" != *" } { path="* ]] || {
    runner_trust_fail "runner ExecStartEx must be available and contain no privilege prefix flags"
    return 1
  }
  exec_start_pre="$(systemctl show "$service_unit" --property=ExecStartPre --value)"
  exec_start_pre_ex="$(systemctl show "$service_unit" --property=ExecStartPreEx --value)"
  exec_start_post="$(systemctl show "$service_unit" --property=ExecStartPost --value)"
  if [[ -n "$role" ]]; then
    expected_prestart_prefix="{ path=$RUNNER_TRUST_HOOK_DIR/verify-runner-trust-prestart.sh ; argv[]=$RUNNER_TRUST_HOOK_DIR/verify-runner-trust-prestart.sh --pre-start --runner-root $runner_root --runner-service $service_unit --role $role ; ignore_errors=no ; "
    if [[ "$allow_missing_prestart" == "true" && -z "$exec_start_pre" ]]; then
      [[ -z "$exec_start_pre_ex" ]] || { runner_trust_fail "runner pre-start extended command disagrees with the base command"; return 1; }
      :
    elif [[ "$exec_start_pre" != *$'\n'* && "$exec_start_pre" == "$expected_prestart_prefix"*" }" && "$exec_start_pre" != *" } { path="* ]]; then
      :
    else
      runner_trust_fail "runner service must have exactly one trusted pre-start verifier"
      return 1
    fi
    if [[ -n "$exec_start_pre" ]]; then
      [[ "$exec_start_pre_ex" != *$'\n'* && "$exec_start_pre_ex" == *"path=$RUNNER_TRUST_HOOK_DIR/verify-runner-trust-prestart.sh"* && "$exec_start_pre_ex" == *"argv[]=$RUNNER_TRUST_HOOK_DIR/verify-runner-trust-prestart.sh --pre-start --runner-root $runner_root --runner-service $service_unit --role $role"* && "$exec_start_pre_ex" == *"; flags=privileged ;"* && "$exec_start_pre_ex" != *" } { path="* ]] || {
        runner_trust_fail "runner pre-start verifier must have exactly the systemd privileged flag"
        return 1
      }
    fi
  else
    [[ -z "$exec_start_pre" && -z "$exec_start_pre_ex" ]] || { runner_trust_fail "runner service has an untrusted pre-start command before hardening"; return 1; }
  fi
  [[ -z "$exec_start_post" ]] || { runner_trust_fail "runner service post-start commands are not allowed"; return 1; }
  for property in ExecCondition ExecStop ExecStopPost ExecReload; do
    value="$(systemctl show "$service_unit" --property="$property" --value)"
    [[ -z "$value" ]] || { runner_trust_fail "runner service has an untrusted lifecycle command: $property"; return 1; }
  done
  service_type="$(systemctl show "$service_unit" --property=Type --value)"
  [[ "$service_type" == "simple" ]] || { runner_trust_fail "runner service type must be simple"; return 1; }
}

runner_trust_assert_no_namespace_remap() {
  local service_unit="$1"
  local property value
  for property in \
    RootDirectory \
    RootImage \
    RootHash \
    RootHashSignature \
    RootVerity \
    BindPaths \
    BindReadOnlyPaths \
    TemporaryFileSystem \
    MountImages \
    ExtensionImages; do
    value="$(systemctl show "$service_unit" --property="$property" --value)"
    [[ -z "$value" ]] || { runner_trust_fail "runner service namespace remapping is not allowed: $property"; return 1; }
  done
}

runner_trust_assert_nonprivileged_account() {
  local runner_user="$1"
  local service_unit="$2"
  local primary_group effective_group groups group
  primary_group="$(id -gn "$runner_user")"
  effective_group="$(systemctl show --property=Group --value "$service_unit")"
  [[ -z "$effective_group" || "$effective_group" == "$primary_group" ]] || {
    runner_trust_fail "runner service Group must be empty/default or the account primary group"
    return 1
  }
  groups="$(id -nG "$runner_user")"
  for group in $groups; do
    case "$group" in
      root|sudo|wheel|docker|lxd|libvirt|kvm|disk|adm|systemd-journal)
        runner_trust_fail "runner account belongs to a root-equivalent or host-sensitive group: $group"
        return 1
        ;;
    esac
  done
  [[ -z "$(systemctl show --property=SupplementaryGroups --value "$service_unit")" ]] || {
    runner_trust_fail "runner service supplementary groups are not allowed"
    return 1
  }
  [[ -z "$(systemctl show --property=AmbientCapabilities --value "$service_unit")" ]] || {
    runner_trust_fail "runner service ambient capabilities are not allowed"
    return 1
  }
  if [[ -x /usr/bin/sudo ]]; then
    local sudo_listing sudo_status
    if sudo_listing="$(sudo -n -l -U "$runner_user" 2>/dev/null)"; then
      sudo_status=0
    else
      sudo_status="$?"
    fi
    if [[ "$sudo_status" -eq 0 ]] && grep -Eq '(ALL|NOPASSWD:|SETENV:|/usr/bin/(docker|podman)|/bin/(sh|bash))' <<<"$sudo_listing"; then
      runner_trust_fail "runner account has broad or container/root-equivalent sudo access"
      return 1
    fi
  fi
  if [[ -e /var/run/docker.sock ]] && runuser -u "$runner_user" -- test -r /var/run/docker.sock -o -w /var/run/docker.sock; then
    runner_trust_fail "runner account can access the Docker daemon socket"
    return 1
  fi
  local deployment_root
  deployment_root="$(runner_trust_fs_path /opt/gshsapp)"
  runner_trust_assert_trusted_ancestor_chain "$(runner_trust_fs_path /opt)" || return 1
  if [[ -e "$deployment_root" ]] && runuser -u "$runner_user" -- test -w "$deployment_root"; then
    runner_trust_fail "runner account can write the protected deployment root"
    return 1
  fi
  runner_trust_assert_trusted_ancestor_chain "$(runner_trust_fs_path /usr/local/sbin)" || return 1
  runner_trust_assert_node "$(runner_trust_fs_path /usr/local/sbin/gshsapp-runner-broker)" file 0 0 755 || return 1
  runner_trust_assert_node "$(runner_trust_fs_path "$RUNNER_TRUST_STATE_DIR/broker-enabled")" file 0 0 444 || return 1
}

verify_runner_trust_hook() {
  local runner_root=""
  local service_unit=""
  local role=""
  local pre_start="false"
  while [[ "$#" -gt 0 ]]; do
    case "$1" in
      --runner-root) runner_root="${2:-}"; shift 2 ;;
      --runner-service) service_unit="${2:-}"; shift 2 ;;
      --role) role="${2:-}"; shift 2 ;;
      --pre-start) pre_start="true"; shift ;;
      *) runner_trust_fail "unknown argument"; return 1 ;;
    esac
  done

  [[ "$(id -u)" == "0" ]] || { runner_trust_fail "verification must run as root"; return 1; }
  runner_trust_validate_inputs "$runner_root" "$service_unit" "$role" || return 1
  runner_trust_assert_trusted_ancestor_chain "$runner_root" || return 1
  runner_trust_assert_registration_policy "$runner_root/.runner" || return 1

  local load_state runner_user expected_runner_user runner_uid runner_gid active_state effective_read_only effective_read_write effective_fragment_path effective_working_directory effective_kill_mode effective_environment effective_environment_files
  load_state="$(systemctl show "$service_unit" --property=LoadState --value)"
  [[ "$load_state" == "loaded" ]] || { runner_trust_fail "runner service is not loaded"; return 1; }
  runner_user="$(systemctl show "$service_unit" --property=User --value)"
  [[ -n "$runner_user" && "$runner_user" != "root" ]] || { runner_trust_fail "runner service must use a dedicated non-root user"; return 1; }
  expected_runner_user="$(runner_trust_expected_runner_user "$role")" || return 1
  [[ "$runner_user" == "$expected_runner_user" ]] || { runner_trust_fail "runner service user does not match the dedicated role account"; return 1; }
  runner_trust_assert_nonprivileged_account "$runner_user" "$service_unit" || return 1
  runner_uid="$(id -u "$runner_user")"
  runner_gid="$(id -g "$runner_user")"
  [[ "$runner_uid" =~ ^[0-9]+$ && "$runner_gid" =~ ^[0-9]+$ ]] || { runner_trust_fail "runner service identity could not be resolved"; return 1; }
  effective_fragment_path="$(systemctl show "$service_unit" --property=FragmentPath --value)"
  [[ "$effective_fragment_path" == "/etc/systemd/system/$service_unit" ]] || { runner_trust_fail "runner service fragment path is not trusted"; return 1; }
  runner_trust_assert_service_command_chain "$service_unit" "$runner_root" "$role" || return 1
  runner_trust_assert_no_namespace_remap "$service_unit" || return 1
  effective_working_directory="$(systemctl show "$service_unit" --property=WorkingDirectory --value)"
  [[ "$effective_working_directory" == "$runner_root" ]] || { runner_trust_fail "runner service working directory is not trusted"; return 1; }
  effective_kill_mode="$(systemctl show "$service_unit" --property=KillMode --value)"
  [[ "$effective_kill_mode" == "control-group" ]] || { runner_trust_fail "runner service must terminate its entire workflow process group"; return 1; }
  effective_environment="$(systemctl show "$service_unit" --property=Environment --value)"
  [[ "$effective_environment" == "PATH=/usr/sbin:/usr/bin:/sbin:/bin" ]] || { runner_trust_fail "runner service environment contains untrusted values"; return 1; }
  effective_environment_files="$(systemctl show "$service_unit" --property=EnvironmentFiles --value)"
  [[ -z "$effective_environment_files" ]] || { runner_trust_fail "runner service environment files are not allowed"; return 1; }

  local hook_dir hook_path policy_path prestart_verifier_path runner_env dropin_dir dropin_path runner_manifest registration_manifest service_fragment enabled_marker writable_directory
  hook_dir="$(runner_trust_fs_path "$RUNNER_TRUST_HOOK_DIR")"
  hook_path="$(runner_trust_fs_path "$RUNNER_TRUST_HOOK_PATH")"
  policy_path="$(runner_trust_fs_path "$RUNNER_TRUST_POLICY_PATH")"
  prestart_verifier_path="$(runner_trust_fs_path "$RUNNER_TRUST_HOOK_DIR/verify-runner-trust-prestart.sh")"
  runner_env="$runner_root/.env"
  dropin_dir="$(runner_trust_fs_path "/etc/systemd/system/$service_unit.d")"
  dropin_path="$dropin_dir/90-gshs-runner-trust.conf"
  runner_manifest="$(runner_trust_fs_path "$RUNNER_TRUST_STATE_DIR/$service_unit.runner.sha256")"
  registration_manifest="$(runner_trust_fs_path "$RUNNER_TRUST_STATE_DIR/$service_unit.registration.sha256")"
  enabled_marker="$(runner_trust_fs_path "$RUNNER_TRUST_STATE_DIR/$service_unit.enabled")"
  service_fragment="$(runner_trust_fs_path "$effective_fragment_path")"

  runner_trust_assert_trusted_ancestor_chain "$(dirname -- "$service_fragment")" || return 1
  runner_trust_assert_trusted_ancestor_chain "$(dirname -- "$hook_dir")" || return 1

  runner_trust_assert_node "$hook_dir" directory 0 0 755 || return 1
  runner_trust_assert_node "$hook_path" file 0 0 755 || return 1
  runner_trust_assert_node "$policy_path" file 0 0 755 || return 1
  runner_trust_assert_node "$prestart_verifier_path" file 0 0 755 || return 1
  runner_trust_assert_node "$runner_env" file 0 "$runner_gid" 640 || return 1
  runner_trust_assert_node "$dropin_dir" directory 0 0 755 || return 1
  runner_trust_assert_node "$dropin_path" file 0 0 644 || return 1
  runner_trust_assert_node "$runner_manifest" file 0 0 444 || return 1
  runner_trust_assert_node "$registration_manifest" file 0 0 444 || return 1
  runner_trust_assert_node "$enabled_marker" file 0 0 444 || return 1
  runner_trust_assert_node "$service_fragment" file 0 0 644 || return 1
  runner_trust_assert_node "$(runner_trust_fs_path "$RUNNER_TRUST_STATE_DIR")" directory 0 0 755 || return 1
  for writable_directory in "$runner_root/_work" "$runner_root/_diag"; do
    runner_trust_assert_real_directory "$writable_directory" || return 1
    runner_trust_assert_node "$writable_directory" directory "$runner_uid" "$runner_gid" 700 || return 1
  done
  runner_trust_verify_runner_manifest "$runner_manifest" "$runner_root" || return 1
  runner_trust_verify_registration_manifest "$registration_manifest" "$runner_root" || return 1
  for registration_file in .runner .credentials .credentials_rsaparams .service .path; do
    runner_trust_assert_node "$runner_root/$registration_file" file 0 "$runner_gid" 640 || return 1
  done

  local expected_file
  expected_file="$(mktemp)"
  # shellcheck disable=SC2064 # Bind this invocation's local path before RETURN.
  trap "rm -f -- '$expected_file'" RETURN

  runner_trust_render_hook "$role" >"$expected_file"
  cmp -s -- "$expected_file" "$hook_path" || { runner_trust_fail "installed job-started hook does not match the trusted template"; return 1; }
  [[ -f "$VERIFY_RUNNER_TRUST_SCRIPT_DIR/runner-job-policy.sh" && ! -L "$VERIFY_RUNNER_TRUST_SCRIPT_DIR/runner-job-policy.sh" ]] || { runner_trust_fail "trusted policy source is missing"; return 1; }
  cmp -s -- "$VERIFY_RUNNER_TRUST_SCRIPT_DIR/runner-job-policy.sh" "$policy_path" || { runner_trust_fail "installed job policy does not match the reviewed source"; return 1; }
  cmp -s -- "$VERIFY_RUNNER_TRUST_SCRIPT_DIR/verify-runner-trust-hook.sh" "$prestart_verifier_path" || { runner_trust_fail "installed pre-start verifier does not match the executing trusted verifier"; return 1; }
  printf '%s\n' "ACTIONS_RUNNER_HOOK_JOB_STARTED=$RUNNER_TRUST_HOOK_PATH" >"$expected_file"
  cmp -s -- "$expected_file" "$runner_env" || { runner_trust_fail "runner .env contains values outside the trust anchor"; return 1; }
  printf '%s\n' '/usr/sbin:/usr/bin:/sbin:/bin' >"$expected_file"
  cmp -s -- "$expected_file" "$runner_root/.path" || { runner_trust_fail "runner .path contains values outside the trust anchor"; return 1; }
  runner_trust_render_dropin "$runner_root" "$service_unit" "$role" >"$expected_file"
  cmp -s -- "$expected_file" "$dropin_path" || { runner_trust_fail "systemd read-only policy does not match the trusted template"; return 1; }

  if [[ "$pre_start" != "true" ]]; then
    active_state="$(systemctl show "$service_unit" --property=ActiveState --value)"
    [[ "$active_state" == "active" ]] || { runner_trust_fail "runner service is not active"; return 1; }
  fi
  effective_read_only="$(systemctl show "$service_unit" --property=ReadOnlyPaths --value)"
  runner_trust_require_exact_path_set "$effective_read_only" "$RUNNER_TRUST_HOOK_DIR" "$RUNNER_TRUST_STATE_DIR" "$runner_root" || {
    runner_trust_fail "effective runner read-only paths are not the bounded trust set"
    return 1
  }
  effective_read_write="$(systemctl show "$service_unit" --property=ReadWritePaths --value)"
  runner_trust_require_exact_path_set "$effective_read_write" "$runner_root/_work" "$runner_root/_diag" || {
    runner_trust_fail "effective runner writable paths exceed the bounded work and diagnostics directories"
    return 1
  }

  rm -f -- "$expected_file"
  trap - RETURN
  printf '%s\n' "runner trust hook verification: ok"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  verify_runner_trust_hook "$@"
fi
