#!/usr/bin/env python3
"""Check installation prerequisites for an explicit delivery mode (read only)."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def have(command: str) -> bool:
    return shutil.which(command) is not None


def probe(argv: list[str]) -> str | None:
    try:
        result = subprocess.run(argv, capture_output=True, text=True, encoding="utf-8",
                                errors="replace", timeout=15, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return result.stdout if result.returncode == 0 else None


def powershell_command(*argv: str) -> str:
    return "& " + " ".join("'" + arg.replace("'", "''") + "'" for arg in argv)


def node_supported(command: str) -> bool:
    # Vite 7.1.5's pinned package engines: ^20.19.0 || >=22.12.0.
    match = re.fullmatch(r"v?(\d+)\.(\d+)\.(\d+)\s*", probe([command, "--version"]) or "")
    if not match:
        return False
    major, minor, _ = map(int, match.groups())
    return (major == 20 and minor >= 19) or (major == 22 and minor >= 12) or major > 22


def check(mode: str = "compose", *, dotnet: str = "dotnet", node: str = "node",
          npm: str = "npm", mysql: str = "mysql") -> dict:
    if mode not in ("compose", "native-windows"):
        raise ValueError(f"unsupported installation mode: {mode}")
    failures: list[str] = []
    notes: list[str] = []
    required = {
        "PLAN.md": ROOT / "PLAN.md",
        "backup": ROOT / "scripts/backup.py",
        "prepareRuntime": ROOT / "scripts/prepare-runtime.py",
        "versionProfile": ROOT / "content/classic-176/version-profile.json",
        "gateway": ROOT / "services/web-gateway",
        "playPage": ROOT / "apps/web/play.html",
    }
    if mode == "compose":
        required.update(compose=ROOT / "compose.yaml", waitReady=ROOT / "scripts/wait-ready.py",
                        composeScript=ROOT / "scripts/compose.sh",
                        buildServer=ROOT / "scripts/build-server.sh",
                        buildGateway=ROOT / "scripts/build-gateway.sh")
    else:
        required.update(nativeRunner=ROOT / "scripts/run-server-native.py",
                        nativeBuild=ROOT / "scripts/build-server.ps1")
    for name, path in required.items():
        if not path.exists():
            failures.append(f"missing:{name}")
    tools = {"python": sys.version_info >= (3, 10), "git": have("git"),
             "node": have(node), "npm": have(npm)}
    tools["nodeVersionSupported"] = tools["node"] and node_supported(node)
    capabilities = {"backup": mode == "compose", "restore": mode == "compose"}
    gaps: list[str] = []
    if mode == "compose":
        tools.update(python3=have("python3"), bash=have("bash"), docker=have("docker"),
                     compose=have("docker-compose") or probe(["docker", "compose", "version"]) is not None)
    else:
        tools.update(windows=os.name == "nt", powershell=have("powershell"),
                     mysql=have(mysql), dotnet=have(dotnet))
        sdks = probe([dotnet, "--list-sdks"]) if tools["dotnet"] else None
        runtimes = probe([dotnet, "--list-runtimes"]) if tools["dotnet"] else None
        tools["gatewaySdk10"] = any(line.startswith("10.") for line in (sdks or "").splitlines())
        tools["serverRuntime8"] = any(line.startswith("Microsoft.NETCore.App 8.") for line in (runtimes or "").splitlines())
        tools["gatewayRuntime10"] = any(line.startswith("Microsoft.AspNetCore.App 10.") for line in (runtimes or "").splitlines())
        gaps.extend(("native-mysql-provisioning-not-automated", "native-backup-restore-not-implemented"))
        notes.append("Native MySQL must be provisioned separately; this check never initializes databases.")
        notes.append("backup.py create/restore and wait-ready.py use Compose; do not run them against native services.")
    failures.extend(f"tool:{name}" for name, available in tools.items() if not available)
    runtime = ROOT / ".runtime"
    notes.append("runtimeFilesPresent (not a readiness check)" if (runtime / "server/Mir200").exists()
                 else "prepare runtime files using this mode's install commands")
    commands = {
        "install": [
            "git submodule update --init --recursive  # initializes vendor/mirserver-data",
            "bash scripts/build-server.sh", "bash scripts/build-gateway.sh",
            "python3 scripts/prepare-runtime.py", "bash scripts/compose.sh up -d",
            "python3 scripts/wait-ready.py",
        ],
        "backup": ["python3 scripts/backup.py create"],
        "restore": ["python3 scripts/backup.py restore .runtime/backups/<archive>.tar.gz --yes"],
        "client": ["npm ci", "npm run dev"],
    }
    if mode == "native-windows":
        commands = {
            "install": ["git submodule update --init --recursive",
                        powershell_command("powershell", "-NoProfile", "-File", "scripts/build-server.ps1", "-DotNetPath", dotnet),
                        powershell_command(dotnet, "publish", "services/web-gateway", "-c", "Release", "-o", ".runtime/web-gateway"),
                        powershell_command(sys.executable, "scripts/prepare-runtime.py", "--native-windows")],
            "start": [powershell_command(sys.executable, "scripts/run-server-native.py", "start", "--dotnet", dotnet)],
            "status": [powershell_command(sys.executable, "scripts/run-server-native.py", "status")],
            "stop": [powershell_command(sys.executable, "scripts/run-server-native.py", "stop")],
            "backup": [], "restore": [],
            "client": [powershell_command(npm, "ci"), powershell_command(npm, "run", "dev")],
        }
        notes.append("Install commands target a stopped, prepared environment; do not overwrite running native binaries.")
        notes.append("Gateway launch/environment configuration and MySQL credentials are separate native setup steps.")
        gaps.append("native-gateway-launch-not-automated")
    return {
        "mode": mode,
        "scope": "installation-prerequisites-only",
        "nodeRequirement": "^20.19.0 || >=22.12.0 (Vite 7.1.5)",
        "ok": not failures,
        "failures": failures,
        "tools": tools,
        "notes": notes,
        "capabilities": capabilities,
        "deliveryComplete": not failures and not gaps,
        "deliveryGaps": gaps,
        "commands": commands,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", type=Path, help="write JSON report")
    parser.add_argument("--mode", choices=("compose", "native-windows"), default="compose")
    parser.add_argument("--dotnet", default="dotnet")
    parser.add_argument("--node", default="node")
    parser.add_argument("--npm", default="npm")
    parser.add_argument("--mysql", default="mysql")
    args = parser.parse_args()
    report = check(args.mode, dotnet=args.dotnet, node=args.node, npm=args.npm, mysql=args.mysql)
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": report["ok"], "failures": report["failures"]}, ensure_ascii=False))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
