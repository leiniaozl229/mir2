"""Rebuild high-level playtest loot from the classic tables, without rate drift."""

from __future__ import annotations

import json
import math
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "content/classic-176/p0/drop-balance-catalog.json"
SOURCE = ROOT / "vendor/mirserver-data/Mir200/Envir/MonItems"
ENTRY = re.compile(r"^\s*(\d+)\s*/\s*(\d+)\s+(\S+)(.*)$")
GEAR_MODES = {5, 6, 10, 11, 15, 19, 20, 22, 23, 24, 26}
FALLBACK_GEAR = ("炼狱", "魔杖", "银蛇")


def _rate_line(name: str, rest: str, probability: float) -> str:
    points = max(1, min(1000, math.floor(probability * 1000 + 0.5)))
    return f"{points}/1000  {name}{rest}"


def _scaled_probability(selected: int, maximum: int, multiplier: float) -> float:
    return min(1.0, selected / maximum * multiplier)


def render_table(source: str, *, multiplier: float, balanced: bool,
                 monster: dict, items: dict) -> str:
    """Preserve baseline entries while limiting clutter and promoting useful loot."""
    entries = []
    for line in source.splitlines():
        match = ENTRY.match(line)
        if match:
            selected, maximum = int(match[1]), int(match[2])
            if selected > 0 and maximum > 0:
                entries.append((selected, maximum, match[3], match[4]))
    if not balanced:
        return "\n".join(
            _rate_line(name, rest, _scaled_probability(selected, maximum, multiplier))
            for selected, maximum, name, rest in entries
        ) + "\n"

    gear_entries = [(selected, maximum, name, rest) for selected, maximum, name, rest in entries
                    if items.get(name, {}).get("mode") in GEAR_MODES]
    gear_chances = sorted({selected / maximum for selected, maximum, _, _ in gear_entries})
    repeated_supplies = sum(selected >= maximum and items.get(name, {}).get("mode") == 0
                            for selected, maximum, name, _ in entries)
    boss = monster["hp"] >= 1000 and monster["exp"] >= 1000 and (
        repeated_supplies >= 6 or monster["hp"] >= 2500)
    common_gear_chance = gear_chances[-1] if len(gear_chances) > 1 else None
    supply_names = sorted({name for _, _, name, _ in entries
                           if items.get(name, {}).get("mode") == 0},
                          key=lambda name: (-items[name]["price"], name))
    supply_budget = 8 if boss else 4
    allowed_supplies = {}
    for name in supply_names:
        allowance = min(2 if boss else 1, supply_budget)
        if allowance:
            allowed_supplies[name] = allowance
            supply_budget -= allowance
    output = []
    supplies = {}
    kept_gear = set()
    for selected, maximum, name, rest in entries:
        item = items.get(name)
        if name != "金币" and item is None:
            continue  # the imported tables contain names absent from stditems
        raw_chance = selected / maximum
        mode = item["mode"] if item else None
        if mode == 0:
            count = supplies.get(name, 0)
            if count >= allowed_supplies.get(name, 0):
                continue
            supplies[name] = count + 1
            chance = min(1.0, _scaled_probability(selected, maximum, multiplier))
        elif mode in GEAR_MODES:
            if boss and len(gear_entries) > 3 and (
                raw_chance >= 0.08 or
                (common_gear_chance is not None and raw_chance == common_gear_chance)):
                continue
            if not boss and common_gear_chance is not None and raw_chance == common_gear_chance:
                continue
            if not boss and common_gear_chance is None and item["price"] < 10000:
                continue
            scaled = _scaled_probability(selected, maximum, multiplier)
            if boss:
                floor = 0.08 if item["price"] >= 20000 else 0.04
                ceiling = 0.24 if item["price"] >= 20000 else 0.12
                chance = min(ceiling, max(floor, scaled * 2))
            else:
                floor = 0.07 if item["price"] >= 20000 else 0.04
                chance = min(0.12, max(floor, scaled * 2))
            kept_gear.add(name)
        elif mode == 4:  # skill books are useful, but dozens should not be guaranteed
            chance = min(0.15 if boss else 0.08,
                         max(0.03, _scaled_probability(selected, maximum, multiplier)))
        elif mode == 3:
            chance = min(0.35, _scaled_probability(selected, maximum, multiplier))
        else:
            chance = _scaled_probability(selected, maximum, multiplier)
        output.append(_rate_line(name, rest, chance))

    if monster["level"] >= 50 and monster["exp"] >= 300 and len(kept_gear) < 3:
        for name in FALLBACK_GEAR:
            if name not in kept_gear:
                output.append(_rate_line(name, "", 0.15 if boss else 0.08))
    return "\n".join(output) + "\n"


def reconcile_tables(runtime_mon_items: Path, multiplier: float,
                     balanced: bool, apply: bool) -> dict:
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    changed = 0
    missing = []
    for name, monster in catalog["monsters"].items():
        source = SOURCE / f"{name}.txt"
        if not source.exists() and name == "剧毒蜘蛛":
            source = SOURCE / "月魔蜘蛛.txt"
        if not source.exists():
            missing.append(name)
            continue
        target = runtime_mon_items / f"{name}.txt"
        original = source.read_bytes().decode("gb18030")
        result = render_table(original, multiplier=multiplier, balanced=balanced,
                              monster=monster, items=catalog["items"])
        data = result.encode("gb18030")
        if not target.exists() or target.read_bytes() != data:
            changed += 1
            if apply:
                target.write_bytes(data)
    if missing:
        raise FileNotFoundError(f"Missing classic drop tables: {', '.join(missing)}")
    return {"monsters": len(catalog["monsters"]), "filesChanged": changed,
            "balanced": balanced}
