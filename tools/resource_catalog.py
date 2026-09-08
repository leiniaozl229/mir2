#!/usr/bin/env python3
"""Build and validate the browser resource catalogue from authoritative game data."""

from __future__ import annotations

import argparse
import csv
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
MONGEN = ROOT / "vendor/mirserver-data/Mir200/Envir/MonGen.txt"
MONITEMS = ROOT / "vendor/mirserver-data/Mir200/Envir/MonItems"
MAPINFO = ROOT / "vendor/mirserver-data/Mir200/Envir/MapInfo.txt"
MINIMAP = ROOT / "vendor/mirserver-data/Mir200/Envir/MiniMap.txt"
WEB = ROOT / "assets/web"
OUTPUT = ROOT / "content/classic-176/resource-catalog.json"

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


def build() -> dict[str, Any]:
    profile = json.loads(PROFILE.read_text(encoding="utf-8"))
    baseline_items = set(profile["p0Baseline"]["items"])
    baseline_skills = set(profile["p0Baseline"]["skills"])
    baseline_monsters = set(profile["p0Baseline"]["monsters"])
    baseline_maps = {str(value) for value in profile["p0Baseline"]["maps"]}
    skill_rules = json.loads(RULES.read_text(encoding="utf-8"))["skills"]
    combat = json.loads(COMBAT.read_text(encoding="utf-8"))["skills"]
    item_icons = library("ui-national/items") or library("items/Items") or {"frames":{}}
    state_icons = library("ui-national/stateitem") or {"frames":{}}
    skill_icons = library("ui-national/magic-icons") or library("ui/MagIcon") or {"frames":{}}
    visuals = parse_visual_rules()

    items = sql_rows("stditems", ITEM_COLUMNS)
    for item in items:
        item["category"] = ITEM_TYPES.get(item["stdMode"], f"StdMode {item['stdMode']}")
        item["baseline"] = item["name"] in baseline_items
        frame = item_icons.get("frames", {}).get(str(item["imgIndex"]))
        state = state_icons.get("frames", {}).get(str(item["imgIndex"]))
        item["iconUrl"] = f"/ui-national/items/{frame['file']}" if frame else None
        item["stateIconUrl"] = f"/ui-national/stateitem/{state['file']}" if state else None

    skills = sql_rows("magics", SKILL_COLUMNS)
    for skill in skills:
        rule = skill_rules.get(skill["name"], {})
        behavior = combat.get(skill["name"], {})
        icon = skill_icons.get("frames", {}).get(str(skill["magicId"]))
        skill.update({
            "jobName": JOBS.get(skill["job"], f"职业 {skill['job']}"),
            "needLevels":[skill.pop("needLevel1"), skill.pop("needLevel2"), skill.pop("needLevel3")],
            "trainLevels":[skill.pop("train1"), skill.pop("train2"), skill.pop("train3")],
            "baseline":skill["name"] in baseline_skills,
            "use":behavior.get("use"), "useName":USES.get(behavior.get("use"), "规则未接入"),
            "reagent":behavior.get("reagent"), "status":behavior.get("status"), "statusBit":behavior.get("statusBit"), "summon":behavior.get("summon", False),
            "rulePinned":bool(rule), "iconUrl":f"/ui-national/magic-icons/{icon['file']}" if icon else None,
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
    for path in sorted(WEB.glob("**/library.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        relative = path.parent.relative_to(WEB).as_posix()
        assets.append({"id":relative,"source":data.get("source"),"format":data.get("format"),"frames":len(data.get("frames", {})),"sourceFrames":data.get("sourceFrameCount"),"missing":len(data.get("missing", [])),"empty":len(data.get("empty", [])),"sourceSha256":data.get("sourceSha256")})

    item_names = {item["name"] for item in items}
    duplicate_magic_ids = sorted({value for value in [skill["magicId"] for skill in skills] if sum(row["magicId"] == value for row in skills) > 1})
    orphan_spawn_maps = sorted({spawn["mapId"] for spawn in spawns} - baseline_maps)
    monster_names = {monster["name"] for monster in monsters}
    unknown_drop_items = sorted({drop["item"] for monster in monsters for drop in monster["drops"] if drop["item"] != "金币" and drop["item"] not in item_names})
    unknown_spawn_monsters = sorted({spawn["monster"] for spawn in spawns if spawn["monster"] not in monster_names})
    drop_sources = {value["dropSource"] for value in monsters if value["dropSource"]}
    drop_rows = {(monster["dropSource"], drop["sourceLine"]) for monster in monsters for drop in monster["drops"] if monster["dropSource"]}
    return {
        "schemaVersion":1,
        "source":{"sql":str(SQL.relative_to(ROOT)),"profile":str(PROFILE.relative_to(ROOT)),"skillRules":str(RULES.relative_to(ROOT)),"skillCombat":str(COMBAT.relative_to(ROOT)),"monsterVisuals":"apps/web/src/monster-visuals.ts","spawns":str(MONGEN.relative_to(ROOT)),"drops":str(MONITEMS.relative_to(ROOT)),"mapInfo":str(MAPINFO.relative_to(ROOT)),"assets":str(WEB.relative_to(ROOT))},
        "summary":{"items":len(items),"skills":len(skills),"monsters":len(monsters),"maps":len(maps),"spawns":len(spawns),"dropTables":len(drop_sources),"dropRows":len(drop_rows),"assetLibraries":len(assets),"itemIcons":sum(bool(value["iconUrl"]) for value in items),"skillIcons":sum(bool(value["iconUrl"]) for value in skills),"monsterVisuals":sum(bool(value["visual"]) for value in monsters)},
        "diagnostics":{"duplicateMagicIds":duplicate_magic_ids,"orphanSpawnMaps":orphan_spawn_maps,"unknownSpawnMonsters":unknown_spawn_monsters,"unknownDropItems":unknown_drop_items,"itemsMissingIcons":sum(not value["iconUrl"] for value in items),"skillsMissingIcons":sum(not value["iconUrl"] for value in skills),"monstersMissingVisuals":sum(not value["visual"] for value in monsters)},
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
