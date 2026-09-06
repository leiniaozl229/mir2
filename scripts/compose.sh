#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if docker compose version >/dev/null 2>&1; then
  compose=(docker compose)
else
  compose=(docker-compose)
fi

service_running() {
  "${compose[@]}" ps --status running --services 2>/dev/null | grep -Fxq "$1"
}

flush_online_players() {
  local marker="玩家存档队列已写入数据库"
  local log_file=".runtime/logs/GameSrv.log"
  local before=0
  local after=0
  before="$(grep -c "$marker" "$log_file" 2>/dev/null || true)"
  "${compose[@]}" exec -T engine bash -lc "printf 'save\\n' > /tmp/mir2-GameSrv.stdin"
  for attempt in {1..120}; do
    after="$(grep -c "$marker" "$log_file" 2>/dev/null || true)"
    if (( after > before )); then
      return 0
    fi
    sleep 0.1
  done
  echo "Timed out waiting for online-player save acknowledgement" >&2
  return 1
}

signal_game_server() {
  "${compose[@]}" exec -T engine bash -lc '
    for file in /proc/[0-9]*/cmdline; do
      if tr "\0" " " < "$file" 2>/dev/null | grep -q "[G]ameSrv.dll"; then
        pid="${file#/proc/}"
        pid="${pid%/cmdline}"
        kill -INT "$pid"
        exit 0
      fi
    done
    exit 1
  '
}

# When the engine is part of a normal stop, disconnect browser sessions first.
# The engine wrapper then flushes every online character while DBSrv and MySQL
# are still available, before the remaining services are stopped.
if [[ "${1:-}" == "stop" ]]; then
  shift
  targets=("$@")
  stop_engine=false
  if (( ${#targets[@]} == 0 )); then
    stop_engine=true
  else
    for target in "${targets[@]}"; do
      if [[ "$target" == "engine" ]]; then
        stop_engine=true
        break
      fi
    done
  fi
  if [[ "$stop_engine" == true ]]; then
    "${compose[@]}" stop -t 2 web-gateway
    if service_running engine; then
      flush_online_players
      signal_game_server || true
    fi
    "${compose[@]}" stop -t 5 engine
    remaining=()
    if (( ${#targets[@]} == 0 )); then
      remaining=(db)
    else
      for target in "${targets[@]}"; do
        [[ "$target" == "engine" || "$target" == "web-gateway" ]] || remaining+=("$target")
      done
    fi
    if (( ${#remaining[@]} > 0 )); then
      "${compose[@]}" stop "${remaining[@]}"
    fi
    exit 0
  fi
  exec "${compose[@]}" stop "${targets[@]}"
fi

exec "${compose[@]}" "$@"
