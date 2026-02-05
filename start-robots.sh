#!/bin/bash
# Start watcher + server together (robôs)
# Usage: ./start-robots.sh

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAILWAY_URL_DEFAULT="https://brickmarketing-production.up.railway.app"

is_running() {
  local pattern="$1"
  pgrep -af "$pattern" >/dev/null 2>&1
}

start_server() {
  if is_running "node .*server.js"; then
    echo "✅ server.js já está rodando"
  else
    echo "🚀 iniciando server.js"
    (cd "$SCRIPT_DIR" && nohup node server.js > /tmp/brick_server.log 2>&1 &)
  fi
}

start_watcher() {
  if is_running "node .*watcher.js"; then
    echo "✅ watcher.js já está rodando"
  else
    echo "🚀 iniciando watcher.js"
    (cd "$SCRIPT_DIR" && RAILWAY_URL="${RAILWAY_URL:-$RAILWAY_URL_DEFAULT}" nohup node watcher.js > /tmp/brick_watcher.out 2>&1 &)
  fi
}

start_server
start_watcher

echo "---"
echo "Logs: /tmp/brick_server.log e /tmp/brick_watcher.out"
