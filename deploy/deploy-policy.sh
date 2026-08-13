#!/usr/bin/env bash

validate_deploy_identity() {
  [[ "${IMAGE_TAG:-}" =~ ^sha-[0-9a-f]{40}$ ]] || {
    echo "IMAGE_TAG must be sha- followed by the exact 40-hex Git commit." >&2
    return 1
  }
  [[ "${IMAGE_DIGEST:-}" =~ ^sha256:[0-9a-f]{64}$ ]] || {
    echo "IMAGE_DIGEST must be an exact sha256 digest." >&2
    return 1
  }
  [[ "${APP_VERSION:-}" == "$IMAGE_TAG" ]] || {
    echo "APP_VERSION must equal IMAGE_TAG." >&2
    return 1
  }
  [[ "${DOCKER_IMAGE:-}" =~ ^[A-Za-z0-9._/-]+$ ]] || {
    echo "DOCKER_IMAGE contains unsafe characters." >&2
    return 1
  }
}

validate_bind_policy() {
  local first second third fourth
  IFS=. read -r first second third fourth <<<"${HOST_BIND_IP:-}"
  if [[ ! "$first" =~ ^[0-9]+$ || ! "$second" =~ ^[0-9]+$ || ! "$third" =~ ^[0-9]+$ || ! "$fourth" =~ ^[0-9]+$ ]] ||
     (( first > 255 || second > 255 || third > 255 || fourth > 255 )); then
    echo "HOST_BIND_IP must be an explicit IPv4 address." >&2
    return 1
  fi

  local is_private=false
  if (( first == 127 || first == 10 || (first == 192 && second == 168) || (first == 172 && second >= 16 && second <= 31) )); then
    is_private=true
  fi

  case "${HOST_BIND_IP:-}" in
    0.0.0.0)
      echo "Wildcard bind refused. Set the exact proxy-facing interface address and a source-restricted firewall." >&2
      return 1
      ;;
  esac
  if [[ "$is_private" != "true" && "${ALLOW_PUBLIC_BIND:-false}" != "true" ]]; then
    echo "A non-private bind requires ALLOW_PUBLIC_BIND=true and a source-restricted firewall." >&2
    return 1
  fi
}

validate_runtime_env_file() {
  local runtime_env_file="$1"
  local expected_origin="${EXPECTED_APP_ORIGIN:-}"
  if [[ ! -f "$runtime_env_file" || -L "$runtime_env_file" ]]; then
    echo "The production runtime environment file must be a regular, non-symlink file." >&2
    return 1
  fi

  local runtime_owner runtime_mode current_uid trusted_root current_path path_owner path_mode
  runtime_owner="$(stat -c '%u' -- "$runtime_env_file")" || return 1
  runtime_mode="$(stat -c '%a' -- "$runtime_env_file")" || return 1
  current_uid="$(id -u)"
  if [[ "$runtime_owner" != "0" && "$runtime_owner" != "$current_uid" ]] ||
     [[ "$runtime_mode" =~ [1-7][0-7]$ ]]; then
    echo "The production runtime environment must be owned by root or the deploy account and mode 0600 or stricter." >&2
    return 1
  fi
  trusted_root="${RUNTIME_ENV_TRUST_ROOT:-$(dirname -- "$runtime_env_file")}"
  [[ "$trusted_root" == /* && "$runtime_env_file" == "$trusted_root"/* ]] || {
    echo "The runtime environment file must be below the configured trusted deployment root." >&2
    return 1
  }
  current_path="$(dirname -- "$runtime_env_file")"
  while :; do
    [[ -d "$current_path" && ! -L "$current_path" ]] || {
      echo "Runtime environment path components must be regular directories, not symlinks." >&2
      return 1
    }
    path_owner="$(stat -c '%u' -- "$current_path")" || return 1
    path_mode="$(stat -c '%a' -- "$current_path")" || return 1
    if [[ "$path_owner" != "0" && "$path_owner" != "$current_uid" ]] ||
       [[ "$path_mode" =~ [2367][0-7]$ || "$path_mode" =~ [0-7][2367]$ ]]; then
      echo "Runtime environment path components must not be writable by group or other users." >&2
      return 1
    fi
    [[ "$current_path" == "$trusted_root" ]] && break
    [[ "$current_path" == "$trusted_root"/* ]] || {
      echo "Runtime environment path escaped the trusted deployment root." >&2
      return 1
    }
    current_path="$(dirname -- "$current_path")"
  done

  local matches
  matches="$(grep -E '^TRUSTED_PROXY_HOPS=' "$runtime_env_file" || true)"
  if [[ "$(printf '%s\n' "$matches" | grep -c . || true)" != "1" ]] ||
     [[ ! "$matches" =~ ^TRUSTED_PROXY_HOPS=\"?[1-3]\"?$ ]]; then
    echo "TRUSTED_PROXY_HOPS must occur exactly once and be 1, 2, or 3 in the production runtime environment." >&2
    return 1
  fi

  local auth_line auth_secret auth_secret_lower
  auth_line="$(grep -E '^AUTH_SECRET=' "$runtime_env_file" || true)"
  if [[ "$(printf '%s\n' "$auth_line" | grep -c . || true)" != "1" ]]; then
    echo "AUTH_SECRET must occur exactly once in the production runtime environment." >&2
    return 1
  fi
  auth_secret="${auth_line#AUTH_SECRET=}"
  if [[ "$auth_secret" == \"*\" && "$auth_secret" == *\" ]]; then
    auth_secret="${auth_secret:1:${#auth_secret}-2}"
  fi
  auth_secret_lower="${auth_secret,,}"
  if (( ${#auth_secret} < 32 )) ||
     [[ "$auth_secret_lower" =~ ^(change-?me|changeme|secret|development)$ ]] ||
     [[ "$auth_secret_lower" =~ (replace[-_\ ]?with|placeholder|example) ]]; then
    echo "AUTH_SECRET must contain at least 32 characters of non-placeholder secret material." >&2
    return 1
  fi

  if [[ ! "$expected_origin" =~ ^https://[A-Za-z0-9.-]+$ ]]; then
    echo "EXPECTED_APP_ORIGIN must be a canonical HTTPS origin without credentials, port, path, query, or fragment." >&2
    return 1
  fi
  local origin_key origin_line origin_value
  for origin_key in AUTH_URL NEXTAUTH_URL NEXT_PUBLIC_APP_URL; do
    origin_line="$(grep -E "^${origin_key}=" "$runtime_env_file" || true)"
    if [[ "$(printf '%s\n' "$origin_line" | grep -c . || true)" != "1" ]]; then
      echo "${origin_key} must occur exactly once in the production runtime environment." >&2
      return 1
    fi
    origin_value="${origin_line#*=}"
    if [[ "$origin_value" == \"*\" && "$origin_value" == *\" ]]; then
      origin_value="${origin_value:1:${#origin_value}-2}"
    fi
    if [[ "$origin_value" != "$expected_origin" ]]; then
      echo "${origin_key} does not match the expected deployment origin." >&2
      return 1
    fi
  done
  local trust_host_line
  trust_host_line="$(grep -E '^AUTH_TRUST_HOST=' "$runtime_env_file" || true)"
  if [[ "$(printf '%s\n' "$trust_host_line" | grep -c . || true)" != "1" ]] ||
     [[ ! "$trust_host_line" =~ ^AUTH_TRUST_HOST=\"?true\"?$ ]]; then
    echo "AUTH_TRUST_HOST=true must occur exactly once in the production runtime environment." >&2
    return 1
  fi
}
