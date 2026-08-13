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
      if [[ "${ALLOW_PUBLIC_BIND:-false}" != "true" ]]; then
        echo "Wildcard/blank bind refused. Set a private interface address, or explicitly set ALLOW_PUBLIC_BIND=true with a source-restricted firewall." >&2
        return 1
      fi
      ;;
  esac
  if [[ "$is_private" != "true" && "${ALLOW_PUBLIC_BIND:-false}" != "true" ]]; then
    echo "A non-private bind requires ALLOW_PUBLIC_BIND=true and a source-restricted firewall." >&2
    return 1
  fi
}
