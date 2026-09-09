#!/usr/bin/env python3
"""Check that a local tree can be built, started, backed up, and restored."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def have(command: str) -> bool:
    return shutil.which(command) is not None


def check() -> dict:
    failures: list[str] = []
    notes: list[str] = []
    required = {
        "PLAN.md": ROOT / "PLAN.md",
        "compose": ROOT / "compose.yaml",
        "backup": ROOT / "scripts/backup.py",
        "waitReady": ROOT / "scripts/wait-ready.py",
        "composeScript": ROOT / "scripts/compose.sh",
        "prepareRuntime": ROOT / "scripts/prepare-runtime.py",
        "versionProfile": ROOT / "content/classic-176/version-profile.json",
        "gateway": ROOT / "services/web-gateway",
        "playPage": ROOT / "apps/web/play.html",
    }
    for name, path in required.items():
        if not path.exists():
            failures.append(f"missing:{name}")
    tools = {"python3": have("python3"), "git": have("git"), "docker": have("docker") or have("docker-compose")}
    if not tools["python3"]:
        failures.append("tool:python3")
    if not tools["git"]:
        failures.append("tool:git")
    if not tools["docker"]:
        failures.append("tool:docker")
    if not have("docker-compose") and not have("docker"):
        notes.append("install Docker Compose or docker-compose")
    runtime = ROOT / ".runtime"
    notes.append("runtimeReady" if (runtime / "server/Mir200").exists() else "run python3 scripts/prepare-runtime.py")
    return {
        "ok": not failures,
        "failures": failures,
        "tools": tools,
        "notes": notes,
        "commands": {
            "install": [
                "git submodule update --init --recursive  # initializes vendor/mirserver-data",
                "bash scripts/build-server.sh",
                "bash scripts/build-gateway.sh",
                "python3 scripts/prepare-runtime.py",
                "bash scripts/compose.sh up -d",
                "python3 scripts/wait-ready.py",
            ],
            "backup": ["python3 scripts/backup.py create"],
            "restore": ["python3 scripts/backup.py restore .runtime/backups/<archive>.tar.gz --yes"],
            "client": ["npm ci", "npm run dev"],
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", type=Path, help="write JSON report")
    args = parser.parse_args()
    report = check()
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": report["ok"], "failures": report["failures"]}, ensure_ascii=False))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
