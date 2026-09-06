#!/usr/bin/env python3
"""Audit explicit browser visual routes for the pinned classic skill catalogue."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RULES = ROOT / "content/classic-176/skill-rules.json"
SOURCE = ROOT / "apps/web/src/magic-effects.ts"
ASSETS = ROOT / "content/classic-176/asset-sources.json"


def ranges_for(library: str) -> list[tuple[int, int]]:
    data = json.loads(ASSETS.read_text(encoding="utf-8"))
    name = "Magic.Lib" if library == "Magic" else "Magic2.Lib"
    return [tuple(pair) for entry in data["effectFiles"] if entry["file"] == name for pair in entry["ranges"]]


def in_ranges(library: str, start: int, count: int) -> bool:
    end = start + count - 1
    return any(start >= lower and end <= upper for lower, upper in ranges_for(library))


def audit() -> dict[str, object]:
    skills = json.loads(RULES.read_text(encoding="utf-8"))["skills"]
    source = SOURCE.read_text(encoding="utf-8")
    routes: dict[int, dict[str, object] | None] = {}
    for match in re.finditer(r"^\s*(\d+):\s*(null|\{[^\n]+\}),?", source, re.MULTILINE):
        magic_id = int(match.group(1))
        value = match.group(2)
        if value == "null":
            routes[magic_id] = None
            continue
        library = re.search(r"library:'(Magic2?)'", value)
        start = re.search(r"start:(\d+)", value)
        count = re.search(r"count:(\d+)", value)
        interval = re.search(r"interval:(\d+)", value)
        if not all((library, start, count, interval)):
            routes[magic_id] = {"invalid": value}
        else:
            routes[magic_id] = {
                "library": library.group(1),
                "start": int(start.group(1)),
                "count": int(count.group(1)),
                "interval": int(interval.group(1)),
            }

    missing: list[str] = []
    invalid: list[str] = []
    expected_passive: list[int] = []
    for name, skill in skills.items():
        magic_id = skill["magicId"]
        route = routes.get(magic_id, "missing")
        passive = skill["effectType"] == 0
        if passive:
            expected_passive.append(magic_id)
            if route is not None:
                invalid.append(f"{name}({magic_id}) must be null for passive skill")
        elif route in (None, "missing"):
            missing.append(f"{name}({magic_id})")
        elif "invalid" in route:
            invalid.append(f"{name}({magic_id}) has malformed route")
        elif not in_ranges(route["library"], route["start"], route["count"]):
            invalid.append(f"{name}({magic_id}) frames exceed {route['library']} ranges")

    return {
        "ok": not missing and not invalid,
        "expected": len(skills),
        "routes": {str(magic_id): route for magic_id, route in sorted(routes.items()) if magic_id in {skill["magicId"] for skill in skills.values()}},
        "passiveMagicIds": sorted(expected_passive),
        "missing": missing,
        "invalid": invalid,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", type=Path, help="write the report to this path")
    args = parser.parse_args()
    report = audit()
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
