#!/usr/bin/env python3
"""Build and validate the browser resource catalogue from authoritative game data."""

from __future__ import annotations

import argparse
import csv
import importlib.util
import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SQL = ROOT / ".runtime/sql/02-mir2_data.sql"
PROFILE = ROOT / "content/classic-176/version-profile.json"
RULES = ROOT / "content/classic-176/skill-rules.json"
COMBAT = ROOT / "content/classic-176/skill-combat.json"
ITEM_ASSETS = ROOT / "content/classic-176/item-assets.json"
SKILL_ASSETS = ROOT / "content/classic-176/skill-assets.json"
MONGEN = ROOT / "vendor/mirserver-data/Mir200/Envir/MonGen.txt"
MONITEMS = ROOT / "vendor/mirserver-data/Mir200/Envir/MonItems"
MAPINFO = ROOT / "vendor/mirserver-data/Mir200/Envir/MapInfo.txt"
MINIMAP = ROOT / "vendor/mirserver-data/Mir200/Envir/MiniMap.txt"
WEB = ROOT / "assets/web"
OUTPUT = ROOT / "content/classic-176/resource-catalog.json"
ACTIVE_SOURCES = ROOT / "content/classic-176/active-asset-sources.json"
ICON_USAGE = ROOT / "content/classic-176/icon-usage.json"
MAP_BINDINGS = ROOT / "content/classic-176/map-asset-bindings.json"


def map_selection_records(relative: str, data: dict[str, Any], contract: dict[str, Any]) -> list[dict[str, Any]]:
    """Current declared selections, gated by export/map manifest locks.

    The library's mapBindingActive is an immutable export-time snapshot. Full
    raw-source/pixel verification remains content_audit's responsibility.
    """
    records = []
    for binding in contract.get("bindings", []):
        if binding.get("namespace") != "/" + relative:
            continue
        valid = contract.get("schemaVersion") == 1 and contract.get("domain") == "map-asset-bindings"
        # This contract selects reference pixels only. A metadata flag cannot
        # upgrade the independently unverified historical pairing.
        valid = valid and binding.get("mapVersionPairingVerified") is False
        indices = binding.get("indices", [])
        preserve = binding.get("preserveNativeIndices", [])
        protected = binding.get("protectedNativeIndices", [])
        valid = valid and bool(indices) and all(type(index) is int and index >= 0 for index in indices)
        valid = valid and len(indices) == len(set(indices)) and not set(indices).intersection(preserve)
        valid = valid and set(protected).issubset(preserve)
        valid = valid and set(map(str, indices)) == set(data.get("frames", {}))
        valid = valid and binding.get("sourceSha256") == data.get("sourceSha256")
        valid = valid and binding.get("sourceFrameCount") == data.get("sourceFrameCount")
        valid = valid and binding.get("sourceFormat") == data.get("format")
        valid = valid and binding.get("sourceId") == data.get("candidateId")
        valid = valid and binding.get("layer") == "background" and binding.get("library") == "Tiles"
        valid = valid and binding.get("selectionPolicy") == "exact-missing-original-indices-only"
        map_data = {}
        for key in ("candidateManifest", "candidateRegistry", "mapManifest"):
            spec = binding.get(key, {})
            path = (ROOT / spec.get("path", "")).resolve()
            if not path.is_relative_to(ROOT.resolve()) or not path.is_file():
                valid = False
                continue
            valid = valid and path.stat().st_size == spec.get("bytes") and _source_module.sha256(path) == spec.get("sha256")
            if key == "mapManifest":
                map_data = json.loads(path.read_text(encoding="utf-8"))
        valid = valid and map_data.get("sourceSha256") == binding.get("mapSourceSha256")
        valid = valid and binding.get("mapManifest", {}).get("path") == f"assets/web/maps/{binding.get('mapId')}/map.json"
        selected = binding.get("status") == "enabled" and valid
        records.append({"id":binding.get("id"), "mapId":binding.get("mapId"), "layer":binding.get("layer"),
                        "library":binding.get("library"), "indexCount":len(indices), "status":binding.get("status"),
                        "selected":bool(selected), "manifestLocksMatch":bool(valid),
                        "sourceIntegrityScope":"manifest_locks_only; raw_source_and_pixels_in_content_audit",
                        "selectionEvidence":binding.get("selectionEvidence"),
                        "historicalPairingDeclared":binding.get("mapVersionPairingVerified"),
                        "historicalPairingVerified":False})
    return records

_source_spec = importlib.util.spec_from_file_location("resource_sources", Path(__file__).with_name("resource_sources.py"))
assert _source_spec is not None and _source_spec.loader is not None
_source_module = importlib.util.module_from_spec(_source_spec)
_source_spec.loader.exec_module(_source_module)

ITEM_COLUMNS = ["id", "name", "stdMode", "shape", "weight", "aniCount", "source", "reserved", "imgIndex", "duraMax", "ac", "acMax", "mac", "macMax", "dc", "dcMax", "mc", "mcMax", "sc", "scMax", "need", "needLevel", "price", "stock", "attackSpeed", "agility", "accuracy", "magicAvoid", "strong", "undead", "hpAdd", "mpAdd", "expAdd", "effectType1", "effectRate1", "effectValue1", "effectType2", "effectRate2", "effectValue2", "slowDown", "tox", "toxAvoid", "uniqueItem", "overlapItem", "light", "itemType", "itemSet", "reference"]
SKILL_COLUMNS = ["idx", "magicId", "name", "effectType", "effect", "spell", "power", "maxPower", "defSpell", "defPower", "defMaxPower", "job", "needLevel1", "train1", "needLevel2", "train2", "needLevel3", "train3", "delay", "description"]
MONSTER_COLUMNS = ["idx", "name", "race", "raceImg", "appr", "level", "undead", "coolEye", "experience", "hp", "mp", "ac", "mac", "dc", "dcMax", "mc", "sc", "speed", "hit", "walkSpeed", "walkStep", "walkWait", "attackSpeed", "unFireRate", "unParalysis", "unPoison", "unDragonRate", "viewRange", "maxDamage", "damageReductionRate", "tc", "heartPower", "heartAc", "dropMode", "uncuttable", "damageReduction"]

ITEM_TYPES = {0:"药品",1:"食物",3:"功能物品",4:"技能书",5:"武器",6:"武器",10:"男装",11:"女装",15:"头盔",16:"面具/斗笠",19:"项链",20:"项链",21:"项链",22:"戒指",23:"戒指",24:"手镯",25:"符与药粉",26:"手镯",30:"照明/勋章",31:"物品包",40:"肉类",41:"任务物品",42:"材料",43:"矿石",44:"凭证",52:"鞋",54:"腰带"}
JOBS = {0:"战士",1:"法师",2:"道士",99:"特殊"}
USES = {"hostile":"目标攻击", "self":"自身施放", "toggle":"开关技能", "charge":"蓄力技能", "passive":"被动技能"}


def read_text(path: Path) -> str:
    raw = path.read_bytes()
    for encoding in ("utf-8-sig", "gb18030"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def scalar(value: str) -> Any:
    value = value.strip()
    if value.upper() == "NULL":
        return None
    if re.fullmatch(r"-?\d+", value):
        return int(value)
    return value


def sql_rows(table: str, columns: list[str]) -> list[dict[str, Any]]:
    rows = []
    prefix = f"INSERT INTO `{table}` VALUES ("
    for line in SQL.read_text(encoding="utf-8").splitlines():
        if not line.startswith(prefix):
            continue
        values = next(csv.reader([line[len(prefix):-2]], quotechar="'", escapechar="\\", skipinitialspace=True))
        if len(values) != len(columns):
            raise ValueError(f"{table} row has {len(values)} values, expected {len(columns)}")
        rows.append(dict(zip(columns, map(scalar, values))))
    return rows


def library(relative: str) -> dict[str, Any] | None:
    path = WEB / relative / "library.json"
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def frame_url(relative: str, index: int) -> str | None:
    data = library(relative)
    frame = data.get("frames", {}).get(str(index)) if data else None
    return f"/{relative}/{frame['file']}" if frame else None


def usable_frame(frame: dict[str, Any] | None) -> bool:
    """Reject tiny decoder artifacts that contain no usable item or skill art."""
    return bool(frame and frame.get("width", 0) > 4 and frame.get("height", 0) > 1)


def parse_visual_rules() -> dict[tuple[int, int], dict[str, Any]]:
    source = (ROOT / "apps/web/src/monster-visuals.ts").read_text(encoding="utf-8")
    result = {}
    pattern = r"\{raceImg:(\d+),appr:(\d+),library:'([^']+)',quality:'([^']+)',names:\[([^]]*)\]\}"
    for race_img, appr, name, quality, names in re.findall(pattern, source):
        result[(int(race_img), int(appr))] = {"library": name, "quality": quality, "names": re.findall(r"'([^']+)'", names)}
    return result


def parse_map_names() -> dict[str, str]:
    result = {}
    for line in read_text(MAPINFO).splitlines():
        match = re.match(r"^\[([^\s\]]+)\s+([^\]]+)\]", line.strip())
        if match:
            result[match.group(1)] = match.group(2).strip()
    result.update({"0":"比奇省", "1":"沃玛森林", "2":"毒蛇山谷", "3":"盟重省", "D001":"兽人古墓一层"})
    return result


def parse_minimaps() -> dict[str, int]:
    result = {}
    for line in read_text(MINIMAP).splitlines():
        fields = line.split()
        if len(fields) >= 2 and fields[1].isdigit():
            result[fields[0]] = int(fields[1]) - 1
    return result


def parse_spawns(known_maps: set[str]) -> list[dict[str, Any]]:
    result = []
    folded = {value.casefold(): value for value in known_maps}
    for line_no, line in enumerate(read_text(MONGEN).splitlines(), 1):
        text = line.strip()
        if not text or text.startswith((";", "；")):
            continue
        fields = text.split()
        if len(fields) < 7:
            continue
        map_id = folded.get(fields[0].casefold(), fields[0])
        try:
            x, y, area, count, respawn = map(int, (fields[1], fields[2], fields[4], fields[5], fields[6]))
        except ValueError:
            continue
        result.append({"id":len(result)+1,"mapId":map_id,"x":x,"y":y,"monster":fields[3],"area":area,"count":count,"respawnMinutes":respawn,"sourceLine":line_no})
    return result


def drop_file(name: str) -> Path | None:
    for candidate in (name, re.sub(r"\d+$", "", name)):
        path = MONITEMS / f"{candidate}.txt"
        if path.is_file():
            return path
    return None


def parse_drops(name: str) -> tuple[str | None, list[dict[str, Any]]]:
    path = drop_file(name)
    if path is None:
        return None, []
    rows = []
    for line_no, line in enumerate(read_text(path).splitlines(), 1):
        text = line.strip()
        if not text or text.startswith((";", "#")):
            continue
        fields = text.split()
        match = re.match(r"^(\d+)/(\d+)$", fields[0]) if fields else None
        if not match or len(fields) < 2:
            continue
        numerator, denominator = map(int, match.groups())
        amount = int(fields[2]) if len(fields) > 2 and fields[2].isdigit() else None
        rows.append({"item":fields[1],"amount":amount,"numerator":numerator,"denominator":denominator,"chancePercent":round(numerator/denominator*100, 5) if denominator else 0,"sourceLine":line_no})
    return str(path.relative_to(ROOT)), rows


def resolve_icon(sources: Any, namespaces: tuple[str, ...], index: int, category: str) -> dict[str, Any]:
    attempts = [sources.resolve(namespace, index) for namespace in namespaces]
    active = [value for value in attempts if value["sourceRole"] == "active_required"]
    chosen = next((value for value in active if value["available"]), active[0] if active else attempts[0])
    result = dict(chosen)
    if not active or not chosen["available"]:
        result["url"] = None
        result["available"] = False
        if chosen["missingReason"] is None:
            result["missingReason"] = "extension_mapping_unconfirmed"
    result["attempts"] = attempts
    result["candidates"] = sources.candidates(category, "Items" if category == "item" else "MagIcon")
    return result


def missing_icon_reasons(items: list[dict[str, Any]], skills: list[dict[str, Any]]) -> dict[str, Any]:
    result = {}
    for section, rows in (("items", items), ("skills", skills)):
        groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in rows:
            if not row["iconUrl"]:
                groups[row["missingReason"] or "unknown_source"].append({"id": row.get("id", row.get("idx")), "name": row["name"], "iconIndex": row["iconIndex"]})
        result[section] = {reason: {"count": len(values), "resources": values} for reason, values in sorted(groups.items())}
    return result


def build() -> dict[str, Any]:
    profile = json.loads(PROFILE.read_text(encoding="utf-8"))
    baseline_items = set(profile["p0Baseline"]["items"])
    baseline_skills = set(profile["p0Baseline"]["skills"])
    baseline_monsters = set(profile["p0Baseline"]["monsters"])
    baseline_maps = {str(value) for value in profile["p0Baseline"]["maps"]}
    skill_rules = json.loads(RULES.read_text(encoding="utf-8"))["skills"]
    combat = json.loads(COMBAT.read_text(encoding="utf-8"))["skills"]
    item_asset_config = json.loads(ITEM_ASSETS.read_text(encoding="utf-8"))
    item_assets = item_asset_config["iconIndexByName"]
    item_fallbacks = item_asset_config["fallbackIconIndexBySourceIndex"]
    skill_assets = json.loads(SKILL_ASSETS.read_text(encoding="utf-8"))["iconIndexByName"]
    icon_usage = json.loads(ICON_USAGE.read_text(encoding="utf-8"))
    if icon_usage.get("schemaVersion") != 1 or icon_usage["items"]["field"] != "server_looks" or icon_usage["skills"]["field"] != "server_effect":
        raise ValueError("unsupported icon source usage contract")
    active_sources = json.loads(ACTIVE_SOURCES.read_text(encoding="utf-8")) if ACTIVE_SOURCES.is_file() else {}
    sources = _source_module.ResourceSources(ROOT, WEB, active_sources)
    visuals = parse_visual_rules()
    national_gameplay = json.loads((ROOT / 'content/classic-176/national-gameplay.json').read_text(encoding='utf-8'))

    items = sql_rows("stditems", ITEM_COLUMNS)
    for item in items:
        item["category"] = ITEM_TYPES.get(item["stdMode"], f"StdMode {item['stdMode']}")
        item["baseline"] = item["name"] in baseline_items
        icon_index = item["imgIndex"]
        proposed_index = item_assets.get(item["name"], item_fallbacks.get(str(item["imgIndex"])))
        resolution = resolve_icon(sources, ("ui-national/items", "items/Items"), icon_index, "item")
        state = sources.resolve("ui-national/stateitem", icon_index)
        item["iconUrl"] = resolution["url"]
        item["iconIndex"] = icon_index
        item["iconSource"] = "国服 Items.wil" if resolution["url"] else None
        item["iconResolution"] = resolution
        item["missingReason"] = resolution["missingReason"]
        item["contentVersion"] = "unknown"
        item["iconMapping"] = {"kind": "server_looks",
                               "sourceIndex": item["imgIndex"], "selectedIndex": icon_index,
                               "proposedIndex": proposed_index, "proposedSelected": False,
                               "basis": str(ICON_USAGE.relative_to(ROOT)),
                               "extensionStatus": "unresolved" if resolution["missingReason"] == "frame_out_of_range" else "unknown"}
        item["stateIconUrl"] = state["url"] if state["available"] and state["sourceRole"] == "active_required" else None

    skills = sql_rows("magics", SKILL_COLUMNS)
    for skill in skills:
        rule = skill_rules.get(skill["name"], {})
        behavior = combat.get(skill["name"], {})
        icon_index = skill["effect"] * icon_usage["skills"]["normalMultiplier"]
        resolution = resolve_icon(sources, ("ui-national/magic-icons", "ui/MagIcon"), icon_index, "ui")
        pressed_index = icon_index + icon_usage["skills"]["pressedOffset"]
        pressed_resolution = resolve_icon(sources, ("ui-national/magic-icons", "ui/MagIcon"), pressed_index, "ui")
        skill.update({
            "jobName": JOBS.get(skill["job"], f"职业 {skill['job']}"),
            "needLevels":[skill.pop("needLevel1"), skill.pop("needLevel2"), skill.pop("needLevel3")],
            "trainLevels":[skill.pop("train1"), skill.pop("train2"), skill.pop("train3")],
            "baseline":skill["name"] in baseline_skills,
            "use":behavior.get("use"), "useName":USES.get(behavior.get("use"), "规则未接入"),
            "reagent":behavior.get("reagent"), "status":behavior.get("status"), "statusBit":behavior.get("statusBit"), "summon":behavior.get("summon", False),
            "rulePinned":bool(rule),
            "iconIndex":icon_index,
            "pressedIconIndex":pressed_index,
            "pressedIconUrl":pressed_resolution["url"], "pressedIconResolution":pressed_resolution,
            "iconUrl":resolution["url"], "iconResolution":resolution, "missingReason":resolution["missingReason"],
            "contentVersion":"unknown",
            "iconMapping":{"kind":"server_effect_pair", "sourceIndex":skill["effect"], "selectedIndex":icon_index,
                           "proposedIndex":skill_assets.get(skill["name"]), "proposedSelected":False,
                           "basis":str(ICON_USAGE.relative_to(ROOT)),
                           "extensionStatus":"unresolved" if resolution["missingReason"] == "frame_out_of_range" else "unknown"},
            "iconSource":"国服 MagIcon.wil" if resolution["url"] else None,
        })

    map_names = parse_map_names()
    minimaps = parse_minimaps()
    spawns = parse_spawns(baseline_maps)
    spawns_by_monster: dict[str, list[int]] = defaultdict(list)
    spawns_by_map: dict[str, list[int]] = defaultdict(list)
    for spawn in spawns:
        spawns_by_monster[spawn["monster"]].append(spawn["id"])
        spawns_by_map[spawn["mapId"]].append(spawn["id"])

    monster_rows = sql_rows("monsters", MONSTER_COLUMNS)
    monsters = []
    item_sources: dict[str, set[str]] = defaultdict(set)
    for monster in monster_rows:
        source_path, drops = parse_drops(monster["name"])
        for drop in drops:
            item_sources[drop["item"]].add(monster["name"])
        visual = visuals.get((monster["raceImg"], monster["appr"]))
        group, shape = divmod(monster['appr'], 10)
        if 0 <= group < national_gameplay['monster']['libraryCount']:
            visual = dict(visual or {})
            visual.update({'library': f'Mon{group + 1}',
                           'offset': national_gameplay['monster']['offsetOverrides'].get(str(monster['appr']), shape * national_gameplay['monster']['strides'][group]),
                           'action': national_gameplay['monster']['raceActions'].get(str(monster['raceImg']), national_gameplay['monster']['defaultAction']),
                           'actionEvidence': 'reference-implementation-awaiting-runtime',
                           'quality': visual.get('quality', 'native-source-candidate')})
        monster.update({
            "baseline":monster["name"] in baseline_monsters or re.sub(r"\d+$", "", monster["name"]) in baseline_monsters,
            "spawnIds":spawns_by_monster.get(monster["name"], spawns_by_monster.get(re.sub(r"\d+$", "", monster["name"]), [])),
            "dropSource":source_path,"drops":drops,"visual":visual,
        })
        monsters.append(monster)
    for item in items:
        item["droppedBy"] = sorted(item_sources.get(item["name"], set()))

    mmap = library("ui-national/mmap") or {"frames":{}}
    maps = []
    for map_id in sorted(baseline_maps, key=lambda value:(not value.isdigit(), value.zfill(8))):
        manifest_path = WEB / "maps" / map_id / "map.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.is_file() else {}
        frame_index = minimaps.get(map_id)
        frame = mmap.get("frames", {}).get(str(frame_index)) if frame_index is not None else None
        maps.append({"id":map_id,"name":map_names.get(map_id, f"地图 {map_id}"),"width":manifest.get("width"),"height":manifest.get("height"),"chunks":len(manifest.get("chunks", [])),"minimapFrame":frame_index,"minimapUrl":f"/ui-national/mmap/{frame['file']}" if frame else None,"spawnIds":spawns_by_map.get(map_id, [])})

    assets = []
    map_bindings = json.loads(MAP_BINDINGS.read_text(encoding="utf-8")) if MAP_BINDINGS.is_file() else {}
    for path in sorted(WEB.glob("**/library.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        relative = path.parent.relative_to(WEB).as_posix()
        registered = sources.registered(relative)
        role = registered[0]["role"] if len(registered) == 1 else data.get("role", "unknown")
        selections = map_selection_records(relative, data, map_bindings)
        assets.append({"id":relative,"source":data.get("source"),"format":data.get("format"),"frames":len(data.get("frames", {})),"sourceFrames":data.get("sourceFrameCount"),"missing":len(data.get("missing", [])),"empty":len(data.get("empty", [])),"sourceSha256":data.get("sourceSha256"),"sourceRole":role,
                       "mapBindingActive":any(value["selected"] for value in selections),
                       "exportSnapshotMapBindingActive":data.get("mapBindingActive"), "mapSourceSelections":selections})
    for world in maps:
        world["mapSourceSelections"] = [value for asset in assets for value in asset["mapSourceSelections"] if value["mapId"] == world["id"]]

    item_names = {item["name"] for item in items}
    identity_conflicts, alias_groups = _source_module.magic_identity(skills)
    conflicting_magic_ids = [value["magicId"] for value in identity_conflicts]
    for skill in skills:
        skill["identityStatus"] = "conflict" if skill["magicId"] in conflicting_magic_ids else "no_effect_conflict_detected"
        for group in alias_groups:
            if skill["magicId"] == group["magicId"]:
                skill["aliases"] = [name for name in group["names"] if name != skill["name"]]
    orphan_spawn_maps = sorted({spawn["mapId"] for spawn in spawns} - baseline_maps)
    monster_names = {monster["name"] for monster in monsters}
    unknown_drop_items = sorted({drop["item"] for monster in monsters for drop in monster["drops"] if drop["item"] != "金币" and drop["item"] not in item_names})
    unknown_spawn_monsters = sorted({spawn["monster"] for spawn in spawns if spawn["monster"] not in monster_names})
    drop_sources = {value["dropSource"] for value in monsters if value["dropSource"]}
    drop_rows = {(monster["dropSource"], drop["sourceLine"]) for monster in monsters for drop in monster["drops"] if monster["dropSource"]}
    proposed_mappings = [
        {"kind":"legacy_name", "name":name, "proposedIndex":index, "selected":False,
         "status":"proposed_unselected", "affectedRows":sum(value["name"] == name for value in items)}
        for name,index in item_assets.items()
    ] + [
        {"kind":"legacy_source_index", "sourceIndex":int(index), "proposedIndex":proposed, "selected":False,
         "status":"proposed_unselected", "affectedRows":sum(value["imgIndex"] == int(index) for value in items)}
        for index,proposed in item_fallbacks.items()
    ]
    return {
        "schemaVersion":1,
        "iconUsage":{"path":str(ICON_USAGE.relative_to(ROOT)),"sha256":_source_module.sha256(ICON_USAGE),"evidenceKind":icon_usage["evidenceKind"],"nativeRuntimeCompared":False},
        "mapAssetBindings":{"path":str(MAP_BINDINGS.relative_to(ROOT)),"sha256":_source_module.sha256(MAP_BINDINGS) if MAP_BINDINGS.is_file() else None,
                            "scope":"explicit_current_render_selection; historical_pairing_audited_separately"},
        "source":{"sql":str(SQL.relative_to(ROOT)),"sqlSha256":_source_module.sha256(SQL),"profile":str(PROFILE.relative_to(ROOT)),"activeAssetSources":str(ACTIVE_SOURCES.relative_to(ROOT)),"activeAssetSourcesSha256":_source_module.sha256(ACTIVE_SOURCES) if ACTIVE_SOURCES.is_file() else None,"itemAssets":str(ITEM_ASSETS.relative_to(ROOT)),"skillRules":str(RULES.relative_to(ROOT)),"skillCombat":str(COMBAT.relative_to(ROOT)),"skillAssets":str(SKILL_ASSETS.relative_to(ROOT)),"monsterVisuals":"apps/web/src/monster-visuals.ts","spawns":str(MONGEN.relative_to(ROOT)),"drops":str(MONITEMS.relative_to(ROOT)),"mapInfo":str(MAPINFO.relative_to(ROOT)),"assets":str(WEB.relative_to(ROOT))},
        "summary":{"items":len(items),"skills":len(skills),"monsters":len(monsters),"maps":len(maps),"spawns":len(spawns),"dropTables":len(drop_sources),"dropRows":len(drop_rows),"assetLibraries":len(assets),"itemIcons":sum(bool(value["iconUrl"]) for value in items),"skillIcons":sum(bool(value["iconUrl"]) for value in skills),"monsterVisuals":sum(bool(value["visual"]) for value in monsters)},
        "diagnostics":{"duplicateMagicIds":conflicting_magic_ids,"magicIdentityConflicts":identity_conflicts,"magicIdAliases":alias_groups,"orphanSpawnMaps":orphan_spawn_maps,"unknownSpawnMonsters":unknown_spawn_monsters,"unknownDropItems":unknown_drop_items,"itemsMissingIcons":sum(not value["iconUrl"] for value in items),"skillsMissingIcons":sum(not value["iconUrl"] for value in skills),"skillsMissingPressedIcons":sum(not value["pressedIconUrl"] for value in skills),"missingIconReasons":missing_icon_reasons(items, skills),"proposedMappings":proposed_mappings,"monstersMissingVisuals":sum(not value["visual"] for value in monsters)},
        "mechanics":mechanics(),"items":items,"skills":skills,"monsters":monsters,"maps":maps,"spawns":spawns,"assets":assets,
        "templates":{"item":dict.fromkeys(ITEM_COLUMNS, 0)|{"id":max(item["id"] for item in items)+1,"name":"新装备","stdMode":5,"weight":1,"duraMax":10000,"need":0,"needLevel":1,"price":100,"stock":1,"reference":None},"skill":dict.fromkeys(SKILL_COLUMNS, 0)|{"idx":max(skill["idx"] for skill in skills)+1,"magicId":max(skill["magicId"] for skill in skills)+1,"name":"新技能","job":0,"needLevel1":1,"train1":200,"needLevel2":3,"train2":300,"needLevel3":5,"train3":500,"description":""}},
    }


def mechanics() -> dict[str, Any]:
    return {
        "itemFields":{"stdMode":"物品大类及装备槽","shape":"大类内部机制/外观分型","imgIndex":"背包、地面和装备素材索引","duraMax":"最大持久，常规装备以 1000 为 1 点显示","need":"佩戴条件类型","needLevel":"条件值；部分条件把职业与等级编码在高低字节","ac/mac":"防御/魔御下限","acMax/macMax":"防御/魔御上限","dc/dcMax":"攻击下限/上限","mc/mcMax":"魔法下限/上限","sc/scMax":"道术下限/上限","aniCount":"药品延时或功能参数，具体含义随 StdMode","effectType/effectRate/effectValue":"两组附加效果","overlapItem":"可否叠加"},
        "skillFields":{"effectType":"技能执行类型","effect":"客户端/服务端效果编号","spell":"基础耗蓝参数","power/maxPower":"基础威力范围","defSpell":"附加耗蓝","defPower/defMaxPower":"附加威力范围","needLevels":"0/1/2 级技能的学习等级","trainLevels":"各级熟练度阈值","delay":"施放延迟参数","job":"0 战士、1 法师、2 道士","manaFormula":"round(spell / 4 × (技能等级 + 1)) + defSpell"},
        "monsterFields":{"race":"AI/行为族","raceImg":"客户端怪物图库族","appr":"图库内外观编号","level":"等级","experience":"击杀经验","hp/mp":"生命/魔法","ac/mac":"防御/魔御","dc/dcMax":"攻击范围","walkSpeed/attackSpeed":"移动/攻击间隔","viewRange":"索敌范围","uncuttable":"禁止挖肉","dropMode":"掉落方式"},
        "drop":"MonItems 每行按 numerator/denominator 独立判定；重复行会产生多次独立掉落机会。金币行的第三列表示数量。",
        "spawn":"MonGen: 地图、中心 X/Y、怪物名、刷新半径、数量、刷新分钟。",
    }


def validate(data: dict[str, Any]) -> list[str]:
    errors = []
    for asset in data["assets"]:
        for selection in asset.get("mapSourceSelections", []):
            if selection.get("status") == "enabled" and not selection.get("manifestLocksMatch"):
                errors.append(f"map selection has mismatched manifest locks: {selection.get('id')}")
            if selection.get("status") == "enabled" and not selection.get("historicalPairingVerified"):
                errors.append(f"reference map historical pairing unverified: {selection.get('mapId')}/{selection.get('layer')}")
    for section, key in (("items", "id"), ("skills", "idx"), ("monsters", "idx"), ("maps", "id")):
        identifiers = [value[key] for value in data[section]]
        if len(identifiers) != len(set(identifiers)):
            errors.append(f"duplicate {section} {key}")
    for monster in data["monsters"]:
        for drop in monster["drops"]:
            if drop["denominator"] <= 0 or drop["numerator"] > drop["denominator"]:
                errors.append(f"invalid drop probability: {monster['name']} line {drop['sourceLine']}")
    spawn_ids = {value["id"] for value in data["spawns"]}
    if any(number not in spawn_ids for value in data["maps"] for number in value["spawnIds"]):
        errors.append("map references an unknown spawn")
    for section in ("items", "skills"):
        missing = sum(not value["iconUrl"] for value in data[section])
        if missing:
            errors.append(f"{section} missing active-source icons: {missing}/{len(data[section])}")
        for value in data[section]:
            expected = value["imgIndex"] if section == "items" else value["effect"] * 2
            if value["iconIndex"] != expected or value.get("iconMapping", {}).get("proposedSelected"):
                errors.append(f"{section} icon violates original source rule: {value['name']}")
            if section == "skills" and value.get("pressedIconIndex") != expected + 1:
                errors.append(f"skill pressed icon violates original source rule: {value['name']}")
            resolution = value.get("iconResolution", {})
            if value["iconUrl"] and (not resolution.get("sourceVerified") or resolution.get("sourceRole") != "active_required"):
                errors.append(f"{section} icon has no verified active source: {value['name']}")
    for conflict in data["diagnostics"].get("magicIdentityConflicts", []):
        errors.append(f"conflicting skill magicId {conflict['magicId']}: " + ", ".join(value["name"] for value in conflict["rows"]))
    item_config = json.loads(ITEM_ASSETS.read_text(encoding="utf-8"))
    items_by_name = {value["name"]: value for value in data["items"]}
    for name, icon_index in item_config["iconIndexByName"].items():
        item = items_by_name.get(name)
        if item is None:
            errors.append(f"item icon override references an unknown item: {name}")
        elif item["iconMapping"].get("proposedIndex") != icon_index or item["iconMapping"].get("proposedSelected"):
            errors.append(f"item proposed mapping policy mismatch: {name} -> {icon_index}")
    fallback_indices = {int(value) for value in item_config["fallbackIconIndexBySourceIndex"]}
    for source_index in fallback_indices:
        if not any(value["imgIndex"] == source_index and not value["iconMapping"].get("proposedSelected") for value in data["items"]):
            errors.append(f"item proposed fallback has no source row: {source_index}")
    return errors


def sql_template(kind: str, name: str) -> str:
    columns = ITEM_COLUMNS if kind == "item" else SKILL_COLUMNS
    values: list[Any] = [0] * len(columns)
    values[columns.index("name")] = name
    if kind == "item":
        values[columns.index("id")] = max(row["id"] for row in sql_rows("stditems", ITEM_COLUMNS)) + 1
        for key, value in {"stdMode":5,"weight":1,"duraMax":10000,"needLevel":1,"price":100,"stock":1}.items(): values[columns.index(key)] = value
        table = "stditems"
    else:
        rows = sql_rows("magics", SKILL_COLUMNS)
        values[columns.index("idx")] = max(row["idx"] for row in rows) + 1
        values[columns.index("magicId")] = max(row["magicId"] for row in rows) + 1
        for key, value in {"needLevel1":1,"train1":200,"needLevel2":3,"train2":300,"needLevel3":5,"train3":500}.items(): values[columns.index(key)] = value
        table = "magics"
    encoded = ", ".join("NULL" if value is None else f"'{value}'" if isinstance(value, str) else str(value) for value in values)
    return f"INSERT INTO `{table}` VALUES ({encoded});"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("build", "validate", "new"), nargs="?", default="build")
    parser.add_argument("kind", choices=("item", "skill"), nargs="?")
    parser.add_argument("--name", default="新资源")
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    if args.command == "new":
        if not args.kind:
            parser.error("new requires item or skill")
        print(sql_template(args.kind, args.name))
        return 0
    data = build()
    errors = validate(data)
    if args.command == "build":
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps({"ok":not errors,"summary":data["summary"],"errors":errors,"output":str(args.output.relative_to(ROOT))}, ensure_ascii=False))
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
