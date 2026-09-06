#!/usr/bin/env python3
"""Build a trackable spawn/drop catalog from the locked classic map list."""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROFILE = ROOT / "content/classic-176/version-profile.json"
MONGEN = ROOT / "vendor/mirserver-data/Mir200/Envir/MonGen.txt"
MONITEMS = ROOT / "vendor/mirserver-data/Mir200/Envir/MonItems"
SQL = ROOT / ".runtime/sql/02-mir2_data.sql"
VISUALS = ROOT / "apps/web/src/monster-visuals.ts"


def _read(path: Path) -> str:
    raw = path.read_bytes()
    if raw.startswith(b"\xef\xbb\xbf"):
        return raw.decode("utf-8-sig")
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("gb18030")


def _base_name(name: str) -> str:
    return re.sub(r"\d+$", "", name)


def _drop_path(name: str) -> Path | None:
    for candidate in (name, _base_name(name)):
        if not candidate:
            continue
        path = MONITEMS / f"{candidate}.txt"
        if path.is_file():
            return path
    return None


def _sql_names() -> set[str]:
    names: set[str] = set()
    if not SQL.is_file():
        return names
    for line in SQL.read_text(encoding="utf-8", errors="replace").splitlines():
        if "INSERT INTO `monsters`" not in line:
            continue
        match = re.search(r"VALUES \(\d+,\s*'([^']*)'", line)
        if match:
            names.add(match.group(1))
    return names


KNOWN_SQL_GAPS = {"神鹰", "飞火流星", "骷髅王"}


def _sql_match(name: str, sql_names: set[str]) -> bool:
    candidates = {name, _base_name(name)}
    for item in list(candidates):
        for prefix in ("暗之", "邪恶"):
            if item.startswith(prefix):
                rest = item[len(prefix):]
                candidates.add(rest)
                candidates.add(_base_name(rest))
        swapped = item.replace("护卫", "守卫")
        if swapped != item:
            candidates.add(swapped)
            candidates.add(_base_name(swapped))
    if candidates & sql_names:
        return True
    return any(sql.startswith(name) for sql in sql_names)


def _visual_names() -> set[str]:
    return set(re.findall(r"'([^']+)'", VISUALS.read_text(encoding="utf-8")))


def audit() -> dict:
    profile = json.loads(PROFILE.read_text(encoding="utf-8"))
    allowed = {str(map_id) for map_id in profile["p0Baseline"]["maps"]}
    allowed_fold = {map_id.casefold(): map_id for map_id in allowed}
    counts: dict[str, dict[str, object]] = {}
    for line in _read(MONGEN).splitlines():
        text = line.strip()
        if not text or text.startswith((";", "；")):
            continue
        fields = text.split()
        if len(fields) < 4:
            continue
        map_id = allowed_fold.get(fields[0].casefold())
        if map_id is None:
            continue
        name = fields[3]
        entry = counts.setdefault(name, {"name": name, "spawns": 0, "maps": set()})
        entry["spawns"] = int(entry["spawns"]) + 1
        maps = entry["maps"]
        assert isinstance(maps, set)
        maps.add(map_id)
    sql_names = _sql_names()
    visual_names = _visual_names()
    monsters = []
    missing_sql = []
    missing_drops = []
    missing_visuals = []
    for name in sorted(counts, key=lambda item: (-int(counts[item]["spawns"]), item)):
        drop = _drop_path(name)
        in_sql = _sql_match(name, sql_names)
        in_visual = name in visual_names or _base_name(name) in visual_names
        maps = sorted(counts[name]["maps"])  # type: ignore[arg-type]
        monsters.append({
            "name": name,
            "spawns": counts[name]["spawns"],
            "maps": maps,
            "dropFile": None if drop is None else str(drop.relative_to(ROOT)),
            "inSql": in_sql,
            "hasVisual": in_visual,
        })
        if not in_sql:
            missing_sql.append(name)
        if drop is None:
            missing_drops.append(name)
        if not in_visual:
            missing_visuals.append(name)
    baseline = list(profile["p0Baseline"]["monsters"])
    missing_baseline = [name for name in baseline if name not in counts]
    declared_sql_gaps = list(profile.get("worldCatalog", {}).get("knownSqlGaps", sorted(KNOWN_SQL_GAPS)))
    unexpected_sql = [name for name in missing_sql if name not in set(declared_sql_gaps)]
    return {
        "ok": not unexpected_sql and not missing_baseline,
        "uniqueMonsters": len(monsters),
        "spawnRows": sum(int(item["spawns"]) for item in monsters),
        "dropFiles": len(monsters) - len(missing_drops),
        "visuals": len(monsters) - len(missing_visuals),
        "missingSql": missing_sql,
        "unexpectedSql": unexpected_sql,
        "knownSqlGaps": declared_sql_gaps,
        "missingDrops": missing_drops,
        "missingVisuals": missing_visuals,
        "missingBaseline": missing_baseline,
        "monsters": monsters,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", type=Path, help="write JSON report")
    args = parser.parse_args()
    report = audit()
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "ok": report["ok"],
        "uniqueMonsters": report["uniqueMonsters"],
        "dropFiles": report["dropFiles"],
        "visuals": report["visuals"],
        "missingSql": len(report["missingSql"]),
        "missingDrops": len(report["missingDrops"]),
        "missingVisuals": len(report["missingVisuals"]),
    }, ensure_ascii=False))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
