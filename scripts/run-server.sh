#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .runtime/logs
pids=()
declare -A service_pids=()
flush_marker="玩家存档队列已写入数据库"
flush_players() {
  local log_file=".runtime/logs/GameSrv.log"
  local before=0
  local after=0
  before="$(grep -c "$flush_marker" "$log_file" 2>/dev/null || true)"
  if ! printf 'save\n' > /tmp/mir2-GameSrv.stdin; then
    echo "Unable to request an online-player save" >&2
    return 1
  fi
  for attempt in {1..120}; do
    after="$(grep -c "$flush_marker" "$log_file" 2>/dev/null || true)"
    if (( after > before )); then
      return 0
    fi
    sleep 0.1
  done
  echo "Timed out waiting for online-player save acknowledgement" >&2
  return 1
}
is_running() {
  local pid="$1"
  local state=""
  [[ -r "/proc/$pid/stat" ]] || return 1
  state="$(awk '{print $3}' "/proc/$pid/stat" 2>/dev/null || true)"
  [[ -n "$state" && "$state" != "Z" ]]
}
stop() {
  trap - EXIT TERM INT
  local game_pid="${service_pids[GameSrv]:-}"
  if [[ -n "$game_pid" ]] && is_running "$game_pid"; then
    flush_players || true
    kill -INT "$game_pid" 2>/dev/null || true
    for attempt in {1..50}; do
      is_running "$game_pid" || break
      sleep 0.1
    done
    kill -TERM "$game_pid" 2>/dev/null || true
  fi
  for pid in "${pids[@]}"; do
    [[ "$pid" == "$game_pid" ]] || kill -INT "$pid" 2>/dev/null || true
  done
  for attempt in {1..50}; do
    running=false
    for pid in "${pids[@]}"; do
      if is_running "$pid"; then running=true; break; fi
    done
    [[ "$running" == false ]] && break
    sleep 0.1
  done
  for pid in "${pids[@]}"; do kill -TERM "$pid" 2>/dev/null || true; done
  for attempt in {1..20}; do
    running=false
    for pid in "${pids[@]}"; do
      if is_running "$pid"; then running=true; break; fi
    done
    [[ "$running" == false ]] && break
    sleep 0.1
  done
  for pid in "${pids[@]}"; do kill -KILL "$pid" 2>/dev/null || true; done
  wait || true
}
trap stop EXIT
trap 'exit 0' TERM INT
wait_port() {
  local port="$1"
  local port_hex
  port_hex="$(printf '%04X' "$port")"
  for attempt in {1..120}; do
    # Read listener state without creating a legacy gateway session.
    if awk -v port="$port_hex" '$2 ~ ":"port"$" && $4 == "0A" {found=1} END {exit !found}' /proc/net/tcp /proc/net/tcp6; then return 0; fi
    for pid in "${pids[@]}"; do kill -0 "$pid" 2>/dev/null || return 1; done
    sleep 0.5
  done
  echo "Backend port $port did not become ready" >&2
  return 1
}
for mapping in "LoginSrv:LoginSrv" "DBServer:DBSrv" "Mir200:GameSrv" \
  "LoginGate:LoginGate" "SelGate:SelGate" "RunGate:GameGate"; do
  directory="${mapping%:*}"
  assembly="${mapping#*:}"
  case "$assembly" in
    DBSrv) wait_port 5600 ;;
    GameSrv) wait_port 5600; wait_port 6000 ;;
    LoginGate) wait_port 5500 ;;
    SelGate) wait_port 5100 ;;
    GameGate) wait_port 5000 ;;
  esac
  # A live stdin prevents the upstream interactive consoles spinning on EOF.
  fifo="/tmp/mir2-$assembly.stdin"
  [[ -p "$fifo" ]] || mkfifo "$fifo"
  exec {input}<>"$fifo"
  (cd ".runtime/server/$directory" && exec dotnet "$assembly.dll") <&"$input" \
    >".runtime/logs/$assembly.log" 2>&1 &
  pids+=("$!")
  service_pids["$assembly"]="$!"
  exec {input}>&-
done
# Polling keeps TERM/INT traps responsive; a blocking wait can defer the trap
# until Docker exhausts the entire stop grace period.
while true; do
  for pid in "${pids[@]}"; do
    is_running "$pid" || exit 1
  done
  sleep 0.5
done
