#!/usr/bin/env bash
set -Eeuo pipefail

MODE="${1:---dry-run}"
PROXY_SOURCE_CIDR="${PROXY_SOURCE_CIDR:?PROXY_SOURCE_CIDR is required}"
SSH_SOURCE_CIDR="${SSH_SOURCE_CIDR:?SSH_SOURCE_CIDR is required}"
SSH_ADMIN_USER="${SSH_ADMIN_USER:?SSH_ADMIN_USER is required}"
HOST_BIND_IP="${HOST_BIND_IP:?HOST_BIND_IP is required}"
APP_PORT="${APP_PORT:-1234}"
ALLOW_NON_RFC1918_INTERNAL="${ALLOW_NON_RFC1918_INTERNAL:-false}"

if [[ "$MODE" != "--dry-run" && "$MODE" != "--apply" ]]; then
  echo "Usage: host-hardening.sh [--dry-run|--apply]" >&2
  exit 2
fi
[[ "$SSH_ADMIN_USER" =~ ^[a-z_][a-z0-9_-]{0,31}$ && "$SSH_ADMIN_USER" != "root" ]] || {
  echo "SSH_ADMIN_USER must be a non-root local account name." >&2
  exit 1
}
[[ "$APP_PORT" =~ ^[0-9]+$ ]] && (( APP_PORT >= 1 && APP_PORT <= 65535 )) || {
  echo "APP_PORT must be between 1 and 65535." >&2
  exit 1
}

NETWORK_POLICY="$({ PROXY_SOURCE_CIDR="$PROXY_SOURCE_CIDR" SSH_SOURCE_CIDR="$SSH_SOURCE_CIDR" HOST_BIND_IP="$HOST_BIND_IP" ALLOW_NON_RFC1918_INTERNAL="$ALLOW_NON_RFC1918_INTERNAL" python3 - <<'PY'
import ipaddress
import os

proxy = ipaddress.ip_network(os.environ["PROXY_SOURCE_CIDR"], strict=False)
ssh = ipaddress.ip_network(os.environ["SSH_SOURCE_CIDR"], strict=False)
bind = ipaddress.ip_address(os.environ["HOST_BIND_IP"])
if proxy.version != 4 or ssh.version != 4 or bind.version != 4:
    raise SystemExit("Only explicit IPv4 host topology is supported by this script.")
if proxy.prefixlen == 0 or ssh.prefixlen == 0:
    raise SystemExit("Broad /0 firewall sources are forbidden.")
if bind.is_unspecified or bind.is_multicast or bind.is_loopback:
    raise SystemExit("HOST_BIND_IP must be the explicit reverse-proxy-facing interface.")
if not (proxy.is_private and ssh.is_private and bind.is_private):
    if os.environ["ALLOW_NON_RFC1918_INTERNAL"] != "true":
        raise SystemExit("Non-RFC1918 addressing requires ALLOW_NON_RFC1918_INTERNAL=true and routing-owner review.")
print("validated")
PY
} 2>&1)" || { echo "$NETWORK_POLICY" >&2; exit 1; }

AUTHORIZED_KEYS="/home/$SSH_ADMIN_USER/.ssh/authorized_keys"
SSHD_DROP_IN="/etc/ssh/sshd_config.d/99-gshsapp-hardening.conf"

print_plan() {
  cat <<EOF
Host hardening plan:
- SSH account: $SSH_ADMIN_USER (public-key only)
- SSH source: $SSH_SOURCE_CIDR -> tcp/22
- Reverse proxy source: $PROXY_SOURCE_CIDR -> $HOST_BIND_IP:$APP_PORT
- All other inbound traffic: denied by UFW
- Application bind remains explicit; no wildcard listener is authorized
EOF
}

print_plan
if [[ "$MODE" == "--dry-run" ]]; then
  echo "Dry run only. Re-run with --apply after verifying console access and the printed topology."
  exit 0
fi

[[ "$EUID" -eq 0 ]] || { echo "--apply must run as root." >&2; exit 1; }
for command in python3 ip getent install sshd ufw systemctl; do
  command -v "$command" >/dev/null 2>&1 || { echo "Missing required command: $command" >&2; exit 1; }
done
getent passwd "$SSH_ADMIN_USER" >/dev/null || { echo "SSH_ADMIN_USER does not exist." >&2; exit 1; }
[[ -f "$AUTHORIZED_KEYS" && ! -L "$AUTHORIZED_KEYS" && -s "$AUTHORIZED_KEYS" ]] || {
  echo "A non-empty regular authorized_keys file is required before password login can be disabled." >&2
  exit 1
}
ip -o -4 addr show | awk '{print $4}' | cut -d/ -f1 | grep -Fxq "$HOST_BIND_IP" || {
  echo "HOST_BIND_IP is not assigned to this host." >&2
  exit 1
}

temporary_sshd="$(mktemp)"
trap 'rm -f -- "$temporary_sshd"' EXIT
cat >"$temporary_sshd" <<EOF
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
AuthenticationMethods publickey
AllowUsers $SSH_ADMIN_USER
MaxAuthTries 3
LoginGraceTime 30
X11Forwarding no
AllowAgentForwarding no
PermitEmptyPasswords no
EOF
install -o root -g root -m 0600 "$temporary_sshd" "$SSHD_DROP_IN"
sshd -t

ufw default deny incoming
ufw default allow outgoing
ufw allow from "$SSH_SOURCE_CIDR" to "$HOST_BIND_IP" port 22 proto tcp comment 'gshsapp ssh admin'
ufw allow from "$PROXY_SOURCE_CIDR" to "$HOST_BIND_IP" port "$APP_PORT" proto tcp comment 'gshsapp reverse proxy'
ufw --force enable
systemctl reload ssh || systemctl reload sshd

echo "Host hardening applied. Keep the current SSH session open and verify a second key-only session before disconnecting."
