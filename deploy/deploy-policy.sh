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
  case "${HOST_BIND_IP:-}" in
    ""|0.0.0.0|::|"[::]")
      if [[ "${ALLOW_PUBLIC_BIND:-false}" != "true" ]]; then
        echo "Wildcard/blank bind refused. Set a private interface address, or explicitly set ALLOW_PUBLIC_BIND=true with a source-restricted firewall." >&2
        return 1
      fi
      ;;
  esac
}
