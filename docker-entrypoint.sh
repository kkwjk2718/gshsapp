#!/bin/sh
set -eu

# Schema changes are applied exactly once by the migration service in deploy.sh.
# Starting the web process never mutates schema or applies a staged restore.
if [ "$#" -eq 0 ]; then
  set -- node server.js
fi

exec "$@"
