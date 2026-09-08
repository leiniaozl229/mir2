#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"
mkdir -p .runtime/logs

PATH="/opt/homebrew/bin:$PATH" bash scripts/compose.sh up -d db engine web-gateway
python3 scripts/wait-ready.py

vite_pid=""
cleanup() {
  if [[ -n "$vite_pid" ]]; then kill "$vite_pid" 2>/dev/null || true; fi
}
trap cleanup EXIT

if ! curl -fsS http://127.0.0.1:5173/play.html >/dev/null 2>&1; then
  npm run dev >.runtime/logs/agent-playtest-vite.log 2>&1 &
  vite_pid="$!"
  for _ in {1..80}; do
    if curl -fsS http://127.0.0.1:5173/play.html >/dev/null 2>&1; then break; fi
    sleep .25
  done
  curl -fsS http://127.0.0.1:5173/play.html >/dev/null
fi

node tools/agent_playtest.mjs
