#!/usr/bin/env python3
"""Consolidate city shops/travel in a prepared local classic-route runtime."""

import importlib.util
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("prepare_runtime", ROOT / "scripts/prepare-runtime.py")
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)
services = prepare.city_services


def main():
    envir = ROOT / ".runtime/server/Mir200/Envir"
    merchants = envir / "Merchant.txt"
    map_info = envir / "MapInfo.txt"
    if not merchants.is_file() or not map_info.is_file():
        raise SystemExit("Prepare the local native runtime before installing city services.")
    active_maps = set(re.findall(r"^\[([^\s\]]+)", prepare.read_text(map_info), re.M))
    lines = prepare.read_text(merchants).splitlines()
    retained = [normalized for line in lines
                if (normalized := services.normalize_merchant(line)) is not None]
    removed = [line for line in lines if not services.keep_merchant(line)]
    source_quests = prepare._filtered_route_definitions(
        prepare.SOURCE / "Mir200/Envir/Merchant.txt", 1, active_maps
    )
    quest_definitions = [services.normalize_merchant(line) for line in source_quests
                         if tuple(line.split()[:2]) in services.QUEST_ONLY_SHOPS]
    definitions = quest_definitions + list(services.service_definitions(active_maps))
    normalized = {" ".join(line.split()) for line in retained}
    added = 0
    for definition in definitions:
        if definition not in normalized:
            retained.append(definition)
            normalized.add(definition)
            added += 1
    updated = "\n".join(retained) + "\n"
    if updated != prepare.read_text(merchants):
        merchants.write_text(updated, encoding="utf-8-sig")

    shop = prepare.read_text(ROOT / "content/classic-176/p0/city-general-merchant.txt")
    travel = services.build_travel_script()
    scripts = envir / "Market_Def/测试"
    scripts.mkdir(parents=True, exist_ok=True)
    for map_id in {hub[1] for hub in services.CITY_HUBS if hub[1] in active_maps}:
        (scripts / f"综合商人-{map_id}.txt").write_text(shop, encoding="gb18030")
        (scripts / f"区域传送-{map_id}.txt").write_text(travel, encoding="gb18030")
    for script_name, map_id in services.QUEST_ONLY_SHOPS:
        if map_id not in active_maps:
            continue
        source_quest = prepare.SOURCE / f"Mir200/Envir/Market_Def/{script_name}-{map_id}.txt"
        target_quest = envir / f"Market_Def/{script_name}-{map_id}.txt"
        target_quest.parent.mkdir(parents=True, exist_ok=True)
        target_quest.write_text(
            services.quest_only_script(prepare.read_text(source_quest)), encoding="gb18030"
        )

    starts = envir / "StartPoint.txt"
    if starts.is_file():
        start_lines = prepare.read_text(starts).splitlines()
        overrides = {"5": (139, 330), "11": (187, 301)}
        for index, line in enumerate(start_lines):
            fields = line.split()
            if fields and fields[0] in overrides:
                map_id = fields[0]
                x, y = overrides[map_id]
                start_lines[index] = f"{map_id} {x} {y}"
        new_starts = "\n".join(start_lines) + "\n"
        if new_starts != prepare.read_text(starts):
            starts.write_text(new_starts, encoding="utf-8-sig")

    print(f"City services: {len(definitions)} service/quest NPCs, {added} added, {len(removed)} retired entries")
    for line in removed:
        print("retired:", line)


if __name__ == "__main__":
    main()
