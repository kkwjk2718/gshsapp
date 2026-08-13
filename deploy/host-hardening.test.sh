#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
source "$SCRIPT_DIR/host-hardening.sh"

PROXY_SOURCE_CIDR="10.30.0.0/24"
SSH_SOURCE_CIDR="10.20.0.0/24"
HOST_BIND_IP="10.40.0.12"
APP_PORT="1234"
UFW_RULE_VALIDATOR="$SCRIPT_DIR/validate-ufw-rules.py"

if ! python3 -c 'raise SystemExit(0)' >/dev/null 2>&1; then
  python_fallback="$(command -v python)"
  python3() {
    "$python_fallback" "$@"
  }
fi

temporary_directory="$(mktemp -d)"
trap 'rm -rf -- "$temporary_directory"' EXIT
mutation_log="$temporary_directory/mutations.log"

fixture_mode="broad"

ufw() {
  if [[ "$*" == "show added" ]]; then
    printf '%s\n' "Added user rules (see 'ufw status' for running firewall):"
    if [[ "$fixture_mode" == "broad" ]]; then
      printf '%s\n' "ufw allow 22/tcp"
    elif [[ "$fixture_mode" == "exact" || "$fixture_mode" == "inactive" ]] || grep -Fqx "allow from $PROXY_SOURCE_CIDR to $HOST_BIND_IP port $APP_PORT proto tcp comment gshsapp reverse proxy" "$mutation_log" 2>/dev/null; then
      printf '%s\n' \
        "ufw allow from $SSH_SOURCE_CIDR to $HOST_BIND_IP port 22 proto tcp comment 'gshsapp ssh admin'" \
        "ufw allow from $PROXY_SOURCE_CIDR to $HOST_BIND_IP port $APP_PORT proto tcp comment 'gshsapp reverse proxy'"
      if [[ "$fixture_mode" == "empty_then_broad_post" ]]; then
        printf '%s\n' "ufw allow 443/tcp"
      fi
    fi
    return 0
  fi
  if [[ "$*" == "status verbose" ]]; then
    if [[ "$fixture_mode" == "inactive" ]]; then
      printf '%s\n' "Status: inactive"
      return 0
    fi
    printf '%s\n' \
      "Status: active" \
      "Logging: on (low)" \
      "Default: deny (incoming), allow (outgoing), deny (routed)" \
      "New profiles: skip"
    return 0
  fi
  printf '%s\n' "$*" >>"$mutation_log"
}

if output="$(apply_ufw_policy 2>&1)"; then
  echo "Expected a pre-existing broad allow rule to be rejected." >&2
  exit 1
fi
[[ "$output" == *"unexpected UFW rule"* ]] || {
  echo "Broad allow rejection did not include the validator reason: $output" >&2
  exit 1
}
[[ ! -s "$mutation_log" ]] || {
  echo "UFW was mutated before the existing broad allow rule was rejected." >&2
  exit 1
}

fixture_mode="empty_then_exact"
: >"$mutation_log"
apply_ufw_policy

expected_mutations="$temporary_directory/expected-mutations.log"
cat >"$expected_mutations" <<EOF
allow from $SSH_SOURCE_CIDR to $HOST_BIND_IP port 22 proto tcp comment gshsapp ssh admin
allow from $PROXY_SOURCE_CIDR to $HOST_BIND_IP port $APP_PORT proto tcp comment gshsapp reverse proxy
default deny incoming
default allow outgoing
default deny routed
--force enable
EOF
diff -u "$expected_mutations" "$mutation_log"

fixture_mode="exact"
: >"$mutation_log"
apply_ufw_policy
cat >"$expected_mutations" <<EOF
default deny incoming
default allow outgoing
default deny routed
--force enable
EOF
diff -u "$expected_mutations" "$mutation_log"

fixture_mode="empty_then_broad_post"
: >"$mutation_log"
if output="$(apply_ufw_policy 2>&1)"; then
  echo "Expected the post-apply rule-set verification to reject an extra rule." >&2
  exit 1
fi
[[ "$output" == *"unexpected UFW rule"* ]] || {
  echo "Post-apply rule rejection did not include the validator reason: $output" >&2
  exit 1
}

fixture_mode="inactive"
: >"$mutation_log"
if output="$(apply_ufw_policy 2>&1)"; then
  echo "Expected inactive UFW status to fail post-apply verification." >&2
  exit 1
fi
[[ "$output" == *"UFW is not active"* ]] || {
  echo "Inactive status rejection did not include the expected reason: $output" >&2
  exit 1
}

SSH_ADMIN_USER="deployer"
ALLOW_NON_RFC1918_INTERNAL="false"
dry_run_output="$(main --dry-run)"
[[ "$dry_run_output" == *"Dry run only."* ]]

temporary_sshd_fixture="$temporary_directory/sshd-policy.tmp"
installed_sshd_fixture="$temporary_directory/99-gshsapp-hardening.conf"
mktemp() {
  printf '%s\n' "$temporary_sshd_fixture"
}
install() {
  local -a arguments=("$@")
  cp "${arguments[-2]}" "${arguments[-1]}"
}
sshd() {
  [[ "$*" == "-t" ]]
}
install_sshd_policy "$installed_sshd_fixture"
[[ ! -e "$temporary_sshd_fixture" ]] || {
  echo "Temporary SSH policy was not removed after validation." >&2
  exit 1
}
grep -Fxq "AllowUsers $SSH_ADMIN_USER" "$installed_sshd_fixture"

echo "host-hardening UFW regression test passed"
