#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
INSTALLER="$SCRIPT_DIR/install-runner-trust-hook.sh"
VERIFIER="$SCRIPT_DIR/verify-runner-trust-hook.sh"
TEST_NODE_BINARY="${RUNNER_TRUST_NODE_BINARY:-$(command -v node || true)}"

temporary_directory="$(mktemp -d)"
trap 'rm -rf -- "$temporary_directory"' EXIT
test_root="$temporary_directory/root"
runner_root="$test_root/home/actions-runner"
service_unit="actions.runner.kkwjk2718-gshsapp.gshs-test.service"
mkdir -p "$runner_root"
mkdir -p "$test_root/usr/local/sbin" "$test_root/etc/gshsapp-runner-trust" "$test_root/opt"
printf '%s\n' '#!/bin/sh' 'exit 1' >"$test_root/usr/local/sbin/gshsapp-runner-broker"
printf '%s\n' 'audited broker activation marker' >"$test_root/etc/gshsapp-runner-trust/broker-enabled"
chmod 0755 "$test_root/usr/local/sbin/gshsapp-runner-broker"
chmod 0444 "$test_root/etc/gshsapp-runner-trust/broker-enabled"
mkdir -p "$test_root/etc/systemd/system"
printf '%s\n' '[Service]' >"$test_root/etc/systemd/system/$service_unit"
chmod 0644 "$test_root/etc/systemd/system/$service_unit"
trusted_runner_settings='{"agentId":1,"disableUpdate":true,"workFolder":"_work"}'
printf '%s\n' "$trusted_runner_settings" >"$runner_root/.runner"
printf '%s\n' '{"scheme":"OAuth"}' >"$runner_root/.credentials"
printf '%s\n' 'rotated-private-key' >"$runner_root/.credentials_rsaparams"
printf '%s\n' "$service_unit" >"$runner_root/.service"
printf '%s\n' '/usr/sbin:/usr/bin:/sbin:/bin' >"$runner_root/.path"
mkdir -p "$runner_root/bin" "$runner_root/_work" "$runner_root/_diag"
printf '%s\n' '#!/bin/bash' 'exec ./bin/Runner.Listener run --startuptype service' >"$runner_root/runsvc.sh"
printf '%s\n' 'trusted-listener' >"$runner_root/bin/Runner.Listener"
printf '%s\n' 'trusted-worker' >"$runner_root/bin/Runner.Worker"
printf '%s\n' \
  'PATH=/attacker-controlled' \
  'ACTIONS_RUNNER_HOOK_JOB_STARTED=/tmp/attacker.sh' \
  >"$runner_root/.env"
trusted_runner_manifest="$temporary_directory/trusted-runner.sha256"
(
  cd "$runner_root"
  for runner_file in runsvc.sh bin/Runner.Listener bin/Runner.Worker; do
    printf '%s  %s\n' "$(sha256sum "$runner_file" | awk '{print $1}')" "$runner_file"
  done >"$trusted_runner_manifest"
)
trusted_runner_manifest_sha256="$(sha256sum "$trusted_runner_manifest" | awk '{print $1}')"
trusted_registration_manifest="$temporary_directory/trusted-registration.sha256"
(
  cd "$runner_root"
  for registration_file in .runner .credentials .credentials_rsaparams .service; do
    printf '%s  %s\n' "$(sha256sum "$registration_file" | awk '{print $1}')" "$registration_file"
  done >"$trusted_registration_manifest"
)
trusted_registration_manifest_sha256="$(sha256sum "$trusted_registration_manifest" | awk '{print $1}')"
trusted_bootstrap_bundle="$temporary_directory/trusted-bootstrap"
mkdir -p "$trusted_bootstrap_bundle"
trusted_bootstrap_manifest="$temporary_directory/trusted-bootstrap.sha256"
(
  cd "$SCRIPT_DIR"
  for bootstrap_file in install-runner-trust-hook.sh verify-runner-trust-hook.sh runner-job-policy.sh; do
    printf '%s  %s\n' "$(sha256sum "$bootstrap_file" | awk '{print $1}')" "$bootstrap_file"
  done >"$trusted_bootstrap_manifest"
)
trusted_bootstrap_manifest_sha256="$(sha256sum "$trusted_bootstrap_manifest" | awk '{print $1}')"
incomplete_bootstrap_manifest="$temporary_directory/incomplete-bootstrap.sha256"
head -n 2 "$trusted_bootstrap_manifest" >"$incomplete_bootstrap_manifest"
incomplete_bootstrap_manifest_sha256="$(sha256sum "$incomplete_bootstrap_manifest" | awk '{print $1}')"

set +e
direct_entrypoint_output="$(bash "$INSTALLER" \
  --bootstrap-manifest "$trusted_bootstrap_manifest" \
  --bootstrap-manifest-sha256 "$trusted_bootstrap_manifest_sha256" 2>&1)"
direct_entrypoint_status="$?"
set -e
if [[ "$direct_entrypoint_status" -eq 0 || "$direct_entrypoint_status" -eq 127 ]] || grep -Fq 'command not found' <<<"$direct_entrypoint_output"; then
  echo "Authenticated installer entrypoint did not retain its installer functions." >&2
  exit 1
fi

malicious_bootstrap="$temporary_directory/malicious-bootstrap"
malicious_verifier_marker="$temporary_directory/malicious-verifier-ran"
mkdir -p "$malicious_bootstrap"
cp "$INSTALLER" "$malicious_bootstrap/install-runner-trust-hook.sh"
cp "$SCRIPT_DIR/runner-job-policy.sh" "$malicious_bootstrap/runner-job-policy.sh"
printf '%s\n' '#!/bin/bash' "touch '$malicious_verifier_marker'" >"$malicious_bootstrap/verify-runner-trust-hook.sh"
if bash "$malicious_bootstrap/install-runner-trust-hook.sh" \
  --bootstrap-manifest "$trusted_bootstrap_manifest" \
  --bootstrap-manifest-sha256 "$trusted_bootstrap_manifest_sha256" >/dev/null 2>&1; then
  echo "Installer accepted a bootstrap with a modified verifier." >&2
  exit 1
fi
if [[ -e "$malicious_verifier_marker" ]]; then
  echo "Installer executed an unauthenticated sibling verifier." >&2
  exit 1
fi

systemctl_log="$temporary_directory/systemctl.log"
declare -A recorded_modes=()
mock_service_user="gshs-runner-test"
mock_active_state="active"
mock_fragment_path="/etc/systemd/system/$service_unit"
mock_exec_start="{ path=$runner_root/runsvc.sh ; argv[]=$runner_root/runsvc.sh ; ignore_errors=no ; start_time=[n/a] ; stop_time=[n/a] ; pid=0 ; code=(null) ; status=0/0 }"
mock_exec_start_ex="{ path=$runner_root/runsvc.sh ; argv[]=$runner_root/runsvc.sh ; flags= ; start_time=[n/a] ; stop_time=[n/a] ; pid=0 ; code=(null) ; status=0/0 }"
mock_exec_start_pre=""
trusted_exec_start_pre="{ path=/usr/local/lib/gshsapp-actions-runner/verify-runner-trust-prestart.sh ; argv[]=/usr/local/lib/gshsapp-actions-runner/verify-runner-trust-prestart.sh --pre-start --runner-root $runner_root --runner-service $service_unit --role test ; ignore_errors=no ; start_time=[n/a] ; stop_time=[n/a] ; pid=0 ; code=(null) ; status=0/0 }"
trusted_exec_start_pre_ex="{ path=/usr/local/lib/gshsapp-actions-runner/verify-runner-trust-prestart.sh ; argv[]=/usr/local/lib/gshsapp-actions-runner/verify-runner-trust-prestart.sh --pre-start --runner-root $runner_root --runner-service $service_unit --role test ; flags=privileged ; start_time=[n/a] ; stop_time=[n/a] ; pid=0 ; code=(null) ; status=0/0 }"
mock_exec_start_pre_ex=""
mock_exec_start_post=""
mock_exec_stop=""
mock_service_type="simple"
mock_root_directory=""
mock_runner_groups="gshs-runner-test runners"
mock_service_group="runners"
mock_working_directory="$runner_root"
mock_read_only_paths="/usr/local/lib/gshsapp-actions-runner /etc/gshsapp-runner-trust $runner_root"
mock_read_write_paths="$runner_root/_work $runner_root/_diag"
mock_kill_mode="control-group"
mock_environment="PATH=/usr/sbin:/usr/bin:/sbin:/bin"
mock_environment_files=""
forced_non_root_path=""

# shellcheck source=install-runner-trust-hook.sh
source "$INSTALLER"
# The production installer authenticates the verifier before sourcing it. This
# test loads the same two files before replacing host commands with fakes.
# shellcheck source=verify-runner-trust-hook.sh
source "$VERIFIER"
# Read by runner_trust_fs_path from the sourced verifier.
# shellcheck disable=SC2034
TRUST_ROOT_PREFIX="$test_root"
# shellcheck disable=SC2034
RUNNER_TRUST_NODE_BINARY="$TEST_NODE_BINARY"

id() {
  case "$*" in
    -u) printf '%s\n' 0 ;;
    "-u gshs-runner-test"|"-u attacker") printf '%s\n' 1000 ;;
    "-gn gshs-runner-test"|"-gn attacker") printf '%s\n' runners ;;
    "-g gshs-runner-test"|"-g attacker") printf '%s\n' 1000 ;;
    "-nG gshs-runner-test"|"-nG attacker") printf '%s\n' "$mock_runner_groups" ;;
    *) return 1 ;;
  esac
}

systemctl() {
  printf '%s\n' "$*" >>"$systemctl_log"
  case "$*" in
    "show $service_unit --property=LoadState --value") printf '%s\n' loaded ;;
    "show $service_unit --property=User --value") printf '%s\n' "$mock_service_user" ;;
    "show $service_unit --property=ActiveState --value") printf '%s\n' "$mock_active_state" ;;
    "show $service_unit --property=FragmentPath --value") printf '%s\n' "$mock_fragment_path" ;;
    "show $service_unit --property=ExecStart --value") printf '%s\n' "$mock_exec_start" ;;
    "show $service_unit --property=ExecStartEx --value") printf '%s\n' "$mock_exec_start_ex" ;;
    "show $service_unit --property=ExecStartPre --value") printf '%s\n' "$mock_exec_start_pre" ;;
    "show $service_unit --property=ExecStartPreEx --value") printf '%s\n' "$mock_exec_start_pre_ex" ;;
    "show $service_unit --property=ExecStartPost --value") printf '%s\n' "$mock_exec_start_post" ;;
    "show $service_unit --property=ExecStop --value") printf '%s\n' "$mock_exec_stop" ;;
    "show $service_unit --property=ExecCondition --value"|\
    "show $service_unit --property=ExecStopPost --value"|\
    "show $service_unit --property=ExecReload --value") printf '\n' ;;
    "show $service_unit --property=Type --value") printf '%s\n' "$mock_service_type" ;;
    "show $service_unit --property=RootDirectory --value") printf '%s\n' "$mock_root_directory" ;;
    "show $service_unit --property=RootImage --value"|\
    "show $service_unit --property=RootHash --value"|\
    "show $service_unit --property=RootHashSignature --value"|\
    "show $service_unit --property=RootVerity --value"|\
    "show $service_unit --property=BindPaths --value"|\
    "show $service_unit --property=BindReadOnlyPaths --value"|\
    "show $service_unit --property=TemporaryFileSystem --value"|\
    "show $service_unit --property=MountImages --value"|\
    "show $service_unit --property=ExtensionImages --value") printf '\n' ;;
    "show $service_unit --property=WorkingDirectory --value") printf '%s\n' "$mock_working_directory" ;;
    "show $service_unit --property=ReadOnlyPaths --value")
      printf '%s\n' "$mock_read_only_paths"
      ;;
    "show $service_unit --property=ReadWritePaths --value") printf '%s\n' "$mock_read_write_paths" ;;
    "show $service_unit --property=KillMode --value") printf '%s\n' "$mock_kill_mode" ;;
    "show $service_unit --property=Environment --value") printf '%s\n' "$mock_environment" ;;
    "show $service_unit --property=EnvironmentFiles --value") printf '%s\n' "$mock_environment_files" ;;
    "show --property=SupplementaryGroups --value $service_unit"|\
    "show --property=AmbientCapabilities --value $service_unit") printf '\n' ;;
    "show --property=Group --value $service_unit") printf '%s\n' "$mock_service_group" ;;
    "is-active --quiet $service_unit") [[ "$mock_active_state" == "active" ]] ;;
    "start $service_unit")
      if [[ "${FORCE_POST_START_VERIFY_FAILURE:-false}" == "true" ]]; then
        mock_active_state="failed"
      else
        mock_active_state="active"
      fi
      return 0
      ;;
    "stop $service_unit")
      if [[ "${FORCE_STOP_FAILURE:-false}" == "true" ]]; then
        return 1
      fi
      mock_active_state="inactive"
      return 0
      ;;
    "kill --kill-who=all --signal=SIGKILL $service_unit")
      if [[ "${FORCE_KILL_FAILURE:-false}" == "true" ]]; then
        return 1
      fi
      mock_active_state="inactive"
      return 0
      ;;
    "mask --runtime --now $service_unit")
      if [[ "${FORCE_MASK_FAILURE:-false}" == "true" ]]; then
        return 1
      fi
      mock_active_state="inactive"
      return 0
      ;;
    "unmask --runtime $service_unit") return 0 ;;
    restart*) return 0 ;;
    daemon-reload)
      if [[ -f "$test_root/etc/systemd/system/$service_unit.d/90-gshs-runner-trust.conf" ]]; then
        mock_exec_start_pre="$trusted_exec_start_pre"
        mock_exec_start_pre_ex="$trusted_exec_start_pre_ex"
      fi
      return 0
      ;;
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
  command chmod u+w -- "${operands[-1]}" 2>/dev/null || true
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

chown() {
  return 0
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
    %u)
      if [[ "$target" == "$runner_root/_work" || "$target" == "$runner_root/_diag" ]]; then
        printf '%s\n' 1000
      elif [[ "$target" == "$forced_non_root_path" ]]; then
        printf '%s\n' 1000
      else
        printf '%s\n' 0
      fi
      ;;
    %g)
      case "$target" in
        "$runner_root/.env"|"$runner_root/.runner"|"$runner_root/.credentials"|"$runner_root/.credentials_rsaparams"|"$runner_root/.service"|"$runner_root/.path"|"$runner_root/_work"|"$runner_root/_diag") printf '%s\n' 1000 ;;
        *) printf '%s\n' 0 ;;
      esac
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

runuser() {
  return 1
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
  if install_runner_trust_hook --runner-root "$runner_root" --runner-service "$service_unit" --role test \
    --runner-manifest "$trusted_runner_manifest" \
    --runner-manifest-sha256 "$trusted_runner_manifest_sha256" \
    --registration-manifest "$trusted_registration_manifest" \
    --registration-manifest-sha256 "$trusted_registration_manifest_sha256" \
    --bootstrap-manifest "$trusted_bootstrap_manifest" \
    --bootstrap-manifest-sha256 "$trusted_bootstrap_manifest_sha256" >/dev/null 2>&1; then
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

if install_runner_trust_hook \
  --runner-root "$runner_root" \
  --runner-service "$service_unit" \
  --role test \
  --runner-manifest "$trusted_runner_manifest" \
  --runner-manifest-sha256 "$trusted_runner_manifest_sha256" \
  --registration-manifest "$trusted_registration_manifest" \
  --registration-manifest-sha256 "$trusted_registration_manifest_sha256" \
  --bootstrap-manifest "$incomplete_bootstrap_manifest" \
  --bootstrap-manifest-sha256 "$incomplete_bootstrap_manifest_sha256" >/dev/null 2>&1; then
  echo "Installer accepted a bootstrap manifest that omitted a trust-chain script." >&2
  exit 1
fi
if grep -Fq "stop $service_unit" "$systemctl_log"; then
  echo "Installer stopped the runner before rejecting an incomplete bootstrap manifest." >&2
  exit 1
fi
: >"$systemctl_log"

if install_runner_trust_hook \
  --runner-root "$runner_root" \
  --runner-service "$service_unit" \
  --role test \
  --runner-manifest "$trusted_runner_manifest" \
  --runner-manifest-sha256 "$trusted_runner_manifest_sha256" \
  --registration-manifest "$trusted_registration_manifest" \
  --registration-manifest-sha256 "$trusted_registration_manifest_sha256" \
  --bootstrap-manifest "$trusted_bootstrap_manifest" \
  --bootstrap-manifest-sha256 "${trusted_bootstrap_manifest_sha256/0/1}" >/dev/null 2>&1; then
  echo "Installer accepted a bootstrap digest that was not verified out of band." >&2
  exit 1
fi
if grep -Fq "stop $service_unit" "$systemctl_log"; then
  echo "Installer stopped the runner before rejecting an untrusted bootstrap bundle." >&2
  exit 1
fi
: >"$systemctl_log"

install_runner_trust_hook \
  --runner-root "$runner_root" \
  --runner-service "$service_unit" \
  --role test \
  --runner-manifest "$trusted_runner_manifest" \
  --runner-manifest-sha256 "$trusted_runner_manifest_sha256" \
  --registration-manifest "$trusted_registration_manifest" \
  --registration-manifest-sha256 "$trusted_registration_manifest_sha256" \
  --bootstrap-manifest "$trusted_bootstrap_manifest" \
  --bootstrap-manifest-sha256 "$trusted_bootstrap_manifest_sha256"

hook_dir="$test_root/usr/local/lib/gshsapp-actions-runner"
hook_path="$hook_dir/runner-job-started-hook.sh"
policy_path="$hook_dir/runner-job-policy.sh"
runner_env="$runner_root/.env"
dropin="$test_root/etc/systemd/system/$service_unit.d/90-gshs-runner-trust.conf"
backup="$test_root/var/lib/gshsapp-runner-trust/$service_unit/runner.env.pre-trust"

[[ -f "$hook_path" && ! -L "$hook_path" ]]
[[ -f "$policy_path" && ! -L "$policy_path" ]]
[[ -f "$hook_dir/verify-runner-trust-prestart.sh" && ! -L "$hook_dir/verify-runner-trust-prestart.sh" ]]
[[ "$(stat -c '%a' "$hook_path")" == "755" ]]
[[ "$(stat -c '%a' "$policy_path")" == "755" ]]
[[ "$(stat -c '%a' "$runner_env")" == "640" ]]
[[ "$(stat -c '%a' "$dropin")" == "644" ]]
[[ "$(stat -c '%a' "$backup")" == "600" ]]
[[ "$(cat "$runner_env")" == "ACTIONS_RUNNER_HOOK_JOB_STARTED=/usr/local/lib/gshsapp-actions-runner/runner-job-started-hook.sh" ]]
grep -Fxq 'PATH=/attacker-controlled' "$backup"
grep -Fxq 'ReadOnlyPaths=/usr/local/lib/gshsapp-actions-runner' "$dropin"
grep -Fxq "ConditionPathExists=/etc/gshsapp-runner-trust/$service_unit.enabled" "$dropin"
grep -Fxq 'ReadOnlyPaths=/etc/gshsapp-runner-trust' "$dropin"
grep -Fxq "ReadOnlyPaths=$runner_root" "$dropin"
grep -Fxq "ReadWritePaths=$runner_root/_work" "$dropin"
grep -Fxq "ReadWritePaths=$runner_root/_diag" "$dropin"
grep -Fxq 'Environment=PATH=/usr/sbin:/usr/bin:/sbin:/bin' "$dropin"
grep -Fxq 'KillMode=control-group' "$dropin"
grep -Fxq "ExecStartPre=+/usr/local/lib/gshsapp-actions-runner/verify-runner-trust-prestart.sh --pre-start --runner-root $runner_root --runner-service $service_unit --role test" "$dropin"
grep -Fq 'exec "$POLICY_PATH" "test"' "$hook_path"
grep -Fq 'check_anchor_directory /etc' "$hook_path"
grep -Fq 'check_anchor_directory "/etc/gshsapp-runner-trust"' "$hook_path"
grep -Fxq "stop $service_unit" "$systemctl_log"
grep -Fxq 'daemon-reload' "$systemctl_log"
grep -Fxq "start $service_unit" "$systemctl_log"

: >"$systemctl_log"
FORCE_POST_START_VERIFY_FAILURE=true
mock_active_state="active"
set +e
install_runner_trust_hook \
  --runner-root "$runner_root" \
  --runner-service "$service_unit" \
  --role test \
  --runner-manifest "$trusted_runner_manifest" \
  --runner-manifest-sha256 "$trusted_runner_manifest_sha256" \
  --registration-manifest "$trusted_registration_manifest" \
  --registration-manifest-sha256 "$trusted_registration_manifest_sha256" \
  --bootstrap-manifest "$trusted_bootstrap_manifest" \
  --bootstrap-manifest-sha256 "$trusted_bootstrap_manifest_sha256" >/dev/null 2>&1
post_start_status="$?"
set -e
if [[ "$post_start_status" -eq 0 ]]; then
  echo "Installer accepted a failed post-start verification." >&2
  exit 1
fi
FORCE_POST_START_VERIFY_FAILURE=false
mock_active_state="active"
[[ "$(grep -Fxc "stop $service_unit" "$systemctl_log")" -ge 2 ]] || {
  echo "Installer did not quarantine the runner after post-start verification failed." >&2
  exit 1
}
[[ ! -e "$test_root/etc/gshsapp-runner-trust/$service_unit.enabled" ]] || {
  echo "Installer left the runner activation marker after verification failed." >&2
  exit 1
}

: >"$systemctl_log"
mock_active_state="active"
FORCE_STOP_FAILURE=true
FORCE_MASK_FAILURE=true
set +e
install_runner_trust_hook \
  --runner-root "$runner_root" \
  --runner-service "$service_unit" \
  --role test \
  --runner-manifest "$trusted_runner_manifest" \
  --runner-manifest-sha256 "$trusted_runner_manifest_sha256" \
  --registration-manifest "$trusted_registration_manifest" \
  --registration-manifest-sha256 "$trusted_registration_manifest_sha256" \
  --bootstrap-manifest "$trusted_bootstrap_manifest" \
  --bootstrap-manifest-sha256 "$trusted_bootstrap_manifest_sha256" >/dev/null 2>&1
failed_stop_status="$?"
set -e
FORCE_STOP_FAILURE=false
FORCE_MASK_FAILURE=false
if [[ "$failed_stop_status" -eq 0 || "$mock_active_state" == "active" ]]; then
  echo "Installer did not fail closed when normal stop and runtime mask failed." >&2
  exit 1
fi
grep -Fxq "kill --kill-who=all --signal=SIGKILL $service_unit" "$systemctl_log" || {
  echo "Installer did not force-stop the runner control group after a normal stop failure." >&2
  exit 1
}

mock_active_state="active"
printf '%s\n' 'verified runner activation marker' >"$test_root/etc/gshsapp-runner-trust/$service_unit.enabled"
chmod 0444 "$test_root/etc/gshsapp-runner-trust/$service_unit.enabled"

verify_runner_trust_hook \
  --runner-root "$runner_root" \
  --runner-service "$service_unit" \
  --role test

mock_active_state="inactive"
verify_runner_trust_hook \
  --pre-start \
  --runner-root "$runner_root" \
  --runner-service "$service_unit" \
  --role test
mock_active_state="active"

saved_trust_root_prefix="$TRUST_ROOT_PREFIX"
TRUST_ROOT_PREFIX=""
runner_trust_assert_trusted_ancestor_chain "$runner_root"
TRUST_ROOT_PREFIX="$saved_trust_root_prefix"

printf '%s\n' '#!/bin/bash' 'exec /tmp/attacker' >"$runner_root/runsvc.sh"
if verify_runner_trust_hook --runner-root "$runner_root" --runner-service "$service_unit" --role test >/dev/null 2>&1; then
  echo "Verifier accepted a modified runner executable." >&2
  exit 1
fi
printf '%s\n' '#!/bin/bash' 'exec ./bin/Runner.Listener run --startuptype service' >"$runner_root/runsvc.sh"

printf '%s\n' 'hidden executable' >"$runner_root/bin/.runner"
if verify_runner_trust_hook --runner-root "$runner_root" --runner-service "$service_unit" --role test >/dev/null 2>&1; then
  echo "Verifier ignored an extra application file named like root registration state." >&2
  exit 1
fi
rm "$runner_root/bin/.runner"

mock_exec_start="{ path=/tmp/attacker ; argv[]=/tmp/attacker ; ignore_errors=no ; }"
if verify_runner_trust_hook --runner-root "$runner_root" --runner-service "$service_unit" --role test >/dev/null 2>&1; then
  echo "Verifier accepted a service that executes outside the trusted runner root." >&2
  exit 1
fi
mock_exec_start="{ path=$runner_root/runsvc.sh ; argv[]=$runner_root/runsvc.sh ; ignore_errors=no ; start_time=[n/a] ; stop_time=[n/a] ; pid=0 ; code=(null) ; status=0/0 }"

mock_exec_start_ex="{ path=$runner_root/runsvc.sh ; argv[]=$runner_root/runsvc.sh ; flags=privileged ; start_time=[n/a] ; stop_time=[n/a] ; pid=0 ; code=(null) ; status=0/0 }"
if verify_runner_trust_hook --runner-root "$runner_root" --runner-service "$service_unit" --role test >/dev/null 2>&1; then
  echo "Verifier accepted a privileged runner ExecStart." >&2
  exit 1
fi
mock_exec_start_ex="{ path=$runner_root/runsvc.sh ; argv[]=$runner_root/runsvc.sh ; flags= ; start_time=[n/a] ; stop_time=[n/a] ; pid=0 ; code=(null) ; status=0/0 }"

mock_exec_start="$mock_exec_start { path=/tmp/attacker ; argv[]=/tmp/attacker ; ignore_errors=no ; }"
if verify_runner_trust_hook --runner-root "$runner_root" --runner-service "$service_unit" --role test >/dev/null 2>&1; then
  echo "Verifier accepted multiple service start commands." >&2
  exit 1
fi
mock_exec_start="{ path=$runner_root/runsvc.sh ; argv[]=$runner_root/runsvc.sh ; ignore_errors=no ; start_time=[n/a] ; stop_time=[n/a] ; pid=0 ; code=(null) ; status=0/0 }"

mock_exec_start_post="{ path=/tmp/attacker ; argv[]=/tmp/attacker ; ignore_errors=no ; }"
if verify_runner_trust_hook --runner-root "$runner_root" --runner-service "$service_unit" --role test >/dev/null 2>&1; then
  echo "Verifier accepted an injected service post-start command." >&2
  exit 1
fi
mock_exec_start_post=""

mock_exec_stop="{ path=/tmp/attacker ; argv[]=/tmp/attacker ; ignore_errors=no ; }"
if verify_runner_trust_hook --runner-root "$runner_root" --runner-service "$service_unit" --role test >/dev/null 2>&1; then
  echo "Verifier accepted an injected service stop command." >&2
  exit 1
fi
mock_exec_stop=""

mock_root_directory="/tmp/attacker-root"
if verify_runner_trust_hook --runner-root "$runner_root" --runner-service "$service_unit" --role test >/dev/null 2>&1; then
  echo "Verifier accepted a service root-directory remap." >&2
  exit 1
fi
mock_root_directory=""

mock_service_user="attacker"
if verify_runner_trust_hook --runner-root "$runner_root" --runner-service "$service_unit" --role test >/dev/null 2>&1; then
  echo "Verifier accepted a service running as an unexpected account." >&2
  exit 1
fi
mock_service_user="gshs-runner-test"

mock_runner_groups="gshs-runner-test runners docker"
if verify_runner_trust_hook --runner-root "$runner_root" --runner-service "$service_unit" --role test >/dev/null 2>&1; then
  echo "Verifier accepted a runner account with root-equivalent Docker access." >&2
  exit 1
fi
mock_runner_groups="gshs-runner-test runners"

mock_service_group="docker"
if verify_runner_trust_hook --runner-root "$runner_root" --runner-service "$service_unit" --role test >/dev/null 2>&1; then
  echo "Verifier accepted a root-equivalent effective service Group." >&2
  exit 1
fi
mock_service_group="runners"

chmod 0777 "$test_root/home"
if verify_runner_trust_hook --runner-root "$runner_root" --runner-service "$service_unit" --role test >/dev/null 2>&1; then
  echo "Verifier accepted a runner root beneath a writable ancestor." >&2
  exit 1
fi
chmod 0755 "$test_root/home"

forced_non_root_path="$runner_root/bin/Runner.Worker"
if verify_runner_trust_hook --runner-root "$runner_root" --runner-service "$service_unit" --role test >/dev/null 2>&1; then
  echo "Verifier accepted a runner application file owned by the service account." >&2
  exit 1
fi
forced_non_root_path=""

if [[ -L "$symlink_probe" ]]; then
  rmdir "$runner_root/_work"
  ln -s "$symlink_probe_target" "$runner_root/_work"
  if verify_runner_trust_hook --runner-root "$runner_root" --runner-service "$service_unit" --role test >/dev/null 2>&1; then
    echo "Verifier accepted a symlinked writable work directory." >&2
    exit 1
  fi
  rm "$runner_root/_work"
  mkdir "$runner_root/_work"
  chmod 0700 "$runner_root/_work"
fi

mock_read_write_paths="$runner_root"
if verify_runner_trust_hook --runner-root "$runner_root" --runner-service "$service_unit" --role test >/dev/null 2>&1; then
  echo "Verifier accepted an unbounded writable runner application directory." >&2
  exit 1
fi
mock_read_write_paths="$runner_root/_work $runner_root/_diag"

mock_kill_mode="process"
if verify_runner_trust_hook --runner-root "$runner_root" --runner-service "$service_unit" --role test >/dev/null 2>&1; then
  echo "Verifier accepted a service that leaves workflow child processes alive." >&2
  exit 1
fi
mock_kill_mode="control-group"

mock_environment="PATH=/usr/sbin:/usr/bin:/sbin:/bin LD_PRELOAD=/tmp/attacker.so"
if verify_runner_trust_hook --runner-root "$runner_root" --runner-service "$service_unit" --role test >/dev/null 2>&1; then
  echo "Verifier accepted an injected service environment." >&2
  exit 1
fi
mock_environment="PATH=/usr/sbin:/usr/bin:/sbin:/bin"

mock_environment_files="/tmp/attacker.env (ignore_errors=no)"
if verify_runner_trust_hook --runner-root "$runner_root" --runner-service "$service_unit" --role test >/dev/null 2>&1; then
  echo "Verifier accepted an injected service environment file." >&2
  exit 1
fi
mock_environment_files=""

printf '%s\n' '{"agentId":1,"disableUpdate":false,"workFolder":"_work"}' >"$runner_root/.runner"
if verify_runner_trust_hook --runner-root "$runner_root" --runner-service "$service_unit" --role test >/dev/null 2>&1; then
  echo "Verifier accepted a runner registered with automatic updates enabled." >&2
  exit 1
fi
printf '%s\n' "$trusted_runner_settings" >"$runner_root/.runner"

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
