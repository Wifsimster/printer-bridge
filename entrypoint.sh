#!/bin/sh
# Run the better-auth sidecar and the FastAPI app in the same container.
# Python is PID 1 so signals (docker stop) reach uvicorn cleanly; if the
# sidecar dies we kill the whole container by exiting non-zero.
set -eu

if [ -z "${AUTH_SECRET:-}" ]; then
  echo "FATAL: AUTH_SECRET env var is required (use a 32+ byte random string)" >&2
  exit 1
fi

# Make sure the cookie's SameSite/Secure setting is right when behind a TLS
# reverse proxy. AUTH_TRUSTED_ORIGINS should include the public URL.
export AUTH_BASE_URL="${AUTH_BASE_URL:-http://127.0.0.1:8090}"
export AUTH_PORT="${AUTH_PORT:-8090}"
export AUTH_HOST="${AUTH_HOST:-127.0.0.1}"

cd /app/auth
node dist/server.js &
AUTH_PID=$!

# Surface sidecar exits so the container restarts instead of running half-broken.
( wait $AUTH_PID; status=$?; echo "auth sidecar exited with $status" >&2; kill -TERM 1 ) &

cd /app
exec python -u app.py
