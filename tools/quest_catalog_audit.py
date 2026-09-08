#!/usr/bin/env python3
"""Audit classic MapQuest definitions and their map-script dependencies."""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_ENVIR = ROOT / "vendor/mirserver-data/Mir200/Envir"
RUNTIME_ENVIR = ROOT / ".runtime/server/Mir200/Envir"


def _read_text(path: Path) -> str:
    raw = path.read_bytes()
    if raw.startswith(b"\xef\xbb\xbf"):
        return raw.decode("utf-8-sig")
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("gb18030")


def parse_map_quests(path: Path) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    if not path.exists():
        return rows
    for number, raw_line in enumerate(_read_text(path).splitlines(), 1):
        line = raw_line.strip()
        if not line or line.startswith((";", "；")):
            continue
        fields = line.split()
        if len(fields) < 6:
            rows.append({"line": str(number), "raw": line, "error": "expected six fields"})
            continue
        rows.append({
            "line": str(number),
            "map": fields[0],
            "flag": fields[1],
            "value": fields[2],
            "monster": fields[3],
            "item": fields[4],
            "npc": fields[5],
            "raw": line,
        })
    return rows


def _map_ids(envir: Path) -> set[str]:
    map_info = envir / "MapInfo.txt"
    ids: set[str] = set()
    if map_info.exists():
        for line in _read_text(map_info).splitlines():
            if line.startswith("[") and " " in line:
                ids.add(line[1:].split(None, 1)[0].casefold())
    return ids


def _quest_bindings(envir: Path) -> dict[str, set[str]]:
    bindings: dict[str, set[str]] = {}
    map_info = envir / "MapInfo.txt"
    if not map_info.exists():
        return bindings
    for line in _read_text(map_info).splitlines():
        match = re.match(r"^\[([^\]]+)\](.*)$", line)
        if not match:
            continue
        map_id = match.group(1).split(None, 1)[0].split("|", 1)[0].casefold()
        for quest in re.findall(r"CHECKQUEST\(([^)]+)\)", match.group(2), re.I):
            bindings.setdefault(map_id, set()).add(quest.strip())
    return bindings


def _quest_trigger_scripts(envir: Path, quest_id: str) -> list[str]:
    """Find NPC scripts that start or route the named MapQuest."""
    matches = []
    for path in sorted((envir / "Market_Def").rglob("*.txt")):
        try:
            text = _read_text(path)
        except (OSError, UnicodeDecodeError):
            continue
        if re.search(rf"(?:CHECKHUM|MONGENEX|MAP)\s+{re.escape(quest_id)}\b", text, re.I):
            matches.append(path.relative_to(envir / "Market_Def").as_posix())
    return matches


def _runtime_mode(root: Path, runtime_envir: Path, requested: str) -> str:
    if requested != "auto":
        return requested
    marker = root / ".runtime/p0-world.json"
    try:
        return "classic-route" if json.loads(marker.read_text(encoding="utf-8")).get("classicRoute") else "p0"
    except (OSError, ValueError):
        return "classic-route" if parse_map_quests(runtime_envir / "MapQuest.txt") else "p0"


def audit(root: Path = ROOT, runtime: Path | None = None, runtime_mode: str = "auto") -> dict:
    source = root / "vendor/mirserver-data/Mir200/Envir"
    runtime_envir = runtime or (root / ".runtime/server/Mir200/Envir")
    source_rows = parse_map_quests(source / "MapQuest.txt")
    runtime_rows = parse_map_quests(runtime_envir / "MapQuest.txt")
    runtime_mode = _runtime_mode(root, runtime_envir, runtime_mode)
    source_maps = _map_ids(source)
    runtime_maps = _map_ids(runtime_envir)
    source_bindings = _quest_bindings(source)
    runtime_bindings = _quest_bindings(runtime_envir)
    malformed = [row for row in source_rows + runtime_rows if "error" in row]
    missing_source_maps = sorted({row["map"] for row in source_rows if "map" in row and row["map"].casefold() not in source_maps})
    missing_runtime_maps = sorted({row["map"] for row in runtime_rows if "map" in row and row["map"].casefold() not in runtime_maps})
    source_scripts = sorted({row["npc"] for row in source_rows if "npc" in row})
    runtime_scripts = sorted({row["npc"] for row in runtime_rows if "npc" in row})
    missing_source_scripts = sorted(name for name in source_scripts if not (source / "MapQuest_def" / f"{name}.txt").exists())
    missing_runtime_scripts = sorted(name for name in runtime_scripts if not (runtime_envir / "MapQuest_def" / f"{name}.txt").exists())
    source_bound_quests = {quest.casefold() for quests in source_bindings.values() for quest in quests}
    runtime_bound_quests = {quest.casefold() for quests in runtime_bindings.values() for quest in quests}
    missing_source_bindings = sorted(
        row["map"] for row in source_rows if "map" in row and row["map"].casefold() not in source_bound_quests
    )
    missing_runtime_bindings = sorted(
        row["map"] for row in runtime_rows if "map" in row and row["map"].casefold() not in runtime_bound_quests
    )
    quest_ids = sorted({row["map"] for row in source_rows if "map" in row})
    source_triggers = {quest_id: _quest_trigger_scripts(source, quest_id) for quest_id in quest_ids}
    runtime_triggers = {quest_id: _quest_trigger_scripts(runtime_envir, quest_id) for quest_id in quest_ids}
    missing_runtime_triggers = sorted(
        quest_id for quest_id in quest_ids if not runtime_triggers.get(quest_id)
    )
    source_quest_ids = {row["map"] for row in source_rows if "map" in row}
    runtime_quest_ids = {row["map"] for row in runtime_rows if "map" in row}
    missing_runtime_entries = sorted(source_quest_ids - runtime_quest_ids) if runtime_mode == "classic-route" else []
    skipped_runtime_entries = sorted(source_quest_ids) if runtime_mode == "p0" else []
    source_errors = malformed or missing_source_maps or missing_source_scripts or missing_source_bindings
    runtime_errors = (missing_runtime_maps or missing_runtime_scripts or missing_runtime_bindings
                      or missing_runtime_triggers or missing_runtime_entries)
    return {
        "ok": not source_errors and (runtime_mode == "p0" or not runtime_errors),
        "runtimeMode": runtime_mode,
        "sourceEntries": len(source_rows),
        "runtimeEntries": len(runtime_rows),
        "expectedRuntimeEntries": 0 if runtime_mode == "p0" else len(source_rows),
        "skippedRuntimeEntries": skipped_runtime_entries,
        "missingRuntimeEntries": missing_runtime_entries,
        "sourceMaps": sorted(source_maps),
        "runtimeMaps": sorted(runtime_maps),
        "missingSourceMaps": missing_source_maps,
        "missingRuntimeMaps": missing_runtime_maps,
        "missingSourceScripts": missing_source_scripts,
        "missingRuntimeScripts": missing_runtime_scripts,
        "missingSourceBindings": missing_source_bindings,
        "missingRuntimeBindings": missing_runtime_bindings,
        "sourceTriggerScripts": source_triggers,
        "runtimeTriggerScripts": runtime_triggers,
        "missingRuntimeTriggers": missing_runtime_triggers,
        "malformed": malformed,
        "entries": source_rows,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", nargs="?", const="-", help="write JSON report to a file, or stdout")
    parser.add_argument("--runtime-mode", choices=("auto", "p0", "classic-route"), default="auto",
                        help="validate the selected P0 or classic-route runtime contract")
    args = parser.parse_args()
    report = audit(runtime_mode=args.runtime_mode)
    payload = json.dumps(report, ensure_ascii=False, indent=2)
    if args.json and args.json != "-":
        Path(args.json).parent.mkdir(parents=True, exist_ok=True)
        Path(args.json).write_text(payload + "\n", encoding="utf-8")
    else:
        print(payload)
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
