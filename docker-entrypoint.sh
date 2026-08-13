#!/bin/sh
set -eu

# Schema changes are applied exactly once by the migration service in deploy.sh.
# Starting the web process never mutates schema or applies a staged restore.
if [ "$#" -eq 0 ]; then
  set -- node server.js
fi

if [ "${1:-}" = "node" ] && [ "${2:-}" = "server.js" ]; then
  case "${TRUSTED_PROXY_HOPS:-}" in
    1|2|3) ;;
    *)
      echo "TRUSTED_PROXY_HOPS must be explicitly set to 1, 2, or 3 before the production web server can start." >&2
      exit 1
      ;;
  esac
  case "${AUTH_SECRET:-}" in
    ""|change-me|changeme|secret|development|*replace-with*|*replace_with*|*placeholder*|*example*)
      echo "AUTH_SECRET must contain at least 32 characters of non-placeholder secret material before production startup." >&2
      exit 1
      ;;
  esac
  if [ "${#AUTH_SECRET}" -lt 32 ]; then
    echo "AUTH_SECRET must contain at least 32 characters of non-placeholder secret material before production startup." >&2
    exit 1
  fi
fi

exec "$@"
