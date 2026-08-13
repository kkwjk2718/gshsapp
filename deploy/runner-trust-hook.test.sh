#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
INSTALLER="$SCRIPT_DIR/install-runner-trust-hook.sh"
VERIFIER="$SCRIPT_DIR/verify-runner-trust-hook.sh"

temporary_directory="$(mktemp -d)"
trap 'rm -rf -- "$temporary_directory"' EXIT
test_root="$temporary_directory/root"
runner_root="$test_root/home/actions-runner"
service_unit="actions.runner.kkwjk2718-gshsapp.gshs-test.service"
mkdir -p "$runner_root"
printf '%s\n' '{"agentId":1}' >"$runner_root/.runner"
printf '%s\n' \
  'PATH=/attacker-controlled' \
  'ACTIONS_RUNNER_HOOK_JOB_STARTED=/tmp/attacker.sh' \
  >"$runner_root/.env"

systemctl_log="$temporary_directory/systemctl.log"
declare -A recorded_modes=()

# The production entrypoints clear imported functions before running. Tests source
# them first, then replace only host-management commands with deterministic fakes.
# shellcheck source=verify-runner-trust-hook.sh
source "$VERIFIER"
# shellcheck source=install-runner-trust-hook.sh
source "$INSTALLER"
# Read by runner_trust_fs_path from the sourced verifier.
# shellcheck disable=SC2034
TRUST_ROOT_PREFIX="$test_root"

id() {
  case "$*" in
    -u) printf '%s\n' 0 ;;
    "-gn actions") printf '%s\n' runners ;;
    "-g actions") printf '%s\n' 1000 ;;
    *) return 1 ;;
  esac
}

systemctl() {
  printf '%s\n' "$*" >>"$systemctl_log"
  case "$*" in
    "show $service_unit --property=LoadState --value") printf '%s\n' loaded ;;
    "show $service_unit --property=User --value") printf '%s\n' actions ;;
    "show $service_unit --property=ActiveState --value") printf '%s\n' active ;;
    "show $service_unit --property=ReadOnlyPaths --value")
      printf '%s %s\n' "/usr/local/lib/gshsapp-actions-runner" "$runner_root/.env"
      ;;
    "is-active --quiet $service_unit") return 0 ;;
    stop*|start*|restart*|daemon-reload) return 0 ;;
    *) return 1 ;;
  esac
}

install() {
  local mode=""
  local make_directory="false"
  local -a operands=()
  while [[ "$#" -gt 0 ]]; do
    case "$1" in
      -d) make_directory="true"; shift ;;
      -m) mode="$2"; shift 2 ;;
      -o|-g) shift 2 ;;
      --) shift; operands+=("$@"); break ;;
      *) operands+=("$1"); shift ;;
    esac
  done
  if [[ "$make_directory" == "true" ]]; then
    mkdir -p -- "${operands[@]}"
    [[ -z "$mode" ]] || chmod "$mode" -- "${operands[@]}"
    return
  fi
  cp -- "${operands[-2]}" "${operands[-1]}"
  [[ -z "$mode" ]] || chmod "$mode" -- "${operands[-1]}"
}

chmod() {
  local mode="${1#0}"
  shift
  [[ "${1:-}" == "--" ]] && shift
  local path
  for path in "$@"; do
    recorded_modes["$path"]="$mode"
    command chmod "0$mode" -- "$path" 2>/dev/null || true
  done
}

stat() {
  local format=""
  local target="${*: -1}"
  if [[ "$1" == "-c" || "$1" == "-Lc" ]]; then
    format="$2"
    shift 2
  else
    command stat "$@"
    return
  fi
  [[ "$1" == "--" ]] && shift
  case "$format" in
    %u) printf '%s\n' 0 ;;
    %g)
      if [[ "$target" == "$runner_root/.env" ]]; then
        printf '%s\n' 1000
      else
        printf '%s\n' 0
      fi
      ;;
    %a)
      if [[ -n "${recorded_modes[$target]:-}" ]]; then
        printf '%s\n' "${recorded_modes[$target]}"
      else
        command stat -c "$format" -- "$@"
      fi
      ;;
    *) command stat -c "$format" -- "$@" ;;
  esac
}

symlink_probe_target="$temporary_directory/symlink-target"
symlink_probe="$temporary_directory/symlink-probe"
mkdir -p "$symlink_probe_target"
ln -s "$symlink_probe_target" "$symlink_probe"
if [[ -L "$symlink_probe" ]]; then
  unsafe_hook_dir="$test_root/usr/local/lib/gshsapp-actions-runner"
  mkdir -p "$(dirname "$unsafe_hook_dir")"
  ln -s "$symlink_probe_target" "$unsafe_hook_dir"
  : >"$systemctl_log"
  if install_runner_trust_hook --runner-root "$runner_root" --runner-service "$service_unit" --role test >/dev/null 2>&1; then
    echo "Installer accepted a symlinked hook directory." >&2
    exit 1
  fi
  if grep -Fq "stop $service_unit" "$systemctl_log"; then
    echo "Installer stopped the runner before rejecting an unsafe hook path." >&2
    exit 1
  fi
  rm "$unsafe_hook_dir"
fi
: >"$systemctl_log"

install_runner_trust_hook \
  --runner-root "$runner_root" \
  --runner-service "$service_unit" \
  --role test

hook_dir="$test_root/usr/local/lib/gshsapp-actions-runner"
hook_path="$hook_dir/runner-job-started-hook.sh"
policy_path="$hook_dir/runner-job-policy.sh"
runner_env="$runner_root/.env"
dropin="$test_root/etc/systemd/system/$service_unit.d/90-gshs-runner-trust.conf"
backup="$test_root/var/lib/gshsapp-runner-trust/$service_unit/runner.env.pre-trust"

[[ -f "$hook_path" && ! -L "$hook_path" ]]
[[ -f "$policy_path" && ! -L "$policy_path" ]]
[[ "$(stat -c '%a' "$hook_path")" == "755" ]]
[[ "$(stat -c '%a' "$policy_path")" == "755" ]]
[[ "$(stat -c '%a' "$runner_env")" == "640" ]]
[[ "$(stat -c '%a' "$dropin")" == "644" ]]
[[ "$(stat -c '%a' "$backup")" == "600" ]]
[[ "$(cat "$runner_env")" == "ACTIONS_RUNNER_HOOK_JOB_STARTED=/usr/local/lib/gshsapp-actions-runner/runner-job-started-hook.sh" ]]
grep -Fxq 'PATH=/attacker-controlled' "$backup"
grep -Fxq 'ReadOnlyPaths=/usr/local/lib/gshsapp-actions-runner' "$dropin"
grep -Fxq "ReadOnlyPaths=$runner_root/.env" "$dropin"
grep -Fxq 'Environment=PATH=/usr/sbin:/usr/bin:/sbin:/bin' "$dropin"
grep -Fq 'exec "$POLICY_PATH" "test"' "$hook_path"
grep -Fxq "stop $service_unit" "$systemctl_log"
grep -Fxq 'daemon-reload' "$systemctl_log"
grep -Fxq "start $service_unit" "$systemctl_log"

verify_runner_trust_hook \
  --runner-root "$runner_root" \
  --runner-service "$service_unit" \
  --role test

chmod 0666 "$runner_env"
if verify_runner_trust_hook --runner-root "$runner_root" --runner-service "$service_unit" --role test >/dev/null 2>&1; then
  echo "Verifier accepted a group/world-writable runner .env." >&2
  exit 1
fi
chmod 0640 "$runner_env"

mv "$policy_path" "$policy_path.real"
ln -s "$policy_path.real" "$policy_path"
if [[ -L "$policy_path" ]]; then
  if verify_runner_trust_hook --runner-root "$runner_root" --runner-service "$service_unit" --role test >/dev/null 2>&1; then
    echo "Verifier accepted a symlinked runner policy." >&2
    exit 1
  fi
fi
rm "$policy_path"
mv "$policy_path.real" "$policy_path"

printf '%s\n' '#!/bin/bash' 'exit 0' >"$policy_path"
if verify_runner_trust_hook --runner-root "$runner_root" --runner-service "$service_unit" --role test >/dev/null 2>&1; then
  echo "Verifier accepted modified root-owned policy content." >&2
  exit 1
fi
cp "$SCRIPT_DIR/runner-job-policy.sh" "$policy_path"
chmod 0755 "$policy_path"

printf '%s\n' '[Service]' >"$dropin"
if verify_runner_trust_hook --runner-root "$runner_root" --runner-service "$service_unit" --role test >/dev/null 2>&1; then
  echo "Verifier accepted a drop-in without read-only trust anchors." >&2
  exit 1
fi

echo "runner trust hook install/verify tests: ok"
