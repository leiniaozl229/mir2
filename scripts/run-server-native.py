#!/usr/bin/env python3
"""Supervise the six native Windows services; MySQL is managed separately.

Use start/stop/status from another terminal. Each service retains an open stdin
pipe. A normal stop disconnects client gates, drains players and pending loads,
then saves and waits for actual world shutdown before stopping the database.
"""
import argparse
import configparser
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / ".runtime"
STATE = RUNTIME / "native-server.json"
STOP = RUNTIME / "native-server.stop"
LOCK = RUNTIME / "native-server.lock"
LOGS = RUNTIME / "logs"
SAVE_MARKER = "玩家存档队列已写入数据库"
WORLD_STOPPED_MARKER = "游戏世界服务线程停止"
DRAIN_STATUS = re.compile(rb"MIR2_DRAIN_STATUS players=(\d+) loading=(\d+) saves=(\d+)")
SERVICES = [
    ("LoginSrv", "LoginSrv", (5500, 5600)),
    ("DBSrv", "DBServer", (5100, 5700, 6000)),
    ("GameSrv", "Mir200", (5000,)),
    ("LoginGate", "LoginGate", (17000,)),
    ("SelGate", "SelGate", (17100,)),
    ("GameGate", "RunGate", (17200,)),
]


def read_config_text(path):
    raw = path.read_bytes()
    if raw.startswith(b"\xef\xbb\xbf"):
        return raw.decode("utf-8-sig")
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("gb18030")


def configured_services():
    services = list(SERVICES[:3])
    for name, directory, section, address_key, port_key in [
        ("LoginGate", "LoginGate", "LoginGate", "GateAddr0", "GatePort0"),
        ("SelGate", "SelGate", "SelGate", "GateAddr0", "GatePort0"),
        ("GameGate", "RunGate", "GameGate", "GateAddress1", "GatePort1"),
    ]:
        config = configparser.ConfigParser(interpolation=None, strict=False)
        config.read_string(read_config_text(RUNTIME / "server" / directory / "config.conf"))
        if config.get(section, address_key, fallback="") != "127.0.0.1":
            raise RuntimeError("Run prepare-runtime.py --native-windows before starting")
        services.append((name, directory, (config.getint(section, port_key),)))
    return services


def listener_ports():
    """Inspect listeners without creating legacy authentication sessions."""
    result = subprocess.run(["netstat", "-ano", "-p", "TCP"],
                            capture_output=True, text=True, encoding="ascii", errors="replace", check=True,
                            creationflags=subprocess.CREATE_NO_WINDOW)
    ports = set()
    for line in result.stdout.splitlines():
        fields = line.split()
        if len(fields) >= 4 and fields[0] == "TCP" and fields[3] == "LISTENING":
            ports.add(int(fields[1].rsplit(":", 1)[1]))
    return ports


def read_state():
    for attempt in range(10):
        try:
            return json.loads(STATE.read_text(encoding="utf-8"))
        except (FileNotFoundError, ValueError):
            return {}
        except PermissionError:
            # Windows can briefly deny a reader while the supervisor replaces
            # its state file with an atomic rename.
            if attempt == 9:
                raise
            time.sleep(0.05)


def write_state(state):
    temporary = STATE.with_suffix(".tmp")
    temporary.write_text(json.dumps(state, indent=2), encoding="utf-8")
    temporary.replace(STATE)


def wait_for_ports(ports, processes, seconds=90):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        for name, process in processes.items():
            if process.poll() is not None:
                raise RuntimeError(f"{name} exited ({process.returncode}); inspect .runtime/logs/{name}.log")
        if set(ports) <= listener_ports():
            return
        if STOP.exists():
            raise RuntimeError("Stop requested during startup")
        time.sleep(0.5)
    raise RuntimeError(f"Listeners {ports} did not become ready; inspect .runtime/logs")


def log_since(log, offset):
    with log.open("rb") as handle:
        handle.seek(offset)
        return handle.read()


def has_log_marker(data, marker):
    # Windows console redirection can use the active ANSI code page even when
    # server files and Linux logs use UTF-8. The wire protocol is unaffected.
    return any(marker.encode(encoding) in data for encoding in ("utf-8", "gb18030"))


def send_command(process, command):
    process.stdin.write(command.encode("ascii") + b"\n")
    process.stdin.flush()


def terminate_services(processes, names):
    for name in names:
        process = processes.get(name)
        if process and process.poll() is None:
            process.terminate()
            process.wait(timeout=10)


def stop_services(processes, shutdown, timeout=480):
    deadline = time.monotonic() + timeout
    # Close admission and active client sockets first. GameSrv's gate-close
    # handler marks their players for logout, which queues final saves.
    terminate_services(processes, ("LoginGate", "SelGate", "GameGate"))
    game = processes.get("GameSrv")
    if game and game.poll() is None:
        log = LOGS / "GameSrv.log"
        if not shutdown.get("exit_sent"):
            empty_samples = 0
            while time.monotonic() < deadline and game.poll() is None:
                offset = log.stat().st_size
                send_command(game, "drainstatus")
                probe_deadline = min(deadline, time.monotonic() + 5)
                match = None
                while time.monotonic() < probe_deadline and game.poll() is None:
                    match = DRAIN_STATUS.search(log_since(log, offset))
                    if match:
                        break
                    time.sleep(0.1)
                empty_samples = empty_samples + 1 if match and all(int(value) == 0 for value in match.groups()) else 0
                if empty_samples >= 2:
                    break
                time.sleep(0.5)
            if game.poll() is None and empty_samples < 2:
                raise RuntimeError("Player/load/save queues did not drain; GameSrv and database services remain running")
            if game.poll() is None:
                offset = log.stat().st_size
                send_command(game, "save")
                while time.monotonic() < deadline and game.poll() is None:
                    if has_log_marker(log_since(log, offset), SAVE_MARKER):
                        break
                    time.sleep(0.1)
                else:
                    if game.poll() is None:
                        raise RuntimeError("Save acknowledgement missing; GameSrv and database services remain running")
                if game.poll() is None:
                    shutdown["exit_offset"] = log.stat().st_size
                    send_command(game, "exit")
                    shutdown["exit_sent"] = True
        while game.poll() is None:
            if has_log_marker(log_since(log, shutdown["exit_offset"]), WORLD_STOPPED_MARKER):
                break
            if time.monotonic() >= deadline:
                raise RuntimeError("World shutdown not complete; GameSrv and database services remain running; retry stop to keep waiting")
            time.sleep(0.2)
    # The actual world completion marker is emitted only after all processors,
    # the gate channel and DataServer have stopped. Never use the earlier
    # 'no players online' message as permission to terminate the world.
    terminate_services(processes, ("GameSrv", "DBSrv", "LoginSrv"))


def read_stop_request():
    try:
        request = json.loads(STOP.read_text(encoding="utf-8"))
        return request["requestId"], float(request["timeoutSeconds"])
    except (ValueError, KeyError):
        return "legacy-stop-request", 480


def supervise(dotnet):
    lock = LOCK.open("x", encoding="ascii")
    processes = {}
    logs = []
    shutdown = {}
    state = {"supervisorPid": os.getpid(), "status": "starting", "services": {}}
    try:
        lock.write(str(os.getpid()))
        lock.flush()
        STOP.unlink(missing_ok=True)
        write_state(state)
        for name, directory, ports in configured_services():
            log = (LOGS / f"{name}.log").open("wb")
            logs.append(log)
            process = subprocess.Popen([dotnet, f"{name}.dll"],
                cwd=RUNTIME / "server" / directory, stdin=subprocess.PIPE,
                stdout=log, stderr=subprocess.STDOUT,
                creationflags=subprocess.CREATE_NO_WINDOW)
            processes[name] = process
            state["services"][name] = process.pid
            write_state(state)
            wait_for_ports(ports, processes)
        state["status"] = "ready"
        write_state(state)
        while True:
            if STOP.exists():
                request_id, timeout = read_stop_request()
                STOP.unlink(missing_ok=True)
                state.update(status="stopping", stopRequestId=request_id)
                write_state(state)
                try:
                    stop_services(processes, shutdown, timeout)
                    state["status"] = "stopped"
                    write_state(state)
                    return
                except (RuntimeError, OSError, subprocess.TimeoutExpired) as error:
                    state["status"] = "stop-failed"
                    state["error"] = str(error)
                    write_state(state)
            exited = [name for name, process in processes.items() if process.poll() is not None]
            if state["status"] == "stop-failed":
                # Client gates have intentionally exited. Keep the remaining
                # stdin pipes alive and wait for an explicit stop retry.
                time.sleep(0.5)
                continue
            if exited:
                raise RuntimeError(f"Service exited: {', '.join(exited)}")
            time.sleep(0.5)
    except Exception as error:
        state["status"] = "failed"
        state["error"] = str(error)
        write_state(state)
        # Apply the same drain/save/true-completion checks after a failure.
        # A timeout never authorizes killing the remaining world/database.
        timeout = 480
        while True:
            try:
                stop_services(processes, shutdown, timeout)
                break
            except Exception as stop_error:
                state["status"] = "stop-failed"
                state["shutdownError"] = str(stop_error)
                write_state(state)
                # Keep stdin alive until the operator retries; losing the
                # supervisor would otherwise make console loops spin on EOF.
                while not STOP.exists():
                    time.sleep(0.5)
                request_id, timeout = read_stop_request()
                STOP.unlink(missing_ok=True)
                state.update(status="stopping", stopRequestId=request_id)
                write_state(state)
        state["status"] = "failed"
        write_state(state)
        raise
    finally:
        for log in logs:
            log.close()
        lock.close()
        LOCK.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("start", "stop", "status", "supervise"))
    parser.add_argument("--dotnet", default="dotnet")
    parser.add_argument("--stop-timeout", type=float, default=480,
                        help="Seconds allowed for draining and actual world shutdown (default: 480)")
    args = parser.parse_args()
    if os.name != "nt":
        parser.error("This runner is for native Windows; use scripts/run-server.sh in Docker")
    if args.action == "status":
        print(json.dumps(read_state(), indent=2))
        return
    if args.action == "stop":
        if not LOCK.exists():
            raise SystemExit("Native server supervisor is not running")
        if args.stop_timeout <= 0:
            parser.error("--stop-timeout must be positive")
        request_id = uuid.uuid4().hex
        temporary = STOP.with_suffix(".tmp")
        temporary.write_text(json.dumps({"requestId": request_id,
                                         "timeoutSeconds": args.stop_timeout}), encoding="utf-8")
        temporary.replace(STOP)
        deadline = time.monotonic() + args.stop_timeout + 40
        while time.monotonic() < deadline:
            state = read_state()
            if state.get("stopRequestId") == request_id and state.get("status") in ("stopped", "stop-failed", "failed"):
                print(json.dumps(state, indent=2))
                if state["status"] != "stopped":
                    raise SystemExit(1)
                return
            time.sleep(0.5)
        raise SystemExit("Stop still in progress; inspect status and logs")
    dotnet = shutil.which(args.dotnet)
    if not dotnet:
        raise SystemExit(".NET 8 SDK/runtime not found; pass --dotnet with its executable path")
    if args.action == "supervise":
        supervise(dotnet)
        return
    if LOCK.exists():
        raise SystemExit("A native supervisor lock exists; use status/stop before starting again")
    required = [RUNTIME / "server" / directory / f"{name}.dll" for name, directory, _ in SERVICES]
    required += [RUNTIME / "server/DBServer/DBSrv.Storage.MySQL.dll"]
    if any(not path.exists() for path in required):
        raise SystemExit("Build all native services first with scripts/build-server.ps1")
    services = configured_services()
    occupied = set(port for _, _, ports in services for port in ports) & listener_ports()
    if occupied:
        raise SystemExit(f"Server ports already in use: {sorted(occupied)}")
    LOGS.mkdir(parents=True, exist_ok=True)
    with (LOGS / "native-supervisor.log").open("wb") as log:
        process = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), "supervise", "--dotnet", dotnet],
            cwd=ROOT, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
            creationflags=subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP)
    deadline = time.monotonic() + 120
    while time.monotonic() < deadline:
        state = read_state()
        if state.get("supervisorPid") == process.pid and state.get("status") in ("ready", "failed"):
            print(json.dumps(state, indent=2))
            if state["status"] != "ready":
                raise SystemExit(1)
            return
        if process.poll() is not None:
            raise SystemExit("Supervisor exited; inspect .runtime/logs/native-supervisor.log")
        time.sleep(0.5)
    print("Startup continues in background; use the status command and inspect logs")


if __name__ == "__main__":
    main()
