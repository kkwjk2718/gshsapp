#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
UFW_RULE_VALIDATOR="$SCRIPT_DIR/validate-ufw-rules.py"

read_current_ufw_rule_count() {
  local allow_empty="$1"
  local -a validator_args=(
    --ssh-source "$SSH_SOURCE_CIDR"
    --proxy-source "$PROXY_SOURCE_CIDR"
    --destination "$HOST_BIND_IP"
    --app-port "$APP_PORT"
  )
  if [[ "$allow_empty" == "true" ]]; then
    validator_args+=(--allow-empty)
  fi

  LC_ALL=C ufw show added | python3 "$UFW_RULE_VALIDATOR" "${validator_args[@]}"
}

verify_ufw_policy() {
  local status
  status="$(LC_ALL=C ufw status verbose)" || {
    echo "Unable to read UFW active status after applying the policy." >&2
    return 1
  }
  grep -Fxq "Status: active" <<<"$status" || {
    echo "UFW is not active after applying the policy." >&2
    return 1
  }
  grep -Eq '^Default: deny \(incoming\), allow \(outgoing\), (deny|disabled) \(routed\)$' <<<"$status" || {
    echo "UFW default policies do not match deny-incoming/allow-outgoing/deny-routed." >&2
    return 1
  }
  read_current_ufw_rule_count false >/dev/null || {
    echo "UFW active rule verification failed after applying the policy." >&2
    return 1
  }
}

apply_ufw_policy() {
  local current_rule_count
  current_rule_count="$(read_current_ufw_rule_count true)" || return 1

  case "$current_rule_count" in
    0)
      # Add the access-preserving rules before changing a live default policy.
      ufw allow from "$SSH_SOURCE_CIDR" to "$HOST_BIND_IP" port 22 proto tcp comment 'gshsapp ssh admin' || return 1
      ufw allow from "$PROXY_SOURCE_CIDR" to "$HOST_BIND_IP" port "$APP_PORT" proto tcp comment 'gshsapp reverse proxy' || return 1
      ;;
    2)
      # The exact intended rules already exist; do not create duplicates.
      ;;
    *)
      echo "Unexpected validated UFW rule count: $current_rule_count" >&2
      return 1
      ;;
  esac

  ufw default deny incoming || return 1
  ufw default allow outgoing || return 1
  ufw default deny routed || return 1
  ufw --force enable || return 1
  verify_ufw_policy
}

install_sshd_policy() (
  local sshd_drop_in="$1"
  local temporary_sshd backup_sshd had_existing=false
  temporary_sshd="$(mktemp)"
  backup_sshd="${temporary_sshd}.previous"
  trap 'rm -f -- "$temporary_sshd" "$backup_sshd"' EXIT
  if [[ -e "$sshd_drop_in" ]]; then
    [[ -f "$sshd_drop_in" && ! -L "$sshd_drop_in" ]] || {
      echo "Refusing to replace a non-regular SSH policy file." >&2
      return 1
    }
    cp -p -- "$sshd_drop_in" "$backup_sshd"
    had_existing=true
  fi
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
  install -o root -g root -m 0600 "$temporary_sshd" "$sshd_drop_in"
  if ! sshd -t; then
    if [[ "$had_existing" == "true" ]]; then
      cp -p -- "$backup_sshd" "$sshd_drop_in"
    else
      rm -f -- "$sshd_drop_in"
    fi
    sshd -t || echo "Restored SSH configuration also failed validation; keep console access and repair manually." >&2
    return 1
  fi
)

validate_ssh_admin_access() {
  local passwd_record="$1"
  local expected_fingerprint="$2"
  local account_name password_field account_uid account_gid gecos account_home account_shell
  IFS=: read -r account_name password_field account_uid account_gid gecos account_home account_shell <<<"$passwd_record"
  [[ "$account_name" == "$SSH_ADMIN_USER" && "$account_home" == /* && -d "$account_home" && ! -L "$account_home" ]] || {
    echo "SSH administrator account/home lookup is invalid." >&2
    return 1
  }
  local login_shells_file="${SSH_LOGIN_SHELLS_FILE:-/etc/shells}"
  [[ -f "$login_shells_file" && ! -L "$login_shells_file" && "$account_shell" == /* && -x "$account_shell" &&
     "$(basename -- "$account_shell")" != "false" && "$(basename -- "$account_shell")" != "nologin" ]] &&
     grep -Fxq "$account_shell" "$login_shells_file" || {
    echo "SSH administrator must have an executable login shell listed in /etc/shells." >&2
    return 1
  }
  [[ "$expected_fingerprint" =~ ^SHA256:[A-Za-z0-9+/]{20,}={0,2}$ ]] || {
    echo "SSH_AUTHORIZED_KEY_FINGERPRINT must be the reviewed SHA256 fingerprint." >&2
    return 1
  }

  local ssh_directory="$account_home/.ssh"
  local authorized_keys="$ssh_directory/authorized_keys"
  local path owner mode
  for path in "$account_home" "$ssh_directory"; do
    [[ -d "$path" && ! -L "$path" ]] || {
      echo "SSH home and .ssh must be real directories." >&2
      return 1
    }
    owner="$(stat -c '%u' -- "$path")" || return 1
    mode="$(stat -c '%a' -- "$path")" || return 1
    [[ "$owner" == "0" || "$owner" == "$account_uid" ]] &&
      [[ ! "$mode" =~ [2367][0-7]$ && ! "$mode" =~ [0-7][2367]$ ]] || {
      echo "SSH home and .ssh ownership/permissions violate StrictModes." >&2
      return 1
    }
  done
  [[ -f "$authorized_keys" && ! -L "$authorized_keys" && -s "$authorized_keys" ]] || {
    echo "A non-empty regular authorized_keys file is required before password login can be disabled." >&2
    return 1
  }
  owner="$(stat -c '%u' -- "$authorized_keys")" || return 1
  mode="$(stat -c '%a' -- "$authorized_keys")" || return 1
  [[ "$owner" == "0" || "$owner" == "$account_uid" ]] &&
    [[ ! "$mode" =~ [2367][0-7]$ && ! "$mode" =~ [0-7][2367]$ ]] || {
    echo "authorized_keys ownership/permissions violate StrictModes." >&2
    return 1
  }

  local fingerprints
  fingerprints="$(ssh-keygen -l -E sha256 -f "$authorized_keys")" || {
    echo "authorized_keys contains no valid public key." >&2
    return 1
  }
  awk '{print $2}' <<<"$fingerprints" | grep -Fxq "$expected_fingerprint" || {
    echo "The reviewed SSH public-key fingerprint is not installed for the administrator." >&2
    return 1
  }
}

verify_effective_sshd_policy() {
  local account_home="$1"
  local source_address="$2"
  local effective
  effective="$(sshd -T -C "user=$SSH_ADMIN_USER,host=$(hostname -f),addr=$source_address")" || return 1
  grep -Fxq "passwordauthentication no" <<<"$effective" &&
  grep -Fxq "kbdinteractiveauthentication no" <<<"$effective" &&
  grep -Fxq "pubkeyauthentication yes" <<<"$effective" &&
  grep -Fxq "permitrootlogin no" <<<"$effective" &&
  grep -Eq "^allowusers( .*)? $SSH_ADMIN_USER( .*)?$|^allowusers $SSH_ADMIN_USER$" <<<"$effective" || {
    echo "Effective sshd authentication policy does not match the reviewed key-only configuration." >&2
    return 1
  }
  local authorized_value
  authorized_value="$(sed -n 's/^authorizedkeysfile //p' <<<"$effective")"
  grep -Eq '(^|[[:space:]])(\.ssh/authorized_keys|%h/\.ssh/authorized_keys)([[:space:]]|$)' <<<"$authorized_value" || {
    echo "Effective AuthorizedKeysFile does not include the validated account key file." >&2
    return 1
  }
  [[ -f "$account_home/.ssh/authorized_keys" && ! -L "$account_home/.ssh/authorized_keys" ]]
}

print_plan() {
  cat <<EOF
Host hardening plan:
- SSH account: $SSH_ADMIN_USER (public-key only)
- SSH source: $SSH_SOURCE_CIDR -> tcp/22
- Reverse proxy source: $PROXY_SOURCE_CIDR -> $HOST_BIND_IP:$APP_PORT
- All other inbound and routed traffic: denied by UFW
- Application bind remains explicit; no wildcard listener is authorized
EOF
}

main() {
  local mode="${1:---dry-run}"
  PROXY_SOURCE_CIDR="${PROXY_SOURCE_CIDR:?PROXY_SOURCE_CIDR is required}"
  SSH_SOURCE_CIDR="${SSH_SOURCE_CIDR:?SSH_SOURCE_CIDR is required}"
  SSH_ADMIN_USER="${SSH_ADMIN_USER:?SSH_ADMIN_USER is required}"
  HOST_BIND_IP="${HOST_BIND_IP:?HOST_BIND_IP is required}"
  APP_PORT="${APP_PORT:-1234}"
  ALLOW_NON_RFC1918_INTERNAL="${ALLOW_NON_RFC1918_INTERNAL:-false}"

  if [[ "$mode" != "--dry-run" && "$mode" != "--apply" ]]; then
    echo "Usage: host-hardening.sh [--dry-run|--apply]" >&2
    return 2
  fi
  [[ "$SSH_ADMIN_USER" =~ ^[a-z_][a-z0-9_-]{0,31}$ && "$SSH_ADMIN_USER" != "root" ]] || {
    echo "SSH_ADMIN_USER must be a non-root local account name." >&2
    return 1
  }
  [[ "$APP_PORT" =~ ^[0-9]+$ ]] && (( APP_PORT >= 1 && APP_PORT <= 65535 )) || {
    echo "APP_PORT must be between 1 and 65535." >&2
    return 1
  }

  local network_policy
  network_policy="$({ PROXY_SOURCE_CIDR="$PROXY_SOURCE_CIDR" SSH_SOURCE_CIDR="$SSH_SOURCE_CIDR" HOST_BIND_IP="$HOST_BIND_IP" ALLOW_NON_RFC1918_INTERNAL="$ALLOW_NON_RFC1918_INTERNAL" python3 - <<'PY'
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
  } 2>&1)" || { echo "$network_policy" >&2; return 1; }

  print_plan
  if [[ "$mode" == "--dry-run" ]]; then
    echo "Dry run only. Re-run with --apply after verifying console access and the printed topology."
    return 0
  fi

  [[ "$EUID" -eq 0 ]] || { echo "--apply must run as root." >&2; return 1; }
  local command
  for command in python3 ip getent hostname install sshd ssh-keygen stat ufw systemctl; do
    command -v "$command" >/dev/null 2>&1 || { echo "Missing required command: $command" >&2; return 1; }
  done
  [[ -f "$UFW_RULE_VALIDATOR" && ! -L "$UFW_RULE_VALIDATOR" ]] || {
    echo "The regular UFW rule validator is missing: $UFW_RULE_VALIDATOR" >&2
    return 1
  }

  local sshd_drop_in="/etc/ssh/sshd_config.d/99-gshsapp-hardening.conf"
  local passwd_record
  passwd_record="$(getent passwd "$SSH_ADMIN_USER")" || { echo "SSH_ADMIN_USER does not exist." >&2; return 1; }
  validate_ssh_admin_access "$passwd_record" "${SSH_AUTHORIZED_KEY_FINGERPRINT:-}" || return 1
  local account_home source_address
  account_home="$(cut -d: -f6 <<<"$passwd_record")"
  source_address="$(python3 -c 'import ipaddress,sys; print(next(ipaddress.ip_network(sys.argv[1], strict=False).hosts(), ipaddress.ip_network(sys.argv[1], strict=False).network_address))' "$SSH_SOURCE_CIDR")" || return 1
  ip -o -4 addr show | awk '{print $4}' | cut -d/ -f1 | grep -Fxq "$HOST_BIND_IP" || {
    echo "HOST_BIND_IP is not assigned to this host." >&2
    return 1
  }

  # Reject stale, broad, routed, IPv6, duplicated, or otherwise unexpected
  # UFW-managed rules before changing SSH or firewall state.
  read_current_ufw_rule_count true >/dev/null || return 1

  install_sshd_policy "$sshd_drop_in"
  verify_effective_sshd_policy "$account_home" "$source_address"

  apply_ufw_policy
  systemctl reload ssh || systemctl reload sshd

  echo "Host hardening applied and verified. Keep the current SSH session open and verify a second key-only session before disconnecting."
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
