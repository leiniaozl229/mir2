import configparser
import importlib.util
from pathlib import Path
import tempfile
import unittest
import io
import json
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]


def load_script(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), ROOT / "scripts" / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class NativeRuntimeTests(unittest.TestCase):
    def test_state_reader_retries_transient_windows_file_lock(self):
        runner = load_script("run-server-native")

        class TransientState:
            calls = 0

            def read_text(self, **_kwargs):
                self.calls += 1
                if self.calls == 1:
                    raise PermissionError("state file is being replaced")
                return '{"status": "ready"}'

        state = TransientState()
        with patch.object(runner, "STATE", state), patch.object(runner.time, "sleep") as sleep:
            self.assertEqual(runner.read_state(), {"status": "ready"})
        self.assertEqual(state.calls, 2)
        sleep.assert_called_once_with(0.05)

    def test_gateway_configuration_rewritten_as_gbk_can_restart(self):
        runner = load_script("run-server-native")
        with tempfile.TemporaryDirectory() as temporary:
            runtime = Path(temporary)
            for directory, section, address_key, port_key, port in [
                ("LoginGate", "LoginGate", "GateAddr0", "GatePort0", 7000),
                ("SelGate", "SelGate", "GateAddr0", "GatePort0", 17100),
                ("RunGate", "GameGate", "GateAddress1", "GatePort1", 17200),
            ]:
                config = runtime / "server" / directory / "config.conf"
                config.parent.mkdir(parents=True)
                config.write_bytes(f"[{section}]\nTitle=热血传奇\n{address_key}=127.0.0.1\n{port_key}={port}\n".encode("gb18030"))
            with patch.object(runner, "RUNTIME", runtime):
                self.assertEqual([row[2] for row in runner.configured_services()[3:]], [(7000,), (17100,), (17200,)])

    def test_shutdown_waits_for_real_completion_and_supports_gbk_logs(self):
        runner = load_script("run-server-native")
        with tempfile.TemporaryDirectory() as temporary:
            log = Path(temporary) / "GameSrv.log"
            log.write_bytes(b"")
            elapsed = [0.0]
            events = []

            def append(text):
                with log.open("ab") as handle:
                    handle.write(text.encode("gb18030") + b"\n")

            class FakeProcess:
                def __init__(self, name):
                    self.name, self.returncode, self.stdin = name, None, self
                def poll(self):
                    return self.returncode
                def write(self, value):
                    events.append(value.decode().strip())
                    if value == b"drainstatus\n":
                        append("MIR2_DRAIN_STATUS players=0 loading=0 saves=0")
                    elif value == b"save\n":
                        append(runner.SAVE_MARKER)
                    elif value == b"exit\n":
                        append("没有玩家在线，游戏引擎服务已停止...Bye!")
                def flush(self):
                    pass
                def terminate(self):
                    if self.name == "GameSrv":
                        self.assert_complete = runner.has_log_marker(log.read_bytes(), runner.WORLD_STOPPED_MARKER)
                    events.append("terminate:" + self.name)
                    self.returncode = 0
                def wait(self, timeout):
                    return self.returncode

            def sleep(seconds):
                elapsed[0] += seconds
                if elapsed[0] >= 30 and not runner.has_log_marker(log.read_bytes(), runner.WORLD_STOPPED_MARKER):
                    append(runner.WORLD_STOPPED_MARKER)

            processes = {name: FakeProcess(name) for name, _, _ in runner.SERVICES}
            with patch.object(runner, "LOGS", Path(temporary)), patch.object(runner.time, "monotonic", lambda: elapsed[0]), patch.object(runner.time, "sleep", sleep):
                runner.stop_services(processes, {}, timeout=60)
            self.assertTrue(processes["GameSrv"].assert_complete)
            self.assertGreaterEqual(elapsed[0], 30)
            self.assertLess(events.index("terminate:GameGate"), events.index("drainstatus"))
            self.assertLess(events.index("terminate:GameSrv"), events.index("terminate:DBSrv"))

    def test_shutdown_timeout_keeps_world_and_database_alive_and_retry_waits(self):
        runner = load_script("run-server-native")
        with tempfile.TemporaryDirectory() as temporary:
            log = Path(temporary) / "GameSrv.log"
            log.write_bytes("没有玩家在线，游戏引擎服务已停止...Bye!".encode("utf-8"))
            elapsed = [0.0]
            from unittest.mock import Mock
            processes = {name: Mock() for name in ("GameSrv", "DBSrv", "LoginSrv")}
            for process in processes.values():
                process.poll.return_value = None
            shutdown = {"exit_sent": True, "exit_offset": 0}
            with patch.object(runner, "LOGS", Path(temporary)), patch.object(runner.time, "monotonic", lambda: elapsed[0]), patch.object(runner.time, "sleep", lambda seconds: elapsed.__setitem__(0, elapsed[0] + seconds)):
                with self.assertRaisesRegex(RuntimeError, "World shutdown not complete"):
                    runner.stop_services(processes, shutdown, timeout=1)
                for process in processes.values():
                    process.terminate.assert_not_called()
                with log.open("ab") as handle:
                    handle.write(runner.WORLD_STOPPED_MARKER.encode("utf-8"))
                runner.stop_services(processes, shutdown, timeout=1)
            processes["GameSrv"].stdin.write.assert_not_called()
            processes["GameSrv"].terminate.assert_called_once()
            processes["DBSrv"].terminate.assert_called_once()

    def test_stop_retry_ignores_previous_failed_request(self):
        runner = load_script("run-server-native")
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            lock, stop = root / "lock", root / "stop"
            lock.touch()
            calls = []
            def read_state():
                calls.append(1)
                if len(calls) == 1:
                    return {"status": "stop-failed", "stopRequestId": "previous"}
                return {"status": "stopped", "stopRequestId": json.loads(stop.read_text())["requestId"]}
            with patch.object(runner, "LOCK", lock), patch.object(runner, "STOP", stop), patch.object(runner, "read_state", read_state), patch.object(runner.os, "name", "nt"), patch.object(runner.sys, "argv", ["run-server-native.py", "stop", "--stop-timeout", "1"]), patch.object(runner.time, "sleep"), patch("sys.stdout", new=io.StringIO()):
                runner.main()
            self.assertEqual(len(calls), 2)

    def test_native_endpoints_and_redirects_match_without_overwriting_world_settings(self):
        prepare = load_script("prepare-runtime")
        runner = load_script("run-server-native")
        with tempfile.TemporaryDirectory() as temporary:
            runtime = Path(temporary)
            server = runtime / "server"
            for directory, filename in [("Mir200", "server.conf"), ("DBServer", "dbsvr.conf"),
                    ("LoginSrv", "logsrv.conf"), ("LoginGate", "config.conf"),
                    ("SelGate", "config.conf"), ("RunGate", "config.conf")]:
                target = server / directory / filename
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text("[WorldCustom]\nKeepValue=42\n", encoding="utf-8")
            save = server / "Mir200/player-save.dat"
            save.write_bytes(b"existing player save")
            with patch.object(prepare, "SERVER", server), patch.object(runner, "RUNTIME", runtime):
                prepare.configure_native_windows("test-only-password", 13306, 7000, 17100, 17200)
                services = runner.configured_services()
                self.assertEqual([row[2] for row in services[3:]], [(7000,), (17100,), (17200,)])
                for directory, filename in [("Mir200", "server.conf"), ("DBServer", "dbsvr.conf"),
                        ("LoginSrv", "logsrv.conf")]:
                    config = configparser.ConfigParser(interpolation=None)
                    config.read(server / directory / filename, encoding="utf-8-sig")
                    self.assertEqual(config["WorldCustom"]["KeepValue"], "42")
                    self.assertIn("server=127.0.0.1;port=13306;", config["DataBase"]["ConnctionString"])
                self.assertIn("127.0.0.1:17100", (server / "LoginSrv/AddrTable.txt").read_text(encoding="utf-8-sig"))
                self.assertEqual((server / "DBServer/ServerInfo.txt").read_text(encoding="utf-8-sig").split()[-1], "17200")
                self.assertEqual((server / "Mir200/!servertable.txt").read_text(encoding="utf-8-sig").split()[-1], "17200")
                self.assertEqual(save.read_bytes(), b"existing player save")
                # A second preparation can change the entry port without a
                # stale listener or stale redirect surviving the refresh.
                prepare.configure_native_windows("test-only-password", 13306, 17000, 17101, 17201)
                self.assertEqual([row[2] for row in runner.configured_services()[3:]], [(17000,), (17101,), (17201,)])
                self.assertIn("127.0.0.1:17101", (server / "LoginSrv/AddrTable.txt").read_text(encoding="utf-8-sig"))

    def test_docker_default_does_not_refresh_existing_configuration(self):
        prepare = load_script("prepare-runtime")
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "source/LoginGate"
            target = root / "server/LoginGate"
            source.mkdir(parents=True)
            target.mkdir(parents=True)
            (source / "config.conf").write_text("[LoginGate]\nGatePort0=7000\n", encoding="utf-8")
            (target / "config.conf").write_text("[LoginGate]\nGatePort0=7001\n", encoding="utf-8")
            with patch.object(prepare, "SOURCE", root / "source"), patch.object(prepare, "SERVER", root / "server"):
                prepare.configure("LoginGate", "config.conf", "config.conf", {"LoginGate": {"GatePort0": 7000}})
            self.assertIn("GatePort0=7001", (target / "config.conf").read_text())


if __name__ == "__main__":
    unittest.main()
