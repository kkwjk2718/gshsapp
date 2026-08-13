#!/bin/bash
set -Eeuo pipefail

PATH=/usr/sbin:/usr/bin:/sbin:/bin
LC_ALL=C
export PATH LC_ALL
builtin unset BASH_ENV ENV CDPATH GLOBIGNORE TRUST_ROOT_PREFIX RUNNER_TRUST_NODE_BINARY LD_PRELOAD LD_LIBRARY_PATH PYTHONPATH PYTHONHOME NODE_OPTIONS TMPDIR TMP TEMP
IFS=$' \t\n'
while IFS= read -r inherited_function; do
  builtin unset -f "$inherited_function" 2>/dev/null || true
done < <(builtin compgen -A function)

INSTALL_RUNNER_TRUST_SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
RUNNER_TRUST_VERIFIED_BOOTSTRAP_DIR=""
RUNNER_TRUST_QUARANTINE_REQUIRED="false"
RUNNER_TRUST_QUARANTINE_SERVICE=""
RUNNER_TRUST_QUARANTINE_MARKER=""

runner_trust_bootstrap_fail() {
  printf '%s\n' "runner trust bootstrap failed: $1" >&2
  return 1
}

# This function deliberately has no dependency on a sibling script. The
# verifier and policy are copied into a private directory and authenticated
# there before either is sourced or installed as root.
runner_trust_stage_authenticated_bootstrap() {
  local manifest=""
  local expected_manifest_sha256=""
  local argument
  local -a arguments=("$@")
  for ((argument = 0; argument < ${#arguments[@]}; argument += 1)); do
    case "${arguments[$argument]}" in
      --bootstrap-manifest)
        ((argument + 1 < ${#arguments[@]})) || { runner_trust_bootstrap_fail "bootstrap manifest argument is missing a value"; return 1; }
        manifest="${arguments[$((argument + 1))]}"
        argument=$((argument + 1))
        ;;
      --bootstrap-manifest-sha256)
        ((argument + 1 < ${#arguments[@]})) || { runner_trust_bootstrap_fail "bootstrap digest argument is missing a value"; return 1; }
        expected_manifest_sha256="${arguments[$((argument + 1))]}"
        argument=$((argument + 1))
        ;;
    esac
  done

  [[ "$expected_manifest_sha256" =~ ^[0-9a-f]{64}$ ]] || { runner_trust_bootstrap_fail "trusted bootstrap manifest digest is malformed"; return 1; }
  [[ -f "$manifest" && ! -L "$manifest" ]] || { runner_trust_bootstrap_fail "trusted bootstrap manifest is missing or unsafe"; return 1; }

  local staged_directory staged_manifest actual_manifest_sha256
  staged_directory="$(mktemp -d)" || { runner_trust_bootstrap_fail "temporary bootstrap directory could not be created"; return 1; }
  chmod 0700 -- "$staged_directory" || { rm -rf -- "$staged_directory"; runner_trust_bootstrap_fail "temporary bootstrap directory could not be protected"; return 1; }
  staged_manifest="$staged_directory/bootstrap.sha256"
  if ! install -m 0600 -- "$manifest" "$staged_manifest"; then
    rm -rf -- "$staged_directory"
    runner_trust_bootstrap_fail "trusted bootstrap manifest could not be staged"
    return 1
  fi
  actual_manifest_sha256="$(sha256sum "$staged_manifest")" || { rm -rf -- "$staged_directory"; runner_trust_bootstrap_fail "staged bootstrap manifest could not be hashed"; return 1; }
  actual_manifest_sha256="${actual_manifest_sha256%% *}"
  if [[ "$actual_manifest_sha256" != "$expected_manifest_sha256" ]]; then
    rm -rf -- "$staged_directory"
    runner_trust_bootstrap_fail "trusted bootstrap manifest digest does not match"
    return 1
  fi

  local line digest filename source_file staged_file
  local count=0
  local -A expected_files=(
    [install-runner-trust-hook.sh]=0
    [verify-runner-trust-hook.sh]=0
    [runner-job-policy.sh]=0
  )
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^([0-9a-f]{64})\ \ (install-runner-trust-hook\.sh|verify-runner-trust-hook\.sh|runner-job-policy\.sh)$ ]] || {
      rm -rf -- "$staged_directory"
      runner_trust_bootstrap_fail "bootstrap manifest is not canonical or contains an unexpected entry"
      return 1
    }
    digest="${BASH_REMATCH[1]}"
    filename="${BASH_REMATCH[2]}"
    [[ "${expected_files[$filename]}" == "0" ]] || {
      rm -rf -- "$staged_directory"
      runner_trust_bootstrap_fail "bootstrap manifest contains a duplicate entry"
      return 1
    }
    expected_files[$filename]=1
    count=$((count + 1))
    source_file="$INSTALL_RUNNER_TRUST_SCRIPT_DIR/$filename"
    staged_file="$staged_directory/$filename"
    [[ -f "$source_file" && ! -L "$source_file" ]] || {
      rm -rf -- "$staged_directory"
      runner_trust_bootstrap_fail "bootstrap source is missing or unsafe: $filename"
      return 1
    }
    if ! install -m 0700 -- "$source_file" "$staged_file"; then
      rm -rf -- "$staged_directory"
      runner_trust_bootstrap_fail "bootstrap source could not be staged: $filename"
      return 1
    fi
    local staged_sha256
    staged_sha256="$(sha256sum "$staged_file")" || { rm -rf -- "$staged_directory"; runner_trust_bootstrap_fail "staged bootstrap source could not be hashed: $filename"; return 1; }
    staged_sha256="${staged_sha256%% *}"
    if [[ "$staged_sha256" != "$digest" ]]; then
      rm -rf -- "$staged_directory"
      runner_trust_bootstrap_fail "bootstrap source digest does not match: $filename"
      return 1
    fi
  done <"$staged_manifest"
  if [[ "$count" -ne 3 ]]; then
    rm -rf -- "$staged_directory"
    runner_trust_bootstrap_fail "bootstrap manifest must contain exactly three trust-chain scripts"
    return 1
  fi
  RUNNER_TRUST_VERIFIED_BOOTSTRAP_DIR="$staged_directory"
  export RUNNER_TRUST_VERIFIED_BOOTSTRAP_DIR
}

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

_install_runner_trust_hook() {
  local runner_root=""
  local service_unit=""
  local role=""
  local runner_manifest_source=""
  local runner_manifest_sha256=""
  local bootstrap_manifest=""
  local bootstrap_manifest_sha256=""
  local registration_manifest_source=""
  local registration_manifest_sha256=""
  while [[ "$#" -gt 0 ]]; do
    case "$1" in
      --runner-root) runner_root="${2:-}"; shift 2 ;;
      --runner-service) service_unit="${2:-}"; shift 2 ;;
      --role) role="${2:-}"; shift 2 ;;
      --runner-manifest) runner_manifest_source="${2:-}"; shift 2 ;;
      --runner-manifest-sha256) runner_manifest_sha256="${2:-}"; shift 2 ;;
      --bootstrap-manifest) bootstrap_manifest="${2:-}"; shift 2 ;;
      --bootstrap-manifest-sha256) bootstrap_manifest_sha256="${2:-}"; shift 2 ;;
      --registration-manifest) registration_manifest_source="${2:-}"; shift 2 ;;
      --registration-manifest-sha256) registration_manifest_sha256="${2:-}"; shift 2 ;;
      *) runner_trust_fail "unknown argument"; return 1 ;;
    esac
  done

  [[ "$(id -u)" == "0" ]] || { runner_trust_fail "installation must run as root"; return 1; }
  runner_trust_validate_inputs "$runner_root" "$service_unit" "$role" || return 1
  systemctl unmask --runtime "$service_unit" || { runner_trust_fail "a previous runtime quarantine mask could not be cleared for this explicit reinstall"; return 1; }
  runner_trust_assert_trusted_ancestor_chain "$runner_root" || return 1
  local verified_bootstrap_directory verified_bootstrap_manifest
  verified_bootstrap_directory="${RUNNER_TRUST_VERIFIED_BOOTSTRAP_DIR:-$INSTALL_RUNNER_TRUST_SCRIPT_DIR}"
  if [[ -n "${RUNNER_TRUST_VERIFIED_BOOTSTRAP_DIR:-}" ]]; then
    verified_bootstrap_manifest="$verified_bootstrap_directory/bootstrap.sha256"
  else
    verified_bootstrap_manifest="$bootstrap_manifest"
  fi
  [[ "$bootstrap_manifest_sha256" =~ ^[0-9a-f]{64}$ ]] || { runner_trust_fail "trusted bootstrap manifest digest is malformed"; return 1; }
  [[ -f "$verified_bootstrap_manifest" && ! -L "$verified_bootstrap_manifest" ]] || { runner_trust_fail "trusted bootstrap manifest is missing"; return 1; }
  [[ "$(sha256sum "$verified_bootstrap_manifest" | awk '{print $1}')" == "$bootstrap_manifest_sha256" ]] || { runner_trust_fail "trusted bootstrap manifest digest does not match"; return 1; }
  runner_trust_verify_bootstrap_manifest "$verified_bootstrap_manifest" "$verified_bootstrap_directory" || return 1
  [[ "$runner_manifest_sha256" =~ ^[0-9a-f]{64}$ ]] || { runner_trust_fail "trusted runner manifest digest is malformed"; return 1; }
  [[ -f "$runner_manifest_source" && ! -L "$runner_manifest_source" ]] || { runner_trust_fail "trusted runner manifest is missing"; return 1; }
  [[ "$registration_manifest_sha256" =~ ^[0-9a-f]{64}$ ]] || { runner_trust_fail "trusted registration manifest digest is malformed"; return 1; }
  [[ -f "$registration_manifest_source" && ! -L "$registration_manifest_source" ]] || { runner_trust_fail "trusted registration manifest is missing"; return 1; }
  local staging_directory staged_hook staged_env staged_dropin staged_runner_manifest staged_registration_manifest
  staging_directory="$(mktemp -d)" || { runner_trust_fail "temporary staging directory could not be created"; return 1; }
  chmod 0700 -- "$staging_directory" || { runner_trust_fail "temporary staging directory could not be protected"; return 1; }
  staged_runner_manifest="$staging_directory/runner.sha256"
  staged_registration_manifest="$staging_directory/registration.sha256"
  # shellcheck disable=SC2064 # Bind this invocation's local path before RETURN.
  trap "rm -rf -- '$staging_directory'" RETURN
  install -m 0600 -- "$runner_manifest_source" "$staged_runner_manifest" || { runner_trust_fail "trusted runner manifest could not be staged"; return 1; }
  install -m 0600 -- "$registration_manifest_source" "$staged_registration_manifest" || { runner_trust_fail "trusted registration manifest could not be staged"; return 1; }
  [[ "$(sha256sum "$staged_runner_manifest" | awk '{print $1}')" == "$runner_manifest_sha256" ]] || { runner_trust_fail "trusted runner manifest digest does not match"; return 1; }
  [[ "$(sha256sum "$staged_registration_manifest" | awk '{print $1}')" == "$registration_manifest_sha256" ]] || { runner_trust_fail "trusted registration manifest digest does not match"; return 1; }
  runner_manifest_source="$staged_runner_manifest"
  registration_manifest_source="$staged_registration_manifest"

  local load_state runner_user expected_runner_user runner_group runner_uid runner_gid effective_fragment_path effective_working_directory service_fragment
  load_state="$(systemctl show "$service_unit" --property=LoadState --value)"
  [[ "$load_state" == "loaded" ]] || { runner_trust_fail "runner service is not loaded"; return 1; }
  runner_user="$(systemctl show "$service_unit" --property=User --value)"
  [[ -n "$runner_user" && "$runner_user" != "root" ]] || { runner_trust_fail "runner service must use a dedicated non-root user"; return 1; }
  expected_runner_user="$(runner_trust_expected_runner_user "$role")" || return 1
  [[ "$runner_user" == "$expected_runner_user" ]] || { runner_trust_fail "runner service user does not match the dedicated role account"; return 1; }
  runner_trust_assert_nonprivileged_account "$runner_user" "$service_unit" || return 1
  runner_group="$(id -gn "$runner_user")"
  runner_uid="$(id -u "$runner_user")"
  runner_gid="$(id -g "$runner_user")"
  [[ -n "$runner_group" && "$runner_uid" =~ ^[0-9]+$ && "$runner_gid" =~ ^[0-9]+$ ]] || { runner_trust_fail "runner service identity could not be resolved"; return 1; }
  runner_trust_assert_real_directory "$runner_root/_work" || return 1
  runner_trust_assert_real_directory "$runner_root/_diag" || return 1
  effective_fragment_path="$(systemctl show "$service_unit" --property=FragmentPath --value)"
  [[ "$effective_fragment_path" == "/etc/systemd/system/$service_unit" ]] || { runner_trust_fail "runner service fragment path is not trusted"; return 1; }
  runner_trust_assert_service_command_chain "$service_unit" "$runner_root" "$role" true || return 1
  runner_trust_assert_no_namespace_remap "$service_unit" || return 1
  effective_working_directory="$(systemctl show "$service_unit" --property=WorkingDirectory --value)"
  [[ "$effective_working_directory" == "$runner_root" ]] || { runner_trust_fail "runner service working directory is not trusted"; return 1; }
  service_fragment="$(runner_trust_fs_path "$effective_fragment_path")"
  runner_trust_assert_trusted_ancestor_chain "$(dirname -- "$service_fragment")" || return 1
  runner_trust_assert_node "$service_fragment" file 0 0 644 || return 1

  local source_policy
  source_policy="$verified_bootstrap_directory/runner-job-policy.sh"
  [[ -f "$source_policy" && ! -L "$source_policy" ]] || { runner_trust_fail "trusted policy source is missing"; return 1; }

  staged_hook="$staging_directory/runner-job-started-hook.sh"
  staged_env="$staging_directory/runner.env"
  staged_dropin="$staging_directory/90-gshs-runner-trust.conf"
  runner_trust_render_hook "$role" >"$staged_hook" || { runner_trust_fail "trusted job hook could not be staged"; return 1; }
  printf '%s\n' "ACTIONS_RUNNER_HOOK_JOB_STARTED=$RUNNER_TRUST_HOOK_PATH" >"$staged_env" || { runner_trust_fail "trusted runner environment could not be staged"; return 1; }
  runner_trust_render_dropin "$runner_root" "$service_unit" "$role" >"$staged_dropin" || { runner_trust_fail "trusted systemd drop-in could not be staged"; return 1; }
  grep -Fq "ExecStartPre=+$RUNNER_TRUST_HOOK_DIR/verify-runner-trust-prestart.sh" "$staged_dropin" || {
    runner_trust_fail "trusted systemd drop-in is missing the fail-closed pre-start verifier"
    return 1
  }

  local hook_dir hook_path policy_path prestart_verifier_path runner_env dropin_dir dropin_path backup_dir backup_path state_dir runner_manifest registration_manifest enabled_marker
  hook_dir="$(runner_trust_fs_path "$RUNNER_TRUST_HOOK_DIR")"
  hook_path="$(runner_trust_fs_path "$RUNNER_TRUST_HOOK_PATH")"
  policy_path="$(runner_trust_fs_path "$RUNNER_TRUST_POLICY_PATH")"
  prestart_verifier_path="$(runner_trust_fs_path "$RUNNER_TRUST_HOOK_DIR/verify-runner-trust-prestart.sh")"
  runner_env="$runner_root/.env"
  dropin_dir="$(runner_trust_fs_path "/etc/systemd/system/$service_unit.d")"
  dropin_path="$dropin_dir/90-gshs-runner-trust.conf"
  backup_dir="$(runner_trust_fs_path "/var/lib/gshsapp-runner-trust/$service_unit")"
  backup_path="$backup_dir/runner.env.pre-trust"
  state_dir="$(runner_trust_fs_path "$RUNNER_TRUST_STATE_DIR")"
  runner_manifest="$state_dir/$service_unit.runner.sha256"
  registration_manifest="$state_dir/$service_unit.registration.sha256"
  enabled_marker="$state_dir/$service_unit.enabled"

  [[ ! -L "$runner_env" ]] || { runner_trust_fail "runner .env must not be a symlink"; return 1; }
  [[ ! -e "$runner_env" || -f "$runner_env" ]] || { runner_trust_fail "runner .env must be a regular file"; return 1; }
  [[ ! -e "$backup_path" || ( -f "$backup_path" && ! -L "$backup_path" ) ]] || { runner_trust_fail "runner .env backup path is unsafe"; return 1; }
  runner_trust_assert_safe_ancestors "$hook_dir" || return 1
  if [[ -d "$(dirname -- "$hook_dir")" ]]; then
    runner_trust_assert_trusted_ancestor_chain "$(dirname -- "$hook_dir")" || return 1
  else
    runner_trust_assert_trusted_ancestor_chain "$(dirname -- "$(dirname -- "$hook_dir")")" || return 1
  fi
  runner_trust_assert_trusted_ancestor_chain "$(runner_trust_fs_path /usr/local/sbin)" || return 1
  runner_trust_assert_safe_ancestors "$dropin_dir" || return 1
  runner_trust_assert_safe_ancestors "$backup_dir" || return 1
  runner_trust_assert_safe_ancestors "$state_dir" || return 1
  runner_trust_assert_safe_install_target "$hook_dir" directory || return 1
  runner_trust_assert_safe_install_target "$hook_path" file || return 1
  runner_trust_assert_safe_install_target "$policy_path" file || return 1
  runner_trust_assert_safe_install_target "$prestart_verifier_path" file || return 1
  runner_trust_assert_safe_install_target "$dropin_dir" directory || return 1
  runner_trust_assert_safe_install_target "$dropin_path" file || return 1
  runner_trust_assert_safe_install_target "$backup_dir" directory || return 1
  runner_trust_assert_safe_install_target "$backup_path" file || return 1
  runner_trust_assert_safe_install_target "$state_dir" directory || return 1
  runner_trust_assert_safe_install_target "$runner_manifest" file || return 1
  runner_trust_assert_safe_install_target "$registration_manifest" file || return 1
  runner_trust_assert_safe_install_target "$enabled_marker" file || return 1

  local was_active="false"
  if systemctl is-active --quiet "$service_unit"; then
    was_active="true"
  fi
  # Load the persistent boot gate before stopping. It does not interrupt an
  # already-running unit, but a power loss from this point onward cannot bring
  # the service back without the root-owned activation marker.
  install -d -o root -g root -m 0755 -- "$dropin_dir" || { runner_trust_fail "systemd quarantine drop-in directory could not be installed"; return 1; }
  install -o root -g root -m 0644 -- "$staged_dropin" "$dropin_path" || { runner_trust_fail "persistent systemd quarantine drop-in could not be installed"; return 1; }
  systemctl daemon-reload || { runner_trust_fail "persistent runner quarantine could not be loaded"; return 1; }
  RUNNER_TRUST_QUARANTINE_REQUIRED="true"
  RUNNER_TRUST_QUARANTINE_SERVICE="$service_unit"
  RUNNER_TRUST_QUARANTINE_MARKER="$enabled_marker"
  runner_trust_quarantine_service "$service_unit" "$enabled_marker" || return 1

  [[ "$(sha256sum "$verified_bootstrap_manifest" | awk '{print $1}')" == "$bootstrap_manifest_sha256" ]] || { runner_trust_fail "trusted bootstrap manifest changed after the runner stopped"; return 1; }
  runner_trust_verify_bootstrap_manifest "$verified_bootstrap_manifest" "$verified_bootstrap_directory" || return 1
  [[ "$(sha256sum "$runner_manifest_source" | awk '{print $1}')" == "$runner_manifest_sha256" ]] || { runner_trust_fail "trusted runner manifest changed after the runner stopped"; return 1; }
  [[ "$(sha256sum "$registration_manifest_source" | awk '{print $1}')" == "$registration_manifest_sha256" ]] || { runner_trust_fail "trusted registration manifest changed after the runner stopped"; return 1; }
  runner_trust_verify_runner_manifest "$runner_manifest_source" "$runner_root" || return 1
  runner_trust_verify_registration_manifest "$registration_manifest_source" "$runner_root" || return 1
  runner_trust_assert_registration_policy "$runner_root/.runner" || return 1
  runner_trust_assert_real_directory "$runner_root/_work" || return 1
  runner_trust_assert_real_directory "$runner_root/_diag" || return 1

  install -d -o root -g root -m 0755 -- "$hook_dir" || { runner_trust_fail "trusted hook directory could not be installed"; return 1; }
  install -o root -g root -m 0755 -- "$source_policy" "$policy_path" || { runner_trust_fail "trusted policy could not be installed"; return 1; }
  install -o root -g root -m 0755 -- "$staged_hook" "$hook_path" || { runner_trust_fail "trusted hook could not be installed"; return 1; }
  install -o root -g root -m 0755 -- "$verified_bootstrap_directory/verify-runner-trust-hook.sh" "$prestart_verifier_path" || { runner_trust_fail "trusted pre-start verifier could not be installed"; return 1; }
  install -d -o root -g root -m 0700 -- "$backup_dir" || { runner_trust_fail "runner environment backup directory could not be installed"; return 1; }
  if [[ -f "$runner_env" && ! -e "$backup_path" ]]; then
    install -o root -g root -m 0600 -- "$runner_env" "$backup_path" || { runner_trust_fail "runner environment backup could not be installed"; return 1; }
  fi
  install -o root -g "$runner_group" -m 0640 -- "$staged_env" "$runner_env" || { runner_trust_fail "runner environment could not be installed"; return 1; }
  install -d -o root -g root -m 0755 -- "$dropin_dir" || { runner_trust_fail "systemd drop-in directory could not be installed"; return 1; }
  install -o root -g root -m 0644 -- "$staged_dropin" "$dropin_path" || { runner_trust_fail "systemd trust drop-in could not be installed"; return 1; }
  install -d -o root -g root -m 0755 -- "$state_dir" || { runner_trust_fail "runner trust state directory could not be installed"; return 1; }
  install -o root -g root -m 0444 -- "$runner_manifest_source" "$runner_manifest" || { runner_trust_fail "runner application manifest could not be installed"; return 1; }
  install -o root -g root -m 0444 -- "$registration_manifest_source" "$registration_manifest" || { runner_trust_fail "runner registration manifest could not be installed"; return 1; }
  printf '%s\n' '/usr/sbin:/usr/bin:/sbin:/bin' >"$staging_directory/runner.path" || { runner_trust_fail "fixed runner path could not be staged"; return 1; }
  install -o root -g "$runner_group" -m 0640 -- "$staging_directory/runner.path" "$runner_root/.path" || { runner_trust_fail "fixed runner path could not be installed"; return 1; }
  chown root:"$runner_group" -- \
    "$runner_root/.runner" \
    "$runner_root/.credentials" \
    "$runner_root/.credentials_rsaparams" \
    "$runner_root/.service" || { runner_trust_fail "runner registration ownership could not be fixed"; return 1; }
  chmod 0640 -- \
    "$runner_root/.runner" \
    "$runner_root/.credentials" \
    "$runner_root/.credentials_rsaparams" \
    "$runner_root/.service" || { runner_trust_fail "runner registration mode could not be fixed"; return 1; }
  chown "$runner_user:$runner_group" -- "$runner_root/_work" "$runner_root/_diag" || { runner_trust_fail "bounded runner directory ownership could not be fixed"; return 1; }
  chmod 0700 -- "$runner_root/_work" "$runner_root/_diag" || { runner_trust_fail "bounded runner directory mode could not be fixed"; return 1; }
  printf '%s\n' "verified runner activation marker" >"$staging_directory/enabled" || { runner_trust_fail "runner activation marker could not be staged"; return 1; }
  install -o root -g root -m 0444 -- "$staging_directory/enabled" "$enabled_marker" || { runner_trust_fail "runner activation marker could not be installed"; return 1; }

  if ! systemctl daemon-reload || ! systemctl start "$service_unit"; then
    runner_trust_fail "runner activation failed"
    return 1
  fi
  if ! verify_runner_trust_hook \
    --runner-root "$runner_root" \
    --runner-service "$service_unit" \
    --role "$role"; then
    runner_trust_fail "post-start verification failed"
    return 1
  fi

  RUNNER_TRUST_QUARANTINE_REQUIRED="false"

  rm -rf -- "$staging_directory"
  trap - RETURN
  if [[ "$was_active" != "true" ]]; then
    printf '%s\n' "runner trust hook installed; the previously inactive service was started"
  else
    printf '%s\n' "runner trust hook installed and the service was restarted safely"
  fi
}

runner_trust_quarantine_service() {
  local service_unit="$1"
  local enabled_marker="$2"
  local permanently_quarantine="${3:-false}"
  local quarantine_failed="false"
  if ! rm -f -- "$enabled_marker"; then
    runner_trust_fail "runner activation marker could not be removed"
    quarantine_failed="true"
  fi
  if [[ "$permanently_quarantine" == "true" ]] && ! systemctl mask --runtime --now "$service_unit"; then
    runner_trust_fail "runner service could not be runtime-masked"
    quarantine_failed="true"
  fi
  if ! systemctl daemon-reload; then
    runner_trust_fail "systemd reload failed while quarantining the runner"
    quarantine_failed="true"
  fi
  if ! systemctl stop "$service_unit"; then
    runner_trust_fail "normal runner stop failed; forcing the entire service control group to stop"
    quarantine_failed="true"
  fi
  if systemctl is-active --quiet "$service_unit"; then
    if ! systemctl kill --kill-who=all --signal=SIGKILL "$service_unit"; then
      runner_trust_fail "forced runner process-group termination failed"
      quarantine_failed="true"
    fi
    if ! systemctl stop "$service_unit"; then
      runner_trust_fail "runner stop still reports a failure after forced termination"
      quarantine_failed="true"
    fi
  fi
  if systemctl is-active --quiet "$service_unit"; then
    runner_trust_fail "CRITICAL: runner remains active after quarantine; isolate this host immediately"
    return 1
  fi
  if [[ "$quarantine_failed" == "true" ]]; then
    runner_trust_fail "runner is inactive, but one or more quarantine controls failed"
    return 1
  fi
}

install_runner_trust_hook() {
  local install_status
  RUNNER_TRUST_QUARANTINE_REQUIRED="false"
  RUNNER_TRUST_QUARANTINE_SERVICE=""
  RUNNER_TRUST_QUARANTINE_MARKER=""
  if _install_runner_trust_hook "$@"; then
    return 0
  else
    install_status="$?"
  fi
  if [[ "$RUNNER_TRUST_QUARANTINE_REQUIRED" == "true" ]]; then
    if ! runner_trust_quarantine_service "$RUNNER_TRUST_QUARANTINE_SERVICE" "$RUNNER_TRUST_QUARANTINE_MARKER" true; then
      runner_trust_fail "CRITICAL: automatic quarantine was incomplete; isolate this host immediately"
      return 1
    fi
  fi
  return "$install_status"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  runner_trust_stage_authenticated_bootstrap "$@"
  # shellcheck source=verify-runner-trust-hook.sh
  source "$RUNNER_TRUST_VERIFIED_BOOTSTRAP_DIR/verify-runner-trust-hook.sh"
  bootstrap_directory="$RUNNER_TRUST_VERIFIED_BOOTSTRAP_DIR"
  trap 'rm -rf -- "$bootstrap_directory"' EXIT
  install_runner_trust_hook "$@"
fi
