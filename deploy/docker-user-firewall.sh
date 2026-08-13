#!/usr/bin/env bash
set -Eeuo pipefail

PATH=/usr/sbin:/usr/bin:/sbin:/bin
LC_ALL=C
export PATH LC_ALL
IFS=$' \t\n'
umask 077

readonly CONTROL_ROOT=/usr/local/lib/gshsapp-operations
readonly CONFIG_ROOT=/etc/gshsapp-operations
readonly DEPLOY_CONFIG=$CONFIG_ROOT/deploy.env
readonly HOST_ROLE_FILE=$CONFIG_ROOT/host-role
readonly LOCK_ROOT=/run/lock/gshsapp
readonly LOCK_FILE=$LOCK_ROOT/lifecycle.lock
readonly BOOT_LIFECYCLE_LOCK_WAIT_SECONDS=60
readonly IPTABLES_BIN=/usr/sbin/iptables
readonly DOCKER_BIN=/usr/bin/docker
readonly IP_BIN=/usr/sbin/ip
readonly DOCKER_USER_CHAIN=DOCKER-USER
readonly POLICY_CHAIN=GSHSAPP-INGRESS
readonly HOST_POLICY_CHAIN=GSHSAPP-HOST
readonly WEB_NETWORK=gshsapp-web
readonly WEB_BRIDGE=gshsapp0
readonly WEB_CONTAINER=gshsapp-web
readonly NETWORK_LABEL=app.gshsapp.security-boundary
readonly NETWORK_LABEL_VALUE=web-v1
readonly -a PRIVATE_EGRESS_DESTINATIONS=(
  0.0.0.0/8
  10.0.0.0/8
  100.64.0.0/10
  127.0.0.0/8
  169.254.0.0/16
  172.16.0.0/12
  192.168.0.0/16
)

POLICY_VERIFIED=false
ALLOW_BUSY_SKIP=false
LOCK_ACQUIRED=false
FIREWALL_MODE=
declare -a HOST_CONNECTED_DESTINATIONS=()
declare -a CONFIGURED_INTERNAL_DESTINATIONS=()

fail() { printf '%s\n' "Docker ingress firewall refused: $1" >&2; exit 1; }

iptables_command() {
  "$IPTABLES_BIN" -w 10 -t filter "$@"
}

docker_command() {
  "$DOCKER_BIN" "$@"
}

ip_command() {
  "$IP_BIN" "$@"
}

validate_host_routes_command() {
  /usr/bin/python3 "$CONTROL_ROOT/validate-host-routes.py" "$@"
}

acquire_lifecycle_lock_descriptor() {
  local descriptor="$1"
  [[ "$descriptor" =~ ^[0-9]+$ ]] || return 2
  if [[ "$FIREWALL_MODE" == --boot-quarantine ]]; then
    flock -w "$BOOT_LIFECYCLE_LOCK_WAIT_SECONDS" "$descriptor"
  else
    flock -n "$descriptor"
  fi
}

assert_authenticated_control() {
  local script_dir resolved_self
  script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)" || return 1
  resolved_self="$(readlink -f -- "${BASH_SOURCE[0]}")" || return 1
  [[ "$(id -u)" == 0 ]] || fail "root is required"
  [[ "$script_dir" == "$CONTROL_ROOT" && "$resolved_self" == "$CONTROL_ROOT/docker-user-firewall.sh" ]] || {
    fail "run only the installed authenticated control"
  }
  [[ -f "$resolved_self" && ! -L "$resolved_self" && "$(stat -c '%u:%g:%a:%h' -- "$resolved_self")" == "0:0:400:1" ]] || {
    fail "installed firewall control is unsafe"
  }
  /bin/bash "$CONTROL_ROOT/install-root-operations.sh" --verify-installed || fail "installed control verification failed"
  local unit_verification=--verify-firewall-unit
  [[ "$FIREWALL_MODE" != --boot-quarantine ]] || unit_verification=--verify-quarantine-unit
  LIFECYCLE_LOCK_HELD=1 /bin/bash "$CONTROL_ROOT/install-deploy-service.sh" "$unit_verification" || {
    fail "installed firewall systemd controls are stale, overridden, or disabled"
  }
}

acquire_lifecycle_lock() {
  [[ -d "$LOCK_ROOT" && ! -L "$LOCK_ROOT" && "$(stat -c '%u:%g:%a' -- "$LOCK_ROOT")" == "0:0:700" ]] || {
    fail "shared lifecycle lock directory is unsafe"
  }
  if [[ -e "$LOCK_FILE" || -L "$LOCK_FILE" ]]; then
    [[ -f "$LOCK_FILE" && ! -L "$LOCK_FILE" && "$(stat -c '%u:%g:%a:%h' -- "$LOCK_FILE")" == "0:0:600:1" ]] || {
      fail "shared lifecycle lock file is unsafe"
    }
  fi
  if [[ "${LIFECYCLE_LOCK_HELD:-0}" == 1 ]]; then
    [[ "$(readlink -f -- /proc/self/fd/9 2>/dev/null || true)" == "$LOCK_FILE" ]] || {
      fail "inherited lifecycle lock descriptor is missing or unsafe"
    }
    flock -n 9 || fail "inherited lifecycle lock is not held"
    LOCK_ACQUIRED=true
  else
    [[ "${LIFECYCLE_LOCK_HELD:-0}" == 0 ]] || fail "lifecycle lock inheritance marker is invalid"
    exec 9>"$LOCK_FILE"
    chown root:root "$LOCK_FILE"
    chmod 0600 "$LOCK_FILE"
    [[ "$(stat -c '%u:%g:%a:%h' -- "$LOCK_FILE")" == "0:0:600:1" ]] || fail "lifecycle lock could not be secured"
    if ! acquire_lifecycle_lock_descriptor 9; then
      [[ "$ALLOW_BUSY_SKIP" == true ]] && return 75
      fail "another lifecycle operation is active"
    fi
    LOCK_ACQUIRED=true
  fi
}

load_policy() {
  local -a values=()
  readarray -t values < <(
    /usr/bin/python3 "$CONTROL_ROOT/validate-operations-config.py" deploy "$DEPLOY_CONFIG" \
      --host-role-file "$HOST_ROLE_FILE" --print-firewall-policy
  ) || fail "root deployment firewall policy is invalid"
  [[ "${#values[@]}" -ge 4 && "${#values[@]}" -le 35 ]] || fail "root deployment firewall policy output is malformed"
  HOST_BIND_IP="${values[0]}"
  HOST_PORT="${values[1]}"
  PROXY_SOURCE_CIDR="${values[2]}"
  CONFIGURED_INTERNAL_DESTINATIONS=("${values[@]:3}")
  [[ "$HOST_BIND_IP" != *$'\r'* && "$HOST_PORT" != *$'\r'* && "$PROXY_SOURCE_CIDR" != *$'\r'* ]] || {
    fail "root deployment firewall policy output is non-canonical"
  }
  export HOST_BIND_IP HOST_PORT PROXY_SOURCE_CIDR
}

assert_trusted_os_binary() {
  local path="$1" resolved mode
  [[ -x "$path" ]] || fail "required OS binary is unavailable: $path"
  resolved="$(readlink -f -- "$path")" || fail "required OS binary cannot be resolved: $path"
  [[ "$resolved" == /usr/* && -f "$resolved" && ! -L "$resolved" ]] || {
    fail "required OS binary resolves outside the trusted /usr tree: $path"
  }
  mode="$(stat -Lc '%u:%g:%a:%h' -- "$resolved")" || fail "required OS binary metadata is unreadable: $path"
  [[ "$mode" =~ ^0:0:[0-7][0145][0145]:1$ ]] || fail "required OS binary is writable or not root-owned: $path"
}

load_network_policy() {
  local create_missing="$1" network_json
  local -a values=()
  if ! network_json="$($DOCKER_BIN network inspect "$WEB_NETWORK" 2>/dev/null)"; then
    [[ "$create_missing" == true ]] || fail "the dedicated web bridge is missing"
    "$DOCKER_BIN" network create \
      --driver bridge \
      --label "$NETWORK_LABEL=$NETWORK_LABEL_VALUE" \
      --opt "com.docker.network.bridge.name=$WEB_BRIDGE" \
      "$WEB_NETWORK" >/dev/null || fail "the dedicated web bridge could not be created"
    network_json="$($DOCKER_BIN network inspect "$WEB_NETWORK")" || fail "the created web bridge cannot be inspected"
  fi
  readarray -t values < <(
    printf '%s' "$network_json" | /usr/bin/python3 "$CONTROL_ROOT/validate-docker-network.py" \
      "$WEB_NETWORK" "$WEB_BRIDGE" "$NETWORK_LABEL" "$NETWORK_LABEL_VALUE"
  ) || fail "the dedicated Docker web bridge is unsafe"
  [[ "${#values[@]}" == 3 ]] || fail "Docker network policy output is malformed"
  WEB_SUBNET="${values[0]}"
  WEB_GATEWAY="${values[1]}"
  WEB_NETWORK_ID="${values[2]}"
  [[ -d "/sys/class/net/$WEB_BRIDGE" ]] || fail "the reviewed Docker bridge interface is unavailable"
  export WEB_SUBNET WEB_GATEWAY WEB_NETWORK_ID
}

load_host_network_policy() {
  local routes_json validated_routes destination
  routes_json="$(ip_command -j -4 route show table main)" || fail "host connected routes cannot be inspected"
  # A readarray fed by process substitution reports only readarray's status,
  # silently accepting a validator that exited non-zero without output. Check
  # the authenticated validator command substitution itself before parsing.
  validated_routes="$(validate_host_routes_command "$HOST_BIND_IP" "$WEB_BRIDGE" <<<"$routes_json")" || {
    fail "host connected routes are unsafe"
  }
  [[ "$validated_routes" != *$'\r'* ]] || fail "host connected route output is non-canonical"
  HOST_CONNECTED_DESTINATIONS=()
  if [[ -n "$validated_routes" ]]; then
    readarray -t HOST_CONNECTED_DESTINATIONS <<<"$validated_routes"
    [[ "${#HOST_CONNECTED_DESTINATIONS[@]}" -le 4096 ]] || fail "host connected route output is unbounded"
    for destination in "${HOST_CONNECTED_DESTINATIONS[@]}"; do
      [[ -n "$destination" ]] || fail "host connected route output contains an empty destination"
    done
  fi
}

protected_egress_destinations() {
  local destination
  for destination in "${CONFIGURED_INTERNAL_DESTINATIONS[@]}"; do
    printf '%s\n' "$destination"
  done
  for destination in "${HOST_CONNECTED_DESTINATIONS[@]}"; do
    printf '%s\n' "$destination"
  done
  for destination in "${PRIVATE_EGRESS_DESTINATIONS[@]}"; do
    printf '%s\n' "$destination"
  done
}

expected_custom_rules() {
  local destination
  printf '%s\n' \
    "-N $POLICY_CHAIN" \
    "-A $POLICY_CHAIN -s $PROXY_SOURCE_CIDR -p tcp -m conntrack --ctorigdst $HOST_BIND_IP --ctorigdstport $HOST_PORT --ctdir ORIGINAL -j RETURN" \
    "-A $POLICY_CHAIN -p tcp -m conntrack --ctorigdst $HOST_BIND_IP --ctorigdstport $HOST_PORT --ctdir ORIGINAL -j DROP" \
    "-A $POLICY_CHAIN -m conntrack --ctstate ESTABLISHED,RELATED --ctdir REPLY -j RETURN"
  while IFS= read -r destination; do
    printf '%s\n' "-A $POLICY_CHAIN -i $WEB_BRIDGE -s $WEB_SUBNET -d $destination -j DROP"
  done < <(protected_egress_destinations)
  printf '%s\n' "-A $POLICY_CHAIN -j RETURN"
}

expected_host_rules() {
  printf '%s\n' \
    "-N $HOST_POLICY_CHAIN" \
    "-A $HOST_POLICY_CHAIN -i $WEB_BRIDGE -s $WEB_SUBNET -j DROP" \
    "-A $HOST_POLICY_CHAIN -j RETURN"
}

count_exact_line() {
  local expected="$1" line count=0
  while IFS= read -r line; do
    [[ "$line" == "$expected" ]] && count=$((count + 1))
  done
  printf '%s' "$count"
}

verify_effective_rules() {
  local actual expected docker_rules forward_rules input_rules first_rule jump_count hook_count all_rules line
  actual="$(iptables_command -S "$POLICY_CHAIN")" || fail "managed ingress chain is unavailable"
  expected="$(expected_custom_rules)"
  [[ "$actual" == "$expected" ]] || fail "managed forwarding chain differs from the exact reviewed ingress/egress policy"
  actual="$(iptables_command -S "$HOST_POLICY_CHAIN")" || fail "managed host-input chain is unavailable"
  expected="$(expected_host_rules)"
  [[ "$actual" == "$expected" ]] || fail "managed host-input chain differs from the exact reviewed container isolation policy"

  docker_rules="$(iptables_command -S "$DOCKER_USER_CHAIN")" || fail "Docker DOCKER-USER chain is unavailable"
  first_rule="$(printf '%s\n' "$docker_rules" | /usr/bin/sed -n '2p')"
  [[ "$first_rule" == "-A $DOCKER_USER_CHAIN -j $POLICY_CHAIN" ]] || {
    fail "managed ingress jump is not the first effective DOCKER-USER rule"
  }
  jump_count="$(printf '%s\n' "$docker_rules" | count_exact_line "-A $DOCKER_USER_CHAIN -j $POLICY_CHAIN")"
  [[ "$jump_count" == 1 ]] || fail "managed ingress jump is missing or duplicated"

  forward_rules="$(iptables_command -S FORWARD)" || fail "filter FORWARD chain is unavailable"
  first_rule="$(printf '%s\n' "$forward_rules" | /usr/bin/sed -n '2p')"
  [[ "$first_rule" == "-A FORWARD -j $DOCKER_USER_CHAIN" ]] || {
    fail "Docker DOCKER-USER hook is not the first effective FORWARD rule"
  }
  hook_count="$(printf '%s\n' "$forward_rules" | count_exact_line "-A FORWARD -j $DOCKER_USER_CHAIN")"
  [[ "$hook_count" == 1 ]] || fail "Docker DOCKER-USER hook is missing or duplicated"

  input_rules="$(iptables_command -S INPUT)" || fail "filter INPUT chain is unavailable"
  first_rule="$(printf '%s\n' "$input_rules" | /usr/bin/sed -n '2p')"
  [[ "$first_rule" == "-A INPUT -j $HOST_POLICY_CHAIN" ]] || {
    fail "managed web-container isolation hook is not the first effective INPUT rule"
  }
  hook_count="$(printf '%s\n' "$input_rules" | count_exact_line "-A INPUT -j $HOST_POLICY_CHAIN")"
  [[ "$hook_count" == 1 ]] || fail "managed web-container isolation hook is missing or duplicated"

  while IFS= read -r line; do
    [[ "$line" != *"--ctorigdst $HOST_BIND_IP"* || "$line" != *"--ctorigdstport $HOST_PORT"* ]] || {
      fail "DOCKER-USER contains an unreviewed duplicate original-destination rule"
    }
  done < <(printf '%s\n' "$docker_rules" | /usr/bin/tail -n +2)

  all_rules="$(iptables_command -S)" || fail "effective filter rules cannot be enumerated"
  while IFS= read -r line; do
    if [[ "$line" == *" -j $POLICY_CHAIN"* && "$line" != "-A $DOCKER_USER_CHAIN -j $POLICY_CHAIN" ]]; then
      fail "managed forwarding chain has an unreviewed external reference"
    fi
    if [[ "$line" == *" -j $HOST_POLICY_CHAIN"* && "$line" != "-A INPUT -j $HOST_POLICY_CHAIN" ]]; then
      fail "managed host-input chain has an unreviewed external reference"
    fi
  done < <(printf '%s\n' "$all_rules")
}

install_forward_quarantines() {
  local destination
  iptables_command -I FORWARD 1 -p tcp -m conntrack \
    --ctorigdst "$HOST_BIND_IP" --ctorigdstport "$HOST_PORT" --ctdir ORIGINAL -j DROP || return 1
  while IFS= read -r destination; do
    iptables_command -I FORWARD 1 -i "$WEB_BRIDGE" -s "$WEB_SUBNET" -d "$destination" -j DROP || return 1
  done < <(protected_egress_destinations)
  iptables_command -I INPUT 1 -i "$WEB_BRIDGE" -s "$WEB_SUBNET" -j DROP
}

install_boot_quarantines() {
  # These rules do not depend on Docker daemon or network inspection. The
  # docker.service hard-requires this oneshot, so even an `always` container
  # cannot expose the published tuple or reach host/LAN before exact policy.
  while iptables_command -C FORWARD -p tcp -m conntrack \
      --ctorigdst "$HOST_BIND_IP" --ctorigdstport "$HOST_PORT" --ctdir ORIGINAL -j DROP >/dev/null 2>&1; do
    iptables_command -D FORWARD -p tcp -m conntrack \
      --ctorigdst "$HOST_BIND_IP" --ctorigdstport "$HOST_PORT" --ctdir ORIGINAL -j DROP || return 1
  done
  while iptables_command -C FORWARD -i "$WEB_BRIDGE" -j DROP >/dev/null 2>&1; do
    iptables_command -D FORWARD -i "$WEB_BRIDGE" -j DROP || return 1
  done
  while iptables_command -C INPUT -i "$WEB_BRIDGE" -j DROP >/dev/null 2>&1; do
    iptables_command -D INPUT -i "$WEB_BRIDGE" -j DROP || return 1
  done
  iptables_command -I FORWARD 1 -p tcp -m conntrack \
    --ctorigdst "$HOST_BIND_IP" --ctorigdstport "$HOST_PORT" --ctdir ORIGINAL -j DROP || return 1
  iptables_command -I FORWARD 1 -i "$WEB_BRIDGE" -j DROP || return 1
  iptables_command -I INPUT 1 -i "$WEB_BRIDGE" -j DROP
}

remove_forward_quarantines() {
  local destination
  while iptables_command -C FORWARD -p tcp -m conntrack \
      --ctorigdst "$HOST_BIND_IP" --ctorigdstport "$HOST_PORT" --ctdir ORIGINAL -j DROP >/dev/null 2>&1; do
    iptables_command -D FORWARD -p tcp -m conntrack \
      --ctorigdst "$HOST_BIND_IP" --ctorigdstport "$HOST_PORT" --ctdir ORIGINAL -j DROP || return 1
  done
  while IFS= read -r destination; do
    while iptables_command -C FORWARD -i "$WEB_BRIDGE" -s "$WEB_SUBNET" -d "$destination" -j DROP >/dev/null 2>&1; do
      iptables_command -D FORWARD -i "$WEB_BRIDGE" -s "$WEB_SUBNET" -d "$destination" -j DROP || return 1
    done
  done < <(protected_egress_destinations)
  while iptables_command -C INPUT -i "$WEB_BRIDGE" -s "$WEB_SUBNET" -j DROP >/dev/null 2>&1; do
    iptables_command -D INPUT -i "$WEB_BRIDGE" -s "$WEB_SUBNET" -j DROP || return 1
  done
  while iptables_command -C FORWARD -i "$WEB_BRIDGE" -j DROP >/dev/null 2>&1; do
    iptables_command -D FORWARD -i "$WEB_BRIDGE" -j DROP || return 1
  done
  while iptables_command -C INPUT -i "$WEB_BRIDGE" -j DROP >/dev/null 2>&1; do
    iptables_command -D INPUT -i "$WEB_BRIDGE" -j DROP || return 1
  done
}

apply_effective_rules() {
  local destination managed_chain reference
  iptables_command -S FORWARD >/dev/null || fail "filter FORWARD chain is unavailable"
  iptables_command -S INPUT >/dev/null || fail "filter INPUT chain is unavailable"

  # Put all-state quarantines in built-in chains before inspecting or changing
  # Docker-owned chains. A killed repair therefore leaves inbound access and
  # web-container access to the host/LAN fail closed until the next repair.
  install_forward_quarantines || fail "temporary fail-closed ingress/egress quarantines could not be installed"

  for managed_chain in "$POLICY_CHAIN" "$HOST_POLICY_CHAIN"; do
    if ! iptables_command -S "$managed_chain" >/dev/null 2>&1; then
      iptables_command -N "$managed_chain" || fail "managed firewall chain could not be created: $managed_chain"
    fi
    while IFS= read -r reference; do
      if [[ "$reference" == *" -j $managed_chain"* ]]; then
        case "$reference" in
          "-A $DOCKER_USER_CHAIN -j $POLICY_CHAIN"|"-A INPUT -j $HOST_POLICY_CHAIN") ;;
          *) fail "managed firewall chain is referenced from an unreviewed location" ;;
        esac
      fi
    done < <(iptables_command -S)
    if [[ "$managed_chain" == "$POLICY_CHAIN" ]] && iptables_command -S "$DOCKER_USER_CHAIN" >/dev/null 2>&1; then
      while iptables_command -C "$DOCKER_USER_CHAIN" -j "$POLICY_CHAIN" >/dev/null 2>&1; do
        iptables_command -D "$DOCKER_USER_CHAIN" -j "$POLICY_CHAIN" || fail "duplicate managed ingress jump could not be removed"
      done
    fi
    if [[ "$managed_chain" == "$HOST_POLICY_CHAIN" ]]; then
      while iptables_command -C INPUT -j "$HOST_POLICY_CHAIN" >/dev/null 2>&1; do
        iptables_command -D INPUT -j "$HOST_POLICY_CHAIN" || fail "duplicate managed host-input jump could not be removed"
      done
    fi
    iptables_command -F "$managed_chain" || fail "managed firewall chain could not be replaced: $managed_chain"
  done

  if ! iptables_command -S "$DOCKER_USER_CHAIN" >/dev/null 2>&1; then
    iptables_command -N "$DOCKER_USER_CHAIN" || fail "Docker DOCKER-USER chain could not be restored"
  fi
  while iptables_command -C FORWARD -j "$DOCKER_USER_CHAIN" >/dev/null 2>&1; do
    iptables_command -D FORWARD -j "$DOCKER_USER_CHAIN" || fail "duplicate Docker DOCKER-USER hook could not be removed"
  done
  iptables_command -I FORWARD 1 -j "$DOCKER_USER_CHAIN" || fail "Docker DOCKER-USER hook could not be restored"

  iptables_command -A "$POLICY_CHAIN" -s "$PROXY_SOURCE_CIDR" -p tcp -m conntrack \
    --ctorigdst "$HOST_BIND_IP" --ctorigdstport "$HOST_PORT" --ctdir ORIGINAL -j RETURN
  iptables_command -A "$POLICY_CHAIN" -p tcp -m conntrack \
    --ctorigdst "$HOST_BIND_IP" --ctorigdstport "$HOST_PORT" --ctdir ORIGINAL -j DROP
  iptables_command -A "$POLICY_CHAIN" -m conntrack --ctstate ESTABLISHED,RELATED --ctdir REPLY -j RETURN
  while IFS= read -r destination; do
    iptables_command -A "$POLICY_CHAIN" -i "$WEB_BRIDGE" -s "$WEB_SUBNET" -d "$destination" -j DROP
  done < <(protected_egress_destinations)
  iptables_command -A "$POLICY_CHAIN" -j RETURN
  iptables_command -I "$DOCKER_USER_CHAIN" 1 -j "$POLICY_CHAIN"
  iptables_command -A "$HOST_POLICY_CHAIN" -i "$WEB_BRIDGE" -s "$WEB_SUBNET" -j DROP
  iptables_command -A "$HOST_POLICY_CHAIN" -j RETURN
  iptables_command -I INPUT 1 -j "$HOST_POLICY_CHAIN"

  # Remove every exact quarantine only after both exact hooks are in place.
  remove_forward_quarantines || fail "temporary fail-closed ingress/egress quarantines could not be removed"
  verify_effective_rules
}

quarantine_web() {
  local labels
  if ! labels="$(docker_command inspect --format '{{.Name}}|{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.service"}}|{{index .Config.Labels "app.gshsapp.security-boundary"}}|{{.State.Running}}' "$WEB_CONTAINER")"; then
    return 0
  fi
  [[ "$labels" == "/$WEB_CONTAINER|gshsapp|web|$NETWORK_LABEL_VALUE|true" ]] || {
    [[ "$labels" == "/$WEB_CONTAINER|gshsapp|web|$NETWORK_LABEL_VALUE|false" ]] && return 0
    return 1
  }
  docker_command stop --time 0 "$WEB_CONTAINER" >/dev/null
}

busy_verify_or_quarantine() {
  # The installed exact root config and authenticated helper validators are
  # immutable while another lifecycle holder owns fd9. Read-only discovery is
  # therefore safe, but full chain rebuild must wait for that transaction.
  # Isolate fail(), which deliberately exits, so a verification mismatch can
  # reach the synchronous quarantine path instead of terminating early.
  if (load_policy; load_network_policy false; load_host_network_policy; verify_effective_rules) \
      >/dev/null 2>&1; then
    POLICY_VERIFIED=true
    return 0
  fi

  # Stop the exact labeled web workload first. Even if config or route
  # discovery became unreadable during the competing lifecycle transaction,
  # the public listener is no longer left exposed.
  quarantine_web || true
  # OS firewall mutations survive this subshell, while a deliberate fail()
  # stays contained. Install all-state built-in quarantines whenever the
  # strictly validated tuple/network state remains available.
  (load_policy; load_network_policy false; load_host_network_policy; install_forward_quarantines) \
    >/dev/null 2>&1 || true
  fail "firewall drift detected while another lifecycle operation holds the lock; web was quarantined"
}

policy_exit() {
  local status=$?
  trap - EXIT
  if [[ "$status" -ne 0 && "$POLICY_VERIFIED" != true ]]; then
    quarantine_web
  fi
  exit "$status"
}

main() {
  local mode="${1:-}"
  [[ "$#" == 1 && ( "$mode" == --apply || "$mode" == --verify || "$mode" == --enforce || "$mode" == --boot-quarantine ) ]] || {
    fail "usage: docker-user-firewall.sh --apply|--verify|--enforce|--boot-quarantine"
  }
  [[ "$(id -u)" == 0 ]] || fail "root is required"
  FIREWALL_MODE="$mode"
  assert_trusted_os_binary "$DOCKER_BIN"
  trap policy_exit EXIT
  if [[ "$mode" == --enforce && "${LIFECYCLE_LOCK_HELD:-0}" == 0 ]]; then
    ALLOW_BUSY_SKIP=true
  fi
  lock_status=0
  acquire_lifecycle_lock || lock_status=$?
  if [[ "$lock_status" == 75 && "$mode" == --enforce ]]; then
    busy_verify_or_quarantine
    exit 0
  fi
  [[ "$lock_status" == 0 ]] || exit "$lock_status"
  assert_authenticated_control
  assert_trusted_os_binary "$IPTABLES_BIN"
  assert_trusted_os_binary "$IP_BIN"
  load_policy
  if [[ "$mode" == --boot-quarantine ]]; then
    install_boot_quarantines || fail "pre-Docker fail-closed quarantine could not be installed"
    POLICY_VERIFIED=true
    exit 0
  fi
  if [[ "$mode" == --verify ]]; then
    load_network_policy false
  else
    load_network_policy true
  fi
  load_host_network_policy
  if [[ "$mode" == --apply ]]; then
    apply_effective_rules
  elif [[ "$mode" == --enforce ]]; then
    if ! (verify_effective_rules) >/dev/null 2>&1; then
      apply_effective_rules
    fi
  else
    verify_effective_rules
  fi
  POLICY_VERIFIED=true
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
