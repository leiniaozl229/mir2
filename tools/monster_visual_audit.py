#!/usr/bin/env python3
"""Audit classic monster names against the browser's RaceImg/Appr visual map."""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SQL = ROOT / ".runtime/sql/02-mir2_data.sql"
PROFILE = ROOT / "content/classic-176/version-profile.json"
RULES = ROOT / "apps/web/src/monster-visuals.ts"
ASSET_ROOT = ROOT / "dist/web/actors"


def load_monsters() -> dict[str, list[dict[str, int | str]]]:
    result: dict[str, list[dict[str, int | str]]] = {}
    pattern = re.compile(r"VALUES \((\d+), '([^']+)', (\d+), (\d+), (\d+),")
    for line in SQL.read_text(encoding="utf-8").splitlines():
        match = pattern.search(line)
        if not match:
            continue
        idx, name, race, race_img, appr = match.groups()
        row = {"idx": int(idx), "race": int(race), "raceImg": int(race_img), "appr": int(appr)}
        result.setdefault(name, []).append(row)
        result.setdefault(name.rstrip("0123456789"), []).append(row)
    return result


def load_rules() -> list[dict[str, object]]:
    source = RULES.read_text(encoding="utf-8")
    rows = re.findall(
        r"\{raceImg:(\d+),appr:(\d+),library:'([^']+)',quality:'(exact|candidate)',names:\[([^]]*)\]\}",
        source,
    )
    return [
        {
            "raceImg": int(race_img),
            "appr": int(appr),
            "library": library,
            "quality": quality,
            "names": re.findall(r"'([^']+)'", names),
        }
        for race_img, appr, library, quality, names in rows
    ]


def audit() -> dict[str, object]:
    profile = json.loads(PROFILE.read_text(encoding="utf-8"))
    expected = profile["p0Baseline"]["monsters"]
    monsters = load_monsters()
    rules = load_rules()
    by_pair = {(row["raceImg"], row["appr"]): row for row in rules}
    missing = []
    candidates = []
    covered = []
    for name in expected:
        rows = monsters.get(name) or monsters.get(name.rstrip("0123456789"), [])
        if not rows:
            missing.append({"name": name, "reason": "not in pinned monster SQL"})
            continue
        pairs = sorted({(int(row["raceImg"]), int(row["appr"])) for row in rows})
        selected = [by_pair.get(pair) for pair in pairs if by_pair.get(pair)]
        if not selected:
            missing.append({"name": name, "pairs": [f"{a}:{b}" for a, b in pairs]})
            continue
        if any(row["quality"] == "candidate" for row in selected):
            candidates.append({"name": name, "pairs": [f"{a}:{b}" for a, b in pairs], "libraries": sorted({str(row["library"]) for row in selected})})
        if any(not (ASSET_ROOT / str(row["library"]) / "library.json").exists() for row in selected):
            missing.append({"name": name, "pairs": [f"{a}:{b}" for a, b in pairs], "reason": "library.json missing"})
        else:
            covered.append(name)
    return {
        "ok": not missing,
        "expected": len(expected),
        "covered": len(covered),
        "candidateCount": len(candidates),
        "missing": missing,
        "candidates": candidates,
        "rules": len(rules),
        "assetRoot": str(ASSET_ROOT),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = audit()
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, separators=(",", ":") if args.json else None))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
