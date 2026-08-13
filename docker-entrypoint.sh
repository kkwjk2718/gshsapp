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
fi

exec "$@"
