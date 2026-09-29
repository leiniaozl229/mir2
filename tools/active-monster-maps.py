#!/usr/bin/env python3
"""List configured monster spawns for maps enabled in the local runtime."""

from __future__ import annotations

import argparse
from collections import defaultdict
import csv
import json
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]


def rows(runtime: Path) -> list[tuple[str, str, int, int, str]]:
    active = set(json.loads((runtime / "p0-world.json").read_text(encoding="utf-8"))["maps"])
    envir = runtime / "server/Mir200/Envir"
    names: dict[str, str] = {}
    for line in (envir / "MapInfo.txt").read_text(encoding="utf-8-sig").splitlines():
        match = re.match(r"^\[([^\]]+)\]", line.strip())
        if match:
            parts = match.group(1).split(None, 1)
            names[parts[0].split("|", 1)[0]] = parts[1] if len(parts) > 1 else ""
    spawns: dict[str, list[tuple[str, int]]] = defaultdict(list)
    for line in (envir / "MonGen.txt").read_text(encoding="utf-8-sig").splitlines():
        if not line.strip() or line.lstrip().startswith(";"):
            continue
        parts = line.split()
        if len(parts) < 7 or parts[0] not in active:
            continue
        try:
            count = int(parts[5])
        except ValueError:
            continue
        if count > 0:
            spawns[parts[0]].append((parts[3], count))
    return [
        (map_id, names.get(map_id, ""), len(definitions),
         sum(count for _, count in definitions),
         "、".join(sorted({monster for monster, _ in definitions})))
        for map_id, definitions in sorted(spawns.items())
    ]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime", type=Path, default=ROOT / ".runtime")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = rows(args.runtime)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8-sig", newline="") as target:
        writer = csv.writer(target)
        writer.writerow(("地图ID", "地图名", "刷怪点数", "配置怪物数", "怪物种类"))
        writer.writerows(report)
    print(f"{len(report)} maps with configured monsters: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
