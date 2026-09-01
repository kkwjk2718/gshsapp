#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=docker-user-firewall.sh
source "$SCRIPT_DIR/docker-user-firewall.sh"

declare -F ip_command >/dev/null || {
  echo "Firewall control has no testable checked host-route command boundary." >&2
  exit 1
}
declare -F validate_host_routes_command >/dev/null || {
  echo "Firewall control has no checked host-route validator command boundary." >&2
  exit 1
}
declare -F acquire_lifecycle_lock_descriptor >/dev/null || {
  echo "Firewall control has no mode-aware lifecycle-lock acquisition boundary." >&2
  exit 1
}

HOST_BIND_IP=172.15.10.34
HOST_PORT=1234
PROXY_SOURCE_CIDR=10.30.0.9/32
WEB_SUBNET=172.30.0.0/16
WEB_GATEWAY=172.30.0.1
WEB_NETWORK_ID=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
HOST_CONNECTED_DESTINATIONS=(172.15.10.0/24)
CONFIGURED_INTERNAL_DESTINATIONS=(172.15.0.0/16 198.18.0.0/15)

if ! python3 -c 'raise SystemExit(0)' >/dev/null 2>&1; then
  python_fallback="${PYTHON_BIN:-$(command -v python || true)}"
  [[ -n "$python_fallback" ]] || {
    echo "Docker ingress firewall test requires Python 3." >&2
    exit 1
  }
  python3() {
    "$python_fallback" "$@"
  }
fi

expected="$(cat <<'RULES'
-N GSHSAPP-INGRESS
-A GSHSAPP-INGRESS -s 10.30.0.9/32 -p tcp -m conntrack --ctorigdst 172.15.10.34 --ctorigdstport 1234 --ctdir ORIGINAL -j RETURN
-A GSHSAPP-INGRESS -p tcp -m conntrack --ctorigdst 172.15.10.34 --ctorigdstport 1234 --ctdir ORIGINAL -j DROP
-A GSHSAPP-INGRESS -m conntrack --ctstate ESTABLISHED,RELATED --ctdir REPLY -j RETURN
-A GSHSAPP-INGRESS -i gshsapp0 -s 172.30.0.0/16 -d 172.15.0.0/16 -j DROP
-A GSHSAPP-INGRESS -i gshsapp0 -s 172.30.0.0/16 -d 198.18.0.0/15 -j DROP
-A GSHSAPP-INGRESS -i gshsapp0 -s 172.30.0.0/16 -d 172.15.10.0/24 -j DROP
-A GSHSAPP-INGRESS -i gshsapp0 -s 172.30.0.0/16 -d 0.0.0.0/8 -j DROP
-A GSHSAPP-INGRESS -i gshsapp0 -s 172.30.0.0/16 -d 10.0.0.0/8 -j DROP
-A GSHSAPP-INGRESS -i gshsapp0 -s 172.30.0.0/16 -d 100.64.0.0/10 -j DROP
-A GSHSAPP-INGRESS -i gshsapp0 -s 172.30.0.0/16 -d 127.0.0.0/8 -j DROP
-A GSHSAPP-INGRESS -i gshsapp0 -s 172.30.0.0/16 -d 169.254.0.0/16 -j DROP
-A GSHSAPP-INGRESS -i gshsapp0 -s 172.30.0.0/16 -d 172.16.0.0/12 -j DROP
-A GSHSAPP-INGRESS -i gshsapp0 -s 172.30.0.0/16 -d 192.168.0.0/16 -j DROP
-A GSHSAPP-INGRESS -j RETURN
RULES
)"
[[ "$(expected_custom_rules)" == "$expected" ]] || {
  echo "Docker ingress rules do not match the reviewed conntrack policy." >&2
  exit 1
}

allow_rule="$(expected_custom_rules | sed -n '2p')"
drop_rule="$(expected_custom_rules | sed -n '3p')"
[[ "$allow_rule" == *"-s $PROXY_SOURCE_CIDR"* && "$allow_rule" == *"--ctorigdst $HOST_BIND_IP --ctorigdstport $HOST_PORT --ctdir ORIGINAL -j RETURN"* ]]
[[ "$drop_rule" != *" -s "* && "$drop_rule" == *"--ctorigdst $HOST_BIND_IP --ctorigdstport $HOST_PORT --ctdir ORIGINAL -j DROP"* ]]
[[ "$drop_rule" != *"--ctstate NEW"* ]] || {
  echo "An established unauthorized original-direction session would bypass the boundary." >&2
  exit 1
}

# Evaluate the emitted first-match policy against a small conntrack model. This
# catches rule-order/state regressions, including sessions established before
# the firewall was applied.
RULES_UNDER_TEST="$(expected_custom_rules)" python3 - <<'PY'
import ipaddress
import os
import shlex

rules = [shlex.split(line) for line in os.environ["RULES_UNDER_TEST"].splitlines()[1:]]

def verdict(
    source,
    state,
    direction,
    destination="172.30.0.2",
    original_destination="172.15.10.34",
    port="1234",
    protocol="tcp",
    input_interface="eth0",
):
    packet = {
        "source": ipaddress.ip_address(source),
        "state": state,
        "direction": direction,
        "destination": ipaddress.ip_address(destination),
        "original_destination": original_destination,
        "port": port,
        "protocol": protocol,
        "input_interface": input_interface,
    }
    for tokens in rules:
        matches = True
        index = 2
        target = None
        while index < len(tokens):
            token = tokens[index]
            if token in {"-m"}:
                index += 2
            elif token == "-s":
                matches &= packet["source"] in ipaddress.ip_network(tokens[index + 1])
                index += 2
            elif token == "-p":
                matches &= packet["protocol"] == tokens[index + 1]
                index += 2
            elif token == "-i":
                matches &= packet["input_interface"] == tokens[index + 1]
                index += 2
            elif token == "-d":
                matches &= packet["destination"] in ipaddress.ip_network(tokens[index + 1])
                index += 2
            elif token == "--ctstate":
                matches &= packet["state"] in tokens[index + 1].split(",")
                index += 2
            elif token == "--ctdir":
                matches &= packet["direction"] == tokens[index + 1]
                index += 2
            elif token == "--ctorigdst":
                matches &= packet["original_destination"] == tokens[index + 1]
                index += 2
            elif token == "--ctorigdstport":
                matches &= packet["port"] == tokens[index + 1]
                index += 2
            elif token == "-j":
                target = tokens[index + 1]
                index += 2
            else:
                raise AssertionError(f"unexpected token {token!r}")
        if matches:
            return target
    raise AssertionError("policy had no terminal verdict")

assert verdict("10.30.0.9", "NEW", "ORIGINAL") == "RETURN"
assert verdict("10.30.0.9", "ESTABLISHED", "ORIGINAL") == "RETURN"
assert verdict("198.51.100.9", "NEW", "ORIGINAL") == "DROP"
assert verdict("198.51.100.9", "ESTABLISHED", "ORIGINAL") == "DROP"
assert verdict(
    "172.30.0.2", "ESTABLISHED", "REPLY", destination="10.30.0.9", input_interface="gshsapp0"
) == "RETURN"
for destination in (
    "172.30.0.1",
    "172.15.10.1",
    "172.15.10.34",
    "172.15.10.200",
    "172.15.20.9",
    "198.18.20.9",
    "10.9.8.7",
    "192.168.1.2",
    "169.254.169.254",
):
    assert verdict(
        "172.30.0.2",
        "NEW",
        "ORIGINAL",
        destination=destination,
        original_destination=destination,
        port="443",
        input_interface="gshsapp0",
    ) == "DROP"
assert verdict(
    "172.30.0.2",
    "NEW",
    "ORIGINAL",
    destination="8.8.8.8",
    original_destination="8.8.8.8",
    port="53",
    protocol="udp",
    input_interface="gshsapp0",
) == "RETURN"
assert verdict(
    "172.30.0.2",
    "NEW",
    "ORIGINAL",
    destination="1.1.1.1",
    original_destination="1.1.1.1",
    port="443",
    input_interface="gshsapp0",
) == "RETURN"
PY

fixture=valid
iptables_command() {
  if [[ "$*" == *"-S GSHSAPP-INGRESS"* ]]; then
    if [[ "$fixture" == valid ]]; then
      expected_custom_rules
    else
      expected_custom_rules | sed "s/-j DROP/-j RETURN/"
    fi
    return 0
  fi
  if [[ "$*" == *"-S GSHSAPP-HOST"* ]]; then
    expected_host_rules
    return 0
  fi
  if [[ "$*" == *"-S DOCKER-USER"* ]]; then
    printf '%s\n' '-N DOCKER-USER' '-A DOCKER-USER -j GSHSAPP-INGRESS' '-A DOCKER-USER -j RETURN'
    return 0
  fi
  if [[ "$*" == *"-S FORWARD"* ]]; then
    printf '%s\n' '-P FORWARD DROP' '-A FORWARD -j DOCKER-USER' '-A FORWARD -j DOCKER-FORWARD'
    return 0
  fi
  if [[ "$*" == *"-S INPUT"* ]]; then
    printf '%s\n' '-P INPUT DROP' '-A INPUT -j GSHSAPP-HOST' '-A INPUT -j ufw-before-input'
    return 0
  fi
  if [[ "$*" == "-S" ]]; then
    printf '%s\n' \
      '-P FORWARD DROP' \
      '-N DOCKER-USER' \
      '-N GSHSAPP-INGRESS' \
      '-N GSHSAPP-HOST' \
      '-A FORWARD -j DOCKER-USER' \
      '-A DOCKER-USER -j GSHSAPP-INGRESS' \
      '-A INPUT -j GSHSAPP-HOST'
    return 0
  fi
  return 1
}
verify_effective_rules
fixture=broad
if (verify_effective_rules) >/dev/null 2>&1; then
  echo "Firewall verification accepted a non-proxy RETURN instead of DROP." >&2
  exit 1
fi

# Stateful fake-iptables exercise: begin with both Docker-owned chains deleted
# (as after an iptables/UFW flush), prove the repair reconstructs exact hooks,
# and prove an interrupted repair installed all-state quarantines first.
declare -a STATE_FORWARD=('-A FORWARD -j DOCKER-FORWARD')
declare -a STATE_INPUT=('-A INPUT -j ufw-before-input')
declare -a STATE_DOCKER_USER=()
declare -a STATE_POLICY=()
declare -a STATE_HOST_POLICY=()
DOCKER_USER_EXISTS=false
POLICY_EXISTS=false
HOST_POLICY_EXISTS=false
FAIL_CHAIN_CREATE=false
COMMAND_LOG="$(mktemp)"
trap 'rm -f -- "$COMMAND_LOG"' EXIT

chain_state_name() {
  case "$1" in
    FORWARD) printf '%s' STATE_FORWARD ;;
    INPUT) printf '%s' STATE_INPUT ;;
    DOCKER-USER) printf '%s' STATE_DOCKER_USER ;;
    GSHSAPP-INGRESS) printf '%s' STATE_POLICY ;;
    GSHSAPP-HOST) printf '%s' STATE_HOST_POLICY ;;
    *) return 1 ;;
  esac
}

chain_exists() {
  case "$1" in
    FORWARD|INPUT) return 0 ;;
    DOCKER-USER) [[ "$DOCKER_USER_EXISTS" == true ]] ;;
    GSHSAPP-INGRESS) [[ "$POLICY_EXISTS" == true ]] ;;
    GSHSAPP-HOST) [[ "$HOST_POLICY_EXISTS" == true ]] ;;
    *) return 1 ;;
  esac
}

set_chain_exists() {
  case "$1" in
    DOCKER-USER) DOCKER_USER_EXISTS=true ;;
    GSHSAPP-INGRESS) POLICY_EXISTS=true ;;
    GSHSAPP-HOST) HOST_POLICY_EXISTS=true ;;
    *) return 1 ;;
  esac
}

print_chain() {
  local chain="$1" state_name
  chain_exists "$chain" || return 1
  state_name="$(chain_state_name "$chain")"
  local -n rules="$state_name"
  case "$chain" in
    FORWARD) printf '%s\n' '-P FORWARD DROP' ;;
    INPUT) printf '%s\n' '-P INPUT DROP' ;;
    *) printf '%s\n' "-N $chain" ;;
  esac
  ((${#rules[@]} == 0)) || printf '%s\n' "${rules[@]}"
}

iptables_command() {
  printf '%q ' "$@" >>"$COMMAND_LOG"
  printf '\n' >>"$COMMAND_LOG"
  local operation="${1:-}" chain="${2:-}" state_name rule index
  case "$operation" in
    -S)
      if [[ "$#" == 1 ]]; then
        print_chain FORWARD
        print_chain INPUT
        [[ "$DOCKER_USER_EXISTS" == false ]] || print_chain DOCKER-USER
        [[ "$POLICY_EXISTS" == false ]] || print_chain GSHSAPP-INGRESS
        [[ "$HOST_POLICY_EXISTS" == false ]] || print_chain GSHSAPP-HOST
      else
        print_chain "$chain"
      fi
      ;;
    -N)
      [[ "$FAIL_CHAIN_CREATE" == false ]] || return 1
      ! chain_exists "$chain" || return 1
      set_chain_exists "$chain"
      ;;
    -F)
      chain_exists "$chain" || return 1
      state_name="$(chain_state_name "$chain")"
      local -n flush_rules="$state_name"
      flush_rules=()
      ;;
    -A)
      chain_exists "$chain" || return 1
      shift 2
      state_name="$(chain_state_name "$chain")"
      local -n append_rules="$state_name"
      append_rules+=("-A $chain $*")
      ;;
    -I)
      chain_exists "$chain" || return 1
      index="$3"
      shift 3
      state_name="$(chain_state_name "$chain")"
      local -n insert_rules="$state_name"
      rule="-A $chain $*"
      insert_rules=("${insert_rules[@]:0:index-1}" "$rule" "${insert_rules[@]:index-1}")
      ;;
    -C|-D)
      chain_exists "$chain" || return 1
      shift 2
      state_name="$(chain_state_name "$chain")"
      local -n mutation_rules="$state_name"
      rule="-A $chain $*"
      for index in "${!mutation_rules[@]}"; do
        if [[ "${mutation_rules[$index]}" == "$rule" ]]; then
          if [[ "$operation" == -D ]]; then
            mutation_rules=("${mutation_rules[@]:0:index}" "${mutation_rules[@]:index+1}")
          fi
          return 0
        fi
      done
      return 1
      ;;
    *) return 1 ;;
  esac
}

# docker.service hard-requires this idempotent built-in quarantine. Therefore
# even restart=always workloads stay isolated before Docker recreates its own
# chains and the authenticated exact policy is published.
install_boot_quarantines
install_boot_quarantines
[[ "$(printf '%s\n' "${STATE_FORWARD[@]}" | grep -Fc -- '-A FORWARD -p tcp -m conntrack --ctorigdst 172.15.10.34 --ctorigdstport 1234 --ctdir ORIGINAL -j DROP')" == 1 ]]
[[ "$(printf '%s\n' "${STATE_FORWARD[@]}" | grep -Fc -- '-A FORWARD -i gshsapp0 -j DROP')" == 1 ]]
[[ "$(printf '%s\n' "${STATE_INPUT[@]}" | grep -Fc -- '-A INPUT -i gshsapp0 -j DROP')" == 1 ]]

FAIL_CHAIN_CREATE=true
if (apply_effective_rules) >/dev/null 2>&1; then
  echo "Interrupted firewall repair fixture unexpectedly completed." >&2
  exit 1
fi
python3 - "$COMMAND_LOG" <<'PY'
import pathlib
import sys

lines = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8").splitlines()
create = next(index for index, line in enumerate(lines) if line.startswith("-N "))
required = (
    "-I FORWARD 1 -p tcp -m conntrack --ctorigdst 172.15.10.34 --ctorigdstport 1234 --ctdir ORIGINAL -j DROP ",
    "-I FORWARD 1 -i gshsapp0 -s 172.30.0.0/16 -d 172.15.10.0/24 -j DROP ",
    "-I INPUT 1 -i gshsapp0 -s 172.30.0.0/16 -j DROP ",
)
for command in required:
    position = next(index for index, line in enumerate(lines) if line == command)
    assert position < create, (command, position, create)
PY

: >"$COMMAND_LOG"
FAIL_CHAIN_CREATE=false
apply_effective_rules
verify_effective_rules
[[ "$DOCKER_USER_EXISTS" == true && "$POLICY_EXISTS" == true && "$HOST_POLICY_EXISTS" == true ]]
if printf '%s\n' "${STATE_FORWARD[@]}" | grep -Fq -- '--ctorigdst'; then
  echo "Successful repair left a temporary FORWARD quarantine behind." >&2
  exit 1
fi
if printf '%s\n' "${STATE_INPUT[@]}" | grep -Fq -- '-i gshsapp0 -s 172.30.0.0/16 -j DROP'; then
  echo "Successful repair left a temporary INPUT quarantine behind." >&2
  exit 1
fi
if printf '%s\n' "${STATE_FORWARD[@]}" | grep -Fq -- '-i gshsapp0 -j DROP' ||
   printf '%s\n' "${STATE_INPUT[@]}" | grep -Fq -- '-i gshsapp0 -j DROP'; then
  echo "Successful exact policy publication left a pre-Docker boot quarantine behind." >&2
  exit 1
fi

# A host-route validator failure must propagate across stdout capture. In the
# periodic lock-busy path it must stop the exact labeled web workload and must
# not publish rules derived from an empty/unauthenticated route set.
: >"$COMMAND_LOG"
load_policy() { :; }
load_network_policy() { :; }
ip_command() {
  printf '%s\n' '[{"dst":"172.15.10.0/24","dev":"eth0","scope":"link","protocol":"kernel","prefsrc":"172.15.10.34"}]'
}
validate_host_routes_command() { return 1; }
route_failure_stop_log="$(mktemp)"
ROUTE_FAILURE_STOP_LOG="$route_failure_stop_log"
export ROUTE_FAILURE_STOP_LOG
docker_command() {
  if [[ "$1" == inspect ]]; then
    printf '%s\n' '/gshsapp-web|gshsapp|web|web-v1|true'
  elif [[ "$1" == stop && "$2" == --time && "$3" == 0 && "$4" == gshsapp-web ]]; then
    printf '%s\n' 'route-validator-failure-stop' >>"$ROUTE_FAILURE_STOP_LOG"
  else
    return 1
  fi
}
set +e
(trap - EXIT; busy_verify_or_quarantine) >/dev/null 2>&1
route_failure_status=$?
set -e
[[ "$route_failure_status" != 0 ]] || {
  echo "A failed host-route validator was accepted by the firewall enforcer." >&2
  exit 1
}
grep -Fxq 'route-validator-failure-stop' "$route_failure_stop_log" || {
  echo "Host-route validation failure did not synchronously stop the exact web container." >&2
  exit 1
}
if grep -Eq -- '(^| )-(I|A|N|F|D) ' "$COMMAND_LOG"; then
  echo "Host-route validation failure published an incomplete firewall policy." >&2
  exit 1
fi
rm -f -- "$route_failure_stop_log"

# A periodic enforcer that loses the lifecycle-lock race may not defer a
# missing hook. It must install built-in quarantines, stop only the exact
# labeled/running web container, and return non-zero while leaving full repair
# to the lock holder.
STATE_FORWARD=('-A FORWARD -j DOCKER-FORWARD')
STATE_INPUT=('-A INPUT -j ufw-before-input')
STATE_DOCKER_USER=()
STATE_POLICY=()
STATE_HOST_POLICY=()
DOCKER_USER_EXISTS=false
POLICY_EXISTS=false
HOST_POLICY_EXISTS=false
load_policy() { :; }
load_network_policy() { :; }
load_host_network_policy() { :; }
docker_stop_log="$(mktemp)"
BUSY_STOP_LOG="$docker_stop_log"
export BUSY_STOP_LOG
trap 'rm -f -- "$COMMAND_LOG" "$docker_stop_log"' EXIT
docker_command() {
  if [[ "$1" == inspect ]]; then
    printf '%s\n' '/gshsapp-web|gshsapp|web|web-v1|true'
  elif [[ "$1" == stop && "$2" == --time && "$3" == 0 && "$4" == gshsapp-web ]]; then
    printf '%s\n' 'gshsapp-web|gshsapp|web|web-v1|true|stop' >>"$BUSY_STOP_LOG"
  else
    return 1
  fi
}
set +e
(trap - EXIT; busy_verify_or_quarantine) >/dev/null 2>&1
busy_status=$?
set -e
if [[ "$busy_status" == 0 ]]; then
  echo "Busy periodic enforcement accepted missing firewall hooks." >&2
  exit 1
fi
grep -Fxq 'gshsapp-web|gshsapp|web|web-v1|true|stop' "$docker_stop_log" || {
  echo "Busy firewall drift did not synchronously stop the exact running/labeled web container." >&2
  exit 1
}
grep -Fq -- '-I FORWARD 1 -p tcp -m conntrack --ctorigdst 172.15.10.34 --ctorigdstport 1234 --ctdir ORIGINAL -j DROP ' "$COMMAND_LOG"
grep -Fq -- '-I FORWARD 1 -i gshsapp0 -s 172.30.0.0/16 -d 172.15.20.0/24 -j DROP ' "$COMMAND_LOG" || {
  # 172.15.20.0/24 is covered by the configured 172.15.0.0/16 quarantine.
  grep -Fq -- '-I FORWARD 1 -i gshsapp0 -s 172.30.0.0/16 -d 172.15.0.0/16 -j DROP ' "$COMMAND_LOG"
}
grep -Fq -- '-I INPUT 1 -i gshsapp0 -s 172.30.0.0/16 -j DROP ' "$COMMAND_LOG"

# A Docker boot transaction must wait for a lifecycle operation that is
# already finishing, while every interactive/runtime mode keeps the existing
# non-blocking lock contract. This exercises the real flock descriptor path.
if command -v flock >/dev/null 2>&1; then
  (
    set -Eeuo pipefail
    lock_test_root="$(mktemp -d)"
    holder=""
    cleanup_lock_test() {
      [[ -z "$holder" ]] || kill "$holder" >/dev/null 2>&1 || true
      [[ -z "$holder" ]] || wait "$holder" >/dev/null 2>&1 || true
      rm -rf -- "$lock_test_root"
    }
    trap cleanup_lock_test EXIT

    lock_path="$lock_test_root/lifecycle.lock"
    ready="$lock_test_root/ready"
    acquired="$lock_test_root/acquired"
    (
      exec 7>"$lock_path"
      flock -n 7
      : >"$ready"
      sleep 0.25
    ) &
    holder=$!
    for _ in {1..100}; do
      [[ -e "$ready" ]] && break
      sleep 0.01
    done
    [[ -e "$ready" ]] || {
      echo "Unable to establish the boot lifecycle-lock contention fixture." >&2
      exit 1
    }
    (
      exec 8>"$lock_path"
      FIREWALL_MODE=--boot-quarantine
      acquire_lifecycle_lock_descriptor 8
      : >"$acquired"
    )
    wait "$holder"
    holder=""
    [[ -e "$acquired" ]] || {
      echo "Boot quarantine did not acquire the lifecycle lock after its holder released it." >&2
      exit 1
    }

    rm -f -- "$ready" "$acquired"
    (
      exec 7>"$lock_path"
      flock -n 7
      : >"$ready"
      sleep 1
    ) &
    holder=$!
    for _ in {1..100}; do
      [[ -e "$ready" ]] && break
      sleep 0.01
    done
    [[ -e "$ready" ]] || {
      echo "Unable to establish the non-boot lifecycle-lock contention fixture." >&2
      exit 1
    }
    set +e
    (
      exec 8>"$lock_path"
      FIREWALL_MODE=--verify
      acquire_lifecycle_lock_descriptor 8
    )
    non_boot_status=$?
    set -e
    if [[ "$non_boot_status" == 0 ]] || ! kill -0 "$holder" 2>/dev/null; then
      echo "A non-boot firewall mode waited for or acquired an active lifecycle lock." >&2
      exit 1
    fi
    wait "$holder"
    holder=""
  )
fi

[[ "$BOOT_LIFECYCLE_LOCK_WAIT_SECONDS" =~ ^[1-9][0-9]*$ &&
   "$BOOT_LIFECYCLE_LOCK_WAIT_SECONDS" -lt 120 ]] || {
  echo "Boot lifecycle-lock wait is not bounded inside TimeoutStartSec=2min." >&2
  exit 1
}

unit="$SCRIPT_DIR/gshsapp-docker-user-firewall.service"
timer="$SCRIPT_DIR/gshsapp-docker-user-firewall.timer"
boot_quarantine="$SCRIPT_DIR/gshsapp-docker-boot-quarantine.service"
control_recovery="$SCRIPT_DIR/gshsapp-control-update-recovery.service"
recovery_unit="$SCRIPT_DIR/gshsapp-writer-recovery.service"
grep -Fxq 'Requires=docker.service gshsapp-docker-boot-quarantine.service gshsapp-docker-user-firewall.timer' "$unit"
grep -Fxq 'After=docker.service gshsapp-docker-boot-quarantine.service ufw.service gshsapp-docker-user-firewall.timer' "$unit"
grep -Fxq 'PartOf=docker.service' "$unit"
grep -Fxq 'Before=gshsapp-writer-recovery.service gshsapp-deploy.service' "$unit"
grep -Fxq 'ExecStart=/bin/bash /usr/local/lib/gshsapp-operations/docker-user-firewall.sh --enforce' "$unit"
if grep -Fxq 'RemainAfterExit=yes' "$unit"; then
  echo "Periodic enforcement cannot rerun a permanently active oneshot." >&2
  exit 1
fi
grep -Fxq 'WantedBy=docker.service' "$unit"
grep -Fxq 'CapabilityBoundingSet=CAP_NET_ADMIN CAP_NET_RAW' "$unit"
grep -Fxq 'RestrictAddressFamilies=AF_UNIX AF_INET AF_NETLINK' "$unit"
grep -Fxq 'OnUnitInactiveSec=15s' "$timer"
grep -Fxq 'AccuracySec=1s' "$timer"
grep -Fxq 'WantedBy=docker.service' "$timer"
grep -Fxq 'Before=docker.service' "$boot_quarantine"
grep -Fxq 'BindsTo=docker.service' "$boot_quarantine"
grep -Fxq 'PartOf=docker.service' "$boot_quarantine"
grep -Fxq 'RuntimeDirectory=lock/gshsapp' "$boot_quarantine"
grep -Fxq 'RuntimeDirectoryMode=0700' "$boot_quarantine"
grep -Fxq 'RuntimeDirectoryPreserve=yes' "$boot_quarantine"
grep -Fxq 'Requires=gshsapp-control-update-recovery.service' "$boot_quarantine"
grep -Fxq 'After=gshsapp-control-update-recovery.service' "$boot_quarantine"
grep -Fxq 'ExecStart=/bin/bash /usr/local/lib/gshsapp-operations/docker-user-firewall.sh --boot-quarantine' "$boot_quarantine"
grep -Fxq 'RequiredBy=docker.service' "$boot_quarantine"
if grep -Fq -- '--recover-update' "$boot_quarantine"; then
  echo "Control exchange still runs inside the quarantine control-root mount namespace." >&2
  exit 1
fi
grep -Fxq 'Before=gshsapp-docker-boot-quarantine.service docker.service' "$control_recovery"
grep -Fxq 'ExecStart=/bin/bash /usr/local/lib/gshsapp-operations/install-root-operations.sh --recover-update' "$control_recovery"
grep -Fxq 'ReadOnlyPaths=/etc/gshsapp-operations' "$control_recovery"
if grep -Fq 'ReadOnlyPaths=/usr/local/lib/gshsapp-operations' "$control_recovery"; then
  echo "Control recovery makes CONTROL_ROOT a read-only mount point before exchange." >&2
  exit 1
fi
python3 - "$SCRIPT_DIR/install-deploy-service.sh" <<'PY'
import pathlib
import sys

source = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
start = source.index("verify_loaded_unit()")
end = source.index("\n}\n\nverify_unit_bytes()", start)
effective_verification = source[start:end]
for contract in (
    "/usr/bin/python3 - \"$unit\" \"$expected_path\" \"$properties\" <<'PY' || return 1",
    '--property=BindsTo',
    '--property=PartOf',
    '--property=Before',
    '--property=Requires',
    '--property=After',
    'dependencies["BindsTo"] != {"docker.service"}',
    'dependencies["PartOf"] != {"docker.service"}',
    '"docker.service" not in dependencies["Before"]',
    '"gshsapp-control-update-recovery.service" not in dependencies["Requires"]',
    '"gshsapp-control-update-recovery.service" not in dependencies["After"]',
):
    if contract not in effective_verification:
        raise SystemExit("installer does not reject an effective quarantine unit detached from Docker restart lifecycle")
PY
grep -Fxq 'Requires=docker.service gshsapp-docker-user-firewall.service' "$recovery_unit"
grep -Fxq 'After=docker.service gshsapp-docker-user-firewall.service' "$recovery_unit"
grep -Fxq 'BindsTo=docker.service' "$recovery_unit"
grep -Fxq 'PartOf=docker.service' "$recovery_unit"
grep -Fxq 'WantedBy=docker.service' "$recovery_unit"
if grep -Eq 'OFFSITE|RequiresMountsFor|ConditionPathIsMountPoint|EnvironmentFile' "$recovery_unit"; then
  echo "Boot writer recovery is incorrectly gated on offsite configuration or mount availability." >&2
  exit 1
fi

grep -Fq 'docker-user-firewall.test.sh' "$SCRIPT_DIR/../.github/workflows/ci.yml"
python3 - "$SCRIPT_DIR/compose.yml" "$SCRIPT_DIR/deploy.sh" <<'PY'
import pathlib
import sys

compose = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
migrate, web = compose.split("\n  web:", 1)
assert "network_mode: none" in migrate
assert "\n    networks:\n      - web\n" in web
assert compose.endswith("\nnetworks:\n  web:\n    external: true\n    name: gshsapp-web\n")
deploy = pathlib.Path(sys.argv[2]).read_text(encoding="utf-8")
for contract in (
    "docker network inspect --format '{{.Id}}' gshsapp-web",
    "{{json .NetworkSettings.Networks}}",
    'set(value) != {"gshsapp-web"}',
    'value["gshsapp-web"].get("NetworkID") != os.environ["EXPECTED_NETWORK_ID"]',
):
    assert contract in deploy
PY

printf '%s\n' "Docker DOCKER-USER firewall tests passed."
