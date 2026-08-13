#!/bin/sh
set -eu

# Schema changes are applied exactly once by the migration service in deploy.sh.
# The web process is deliberately incapable of mutating its schema on restart.
if [ "$#" -eq 0 ]; then
  set -- node server.js
fi

exec "$@"
