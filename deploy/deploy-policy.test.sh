#!/usr/bin/env bash
set -Eeuo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/deploy-policy.sh"

IMAGE_TAG="sha-$(printf 'a%.0s' {1..40})"
IMAGE_DIGEST="sha256:$(printf 'b%.0s' {1..64})"
APP_VERSION="$IMAGE_TAG"
DOCKER_IMAGE="example/gshsapp"
HOST_BIND_IP=127.0.0.1
validate_deploy_identity
validate_bind_policy

IMAGE_TAG=sha-short
if validate_deploy_identity >/dev/null 2>&1; then
  echo "short image tags must be rejected" >&2
  exit 1
fi

IMAGE_TAG="sha-$(printf 'a%.0s' {1..40})"
HOST_BIND_IP=0.0.0.0
ALLOW_PUBLIC_BIND=false
if validate_bind_policy >/dev/null 2>&1; then
  echo "wildcard bind must require an explicit override" >&2
  exit 1
fi

ALLOW_PUBLIC_BIND=true
if validate_bind_policy >/dev/null 2>&1; then
  echo "wildcard bind must remain forbidden even with a public-address override" >&2
  exit 1
fi

HOST_BIND_IP=172.15.10.34
ALLOW_PUBLIC_BIND=false
if validate_bind_policy >/dev/null 2>&1; then
  echo "globally routed 172.15/16 must not be mistaken for RFC1918 space" >&2
  exit 1
fi

ALLOW_PUBLIC_BIND=true
validate_bind_policy
echo "deploy policy tests: ok"
