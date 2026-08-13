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

runtime_env_root="$(mktemp -d)"
chmod 700 "$runtime_env_root"
runtime_env="$runtime_env_root/.env"
touch "$runtime_env"
chmod 600 "$runtime_env"
runtime_env_test_mode=600
runtime_env_test_owner=0
runtime_env_test_group="$(id -g)"
stat() {
  local target="${!#}"
  if [[ "$target" == "$runtime_env" && "$*" == *"%a"* ]]; then
    printf '%s\n' "$runtime_env_test_mode"
    return 0
  fi
  if [[ "$target" == "$runtime_env" && "$*" == *"%u"* ]]; then
    printf '%s\n' "$runtime_env_test_owner"
    return 0
  fi
  if [[ "$target" == "$runtime_env" && "$*" == *"%g"* ]]; then
    printf '%s\n' "$runtime_env_test_group"
    return 0
  fi
  command stat "$@"
}
RUNTIME_ENV_TRUST_ROOT="$runtime_env_root"
export RUNTIME_ENV_TRUST_ROOT
trap 'rm -rf -- "$runtime_env_root"' EXIT
EXPECTED_APP_ORIGIN=https://gshs.app
export EXPECTED_APP_ORIGIN
valid_runtime_env() {
  printf '%s\n' \
    'TRUSTED_PROXY_HOPS=1' \
    'AUTH_SECRET=production-test-secret-material-with-48-bytes-minimum' \
    'AUTH_URL=https://gshs.app' \
    'NEXTAUTH_URL=https://gshs.app' \
    'NEXT_PUBLIC_APP_URL=https://gshs.app' \
    'AUTH_TRUST_HOST=true'
}
valid_runtime_env >"$runtime_env"
validate_runtime_env_file "$runtime_env"

valid_runtime_env | sed '/^AUTH_TRUST_HOST=true$/a UPLOADS_ROOT=/app/data/custom-uploads' >"$runtime_env"
if validate_runtime_env_file "$runtime_env" >/dev/null 2>&1; then
  echo "runtime content-root remapping must be rejected so host and app backups remain complete" >&2
  exit 1
fi
valid_runtime_env >"$runtime_env"

runtime_env_test_owner=1001
if validate_runtime_env_file "$runtime_env" >/dev/null 2>&1; then
  echo "deploy-account-owned runtime secrets must be rejected; only root may own .env" >&2
  exit 1
fi
runtime_env_test_owner=0

chmod 640 "$runtime_env"
runtime_env_test_mode=640
validate_runtime_env_file "$runtime_env"
runtime_env_test_group=99999
if validate_runtime_env_file "$runtime_env" >/dev/null 2>&1; then
  echo "group-readable runtime secrets must use the dedicated deploy primary group" >&2
  exit 1
fi
runtime_env_test_group="$(id -g)"
chmod 600 "$runtime_env"
runtime_env_test_mode=600

valid_runtime_env | sed '/^AUTH_TRUST_HOST=true$/a NODE_OPTIONS=--require=/app/data/persist.js' >"$runtime_env"
if validate_runtime_env_file "$runtime_env" >/dev/null 2>&1; then
  echo "unknown executable runtime environment keys must be rejected" >&2
  exit 1
fi

valid_runtime_env >"$runtime_env"

chmod 644 "$runtime_env"
runtime_env_test_mode=644
if validate_runtime_env_file "$runtime_env" >/dev/null 2>&1; then
  echo "world-readable runtime secrets must be rejected" >&2
  exit 1
fi
chmod 600 "$runtime_env"
runtime_env_test_mode=600

valid_runtime_env | sed 's/^TRUSTED_PROXY_HOPS=1$/TRUSTED_PROXY_HOPS=0/' >"$runtime_env"
if validate_runtime_env_file "$runtime_env" >/dev/null 2>&1; then
  echo "zero trusted proxy hops must be rejected for production" >&2
  exit 1
fi

{ valid_runtime_env; printf '%s\n' 'TRUSTED_PROXY_HOPS=2'; } >"$runtime_env"
if validate_runtime_env_file "$runtime_env" >/dev/null 2>&1; then
  echo "duplicate trusted proxy settings must be rejected" >&2
  exit 1
fi

valid_runtime_env | sed 's/^AUTH_SECRET=.*$/AUTH_SECRET=replace-with-a-long-random-secret/' >"$runtime_env"
if validate_runtime_env_file "$runtime_env" >/dev/null 2>&1; then
  echo "known placeholder auth secrets must be rejected" >&2
  exit 1
fi

valid_runtime_env | sed 's/^AUTH_SECRET=.*$/AUTH_SECRET=short/' >"$runtime_env"
if validate_runtime_env_file "$runtime_env" >/dev/null 2>&1; then
  echo "short auth secrets must be rejected" >&2
  exit 1
fi

valid_runtime_env | sed 's#^NEXTAUTH_URL=.*$#NEXTAUTH_URL=https://test.gshs.app#' >"$runtime_env"
if validate_runtime_env_file "$runtime_env" >/dev/null 2>&1; then
  echo "cross-environment application origins must be rejected" >&2
  exit 1
fi

valid_runtime_env | sed 's/^AUTH_TRUST_HOST=true$/AUTH_TRUST_HOST=false/' >"$runtime_env"
if validate_runtime_env_file "$runtime_env" >/dev/null 2>&1; then
  echo "production AUTH_TRUST_HOST must be true" >&2
  exit 1
fi

{ valid_runtime_env; printf '%s\n' 'AUTH_TRUST_HOST=false'; } >"$runtime_env"
if validate_runtime_env_file "$runtime_env" >/dev/null 2>&1; then
  echo "duplicate production AUTH_TRUST_HOST values must be rejected" >&2
  exit 1
fi

entrypoint="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/docker-entrypoint.sh"
if TRUSTED_PROXY_HOPS=0 AUTH_SECRET=production-test-secret-material-with-48-bytes-minimum "$entrypoint" node server.js >/dev/null 2>"$runtime_env"; then
  echo "production web startup must reject zero trusted proxy hops" >&2
  exit 1
fi
grep -q "must be explicitly set to 1, 2, or 3" "$runtime_env"
if TRUSTED_PROXY_HOPS=1 AUTH_SECRET=replace-with-a-long-random-secret "$entrypoint" node server.js >/dev/null 2>"$runtime_env"; then
  echo "production web startup must reject placeholder auth secrets" >&2
  exit 1
fi
grep -q "AUTH_SECRET must contain" "$runtime_env"
TRUSTED_PROXY_HOPS=1 "$entrypoint" /usr/bin/true

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
