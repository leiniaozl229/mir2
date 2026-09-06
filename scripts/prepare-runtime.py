#!/usr/bin/env python3
"""Prepare an isolated P0 world. Never imports old accounts, binaries or saves."""
from pathlib import Path
import configparser
import hashlib
import json
import re
import secrets
import shutil
import argparse
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from map_tool import ClassicMap, UnsupportedMap

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "vendor/mirserver-data"
RUNTIME = ROOT / ".runtime"
SERVER = RUNTIME / "server"

# Additional classic 1.76 route maps kept outside the minimal P0 world.  The
# coordinates are taken from the source maps after checking for walkable cells;
# they let the browser exercise the major skeleton, natural-cave, mine,
# sealed-passage and Demon-City branches without importing the whole 570-map
# data pack into the deterministic fixture.
CLASSIC_EXTRA_ROUTES = {
    "D002": {"name": "兽人古墓二层", "start": (200, 200), "npc": (201, 200), "monster": "骷髅"},
    "D003": {"name": "兽人古墓三层", "start": (196, 204), "npc": (196, 205), "monster": "骷髅战士"},
    "D011": {"name": "天然洞穴一层", "start": (200, 200), "npc": (201, 200), "monster": "洞蛆"},
    "D012": {"name": "天然洞穴二层", "start": (200, 200), "npc": (201, 200), "monster": "僵尸2"},
    "D412": {"name": "矿区桥一", "start": (50, 50), "npc": (50, 51), "monster": "僵尸2"},
    "D415": {"name": "矿区桥二", "start": (53, 46), "npc": (54, 46), "monster": "僵尸3"},
    "D416": {"name": "矿区桥三", "start": (50, 43), "npc": (51, 43), "monster": "洞蛆"},
    "D423": {"name": "山谷矿区桥", "start": (50, 50), "npc": (51, 50), "monster": "僵尸1"},
    "D511": {"name": "祖玛图书馆一层", "start": (22, 20), "npc": (23, 20), "monster": "祖玛卫士"},
    "D512": {"name": "祖玛图书馆二层", "start": (22, 20), "npc": (23, 20), "monster": "祖玛雕像"},
    "D513": {"name": "祖玛图书馆三层", "start": (22, 20), "npc": (23, 20), "monster": "祖玛弓箭手"},
    "D514": {"name": "祖玛图书馆四层", "start": (22, 20), "npc": (23, 20), "monster": "祖玛卫士"},
    "D515": {"name": "祖玛教主之家", "start": (20, 20), "npc": (19, 20), "monster": "祖玛卫士"},
    "D601": {"name": "地牢一层东", "start": (101, 127), "npc": (100, 127), "monster": "僵尸2"},
    "D602": {"name": "地牢一层西", "start": (123, 119), "npc": (122, 118), "monster": "僵尸3"},
    "D603": {"name": "地牢一层北", "start": (125, 117), "npc": (126, 117), "monster": "洞蛆"},
    "D604": {"name": "地牢二层西", "start": (110, 100), "npc": (111, 100), "monster": "僵尸1"},
    "D605": {"name": "地牢二层北", "start": (92, 100), "npc": (91, 100), "monster": "僵尸2"},
    "D606": {"name": "死亡棺材", "start": (100, 97), "npc": (101, 97), "monster": "僵尸3"},
    "D607": {"name": "铁灯笼屋", "start": (25, 25), "npc": (26, 25), "monster": "洞蛆"},
    "D608": {"name": "紫水晶屋", "start": (25, 24), "npc": (26, 24), "monster": "僵尸1"},
    "D609": {"name": "石路小溪", "start": (24, 25), "npc": (23, 25), "monster": "僵尸2"},
    "D610": {"name": "石棺材屋", "start": (25, 25), "npc": (26, 25), "monster": "僵尸3"},
    "D611": {"name": "阴森石路", "start": (50, 46), "npc": (51, 46), "monster": "僵尸1"},
    "D612": {"name": "黑暗地带", "start": (150, 154), "npc": (151, 154), "monster": "红野猪"},
    "D613": {"name": "生死之间", "start": (50, 50), "npc": (51, 50), "monster": "黑野猪"},
    "D614": {"name": "传奇部落", "start": (49, 49), "npc": (49, 48), "monster": "红野猪"},
    "D615": {"name": "邪恶势力", "start": (48, 50), "npc": (47, 50), "monster": "黑野猪"},
    "D616": {"name": "幽明圣域", "start": (50, 49), "npc": (51, 49), "monster": "红野猪"},
    "D617": {"name": "恐怖空间", "start": (50, 50), "npc": (51, 50), "monster": "黑野猪"},
    "D618": {"name": "一线天", "start": (100, 106), "npc": (101, 106), "monster": "红野猪"},
    "D619": {"name": "绝望悬崖", "start": (60, 50), "npc": (61, 50), "monster": "黑野猪"},
    "D701": {"name": "秘密通道", "start": (96, 100), "npc": (96, 101), "monster": "红野猪"},
    "D717": {"name": "石墓七层", "start": (50, 50), "npc": (51, 50), "monster": "黑野猪"},
    '11': {"name": '白日门', "start": (250, 250), "npc": (251, 250), "monster": '虎蛇'},
    '12': {"name": '丛林迷宫', "start": (174, 249), "npc": (175, 249), "monster": '毒蜘蛛'},
    'D10011': {"name": '赤月峡谷北', "start": (202, 195), "npc": (203, 195), "monster": '黑野猪'},
    'D10012': {"name": '赤月峡谷南', "start": (151, 139), "npc": (151, 138), "monster": '红野猪'},
    'D10013': {"name": '赤月峡谷东', "start": (148, 151), "npc": (147, 151), "monster": '黑野猪'},
    'D1002': {"name": '赤月峡谷广场', "start": (155, 156), "npc": (155, 157), "monster": '红野猪'},
    'D10031': {"name": '赤月左回廊', "start": (150, 150), "npc": (151, 150), "monster": '黑野猪'},
    'D10032': {"name": '赤月右回廊', "start": (146, 153), "npc": (145, 153), "monster": '红野猪'},
    'D1004': {"name": '赤月抉择之地', "start": (150, 150), "npc": (151, 150), "monster": '黑野猪'},
    'D10051': {"name": '赤月山谷秘道一', "start": (101, 99), "npc": (102, 99), "monster": '红野猪'},
    'D10052': {"name": '赤月山谷秘道二', "start": (100, 100), "npc": (101, 100), "monster": '黑野猪'},
    'D10061': {"name": '恶魔祭坛', "start": (15, 14), "npc": (16, 14), "monster": '黑野猪'},
    'D10062': {"name": '赤月魔穴', "start": (20, 20), "npc": (21, 20), "monster": '红野猪'},
    '4': {"name": '封魔谷', "start": (255, 250), "npc": (256, 250), "monster": '红野猪'},
    'D2000': {"name": '封魔矿区', "start": (100, 100), "npc": (101, 100), "monster": '黑野猪'},
    'D2001': {"name": '崎路', "start": (127, 127), "npc": (126, 127), "monster": '红野猪'},
    'D2002': {"name": '连接通道', "start": (25, 25), "npc": (26, 25), "monster": '僵尸1'},
    'D2003': {"name": '封魔道', "start": (140, 159), "npc": (139, 159), "monster": '红野猪'},
    'D2004': {"name": '疾风殿', "start": (50, 50), "npc": (51, 50), "monster": '黑野猪'},
    'D2005': {"name": '光芒回廊', "start": (50, 50), "npc": (51, 50), "monster": '红野猪'},
    'D2006': {"name": '烈焰殿', "start": (50, 50), "npc": (51, 50), "monster": '黑野猪'},
    'D2007': {"name": '雷霆之路', "start": (96, 104), "npc": (95, 104), "monster": '红野猪'},
    'D2008': {"name": '霸者大厅', "start": (50, 50), "npc": (51, 50), "monster": '黑野猪'},
    'D2009': {"name": '幽冥回廊', "start": (50, 50), "npc": (51, 50), "monster": '红野猪'},
    'D2010': {"name": '纵横道', "start": (142, 142), "npc": (141, 142), "monster": '黑野猪'},
    'D2011': {"name": '魔魂殿', "start": (50, 50), "npc": (51, 50), "monster": '红野猪'},
    'D2012': {"name": '炼狱回廊', "start": (50, 50), "npc": (51, 50), "monster": '黑野猪'},
    'D2013': {"name": '封魔殿', "start": (50, 50), "npc": (51, 50), "monster": '红野猪'},
    '5': {"name": '苍月岛', "start": (400, 400), "npc": (401, 400), "monster": '黑野猪'},
    'D2051': {"name": '尸魔洞一层', "start": (102, 105), "npc": (103, 105), "monster": '黑野猪'},
    'D2052': {"name": '尸魔洞三层', "start": (50, 50), "npc": (51, 50), "monster": '黑野猪'},
    'D2053': {"name": '尸魔洞二层', "start": (142, 158), "npc": (143, 158), "monster": '红野猪'},
    'D2061': {"name": '骨魔洞一层', "start": (100, 100), "npc": (101, 100), "monster": '僵尸1'},
    'D2062': {"name": '骨魔洞二层', "start": (94, 94), "npc": (95, 94), "monster": '僵尸1'},
    'D2063': {"name": '骨魔洞三层', "start": (100, 99), "npc": (101, 99), "monster": '僵尸1'},
    'D2064': {"name": '骨魔洞四层', "start": (108, 93), "npc": (109, 93), "monster": '僵尸1'},
    'D2067': {"name": '骨魔洞五层', "start": (145, 158), "npc": (146, 158), "monster": '僵尸1'},
    'D2070': {"name": '牛魔寺庙出入口', "start": (25, 25), "npc": (26, 25), "monster": '祖玛卫士'},
    'D2071': {"name": '牛魔寺庙一层', "start": (150, 150), "npc": (151, 150), "monster": '祖玛卫士'},
    'D2072': {"name": '牛魔寺庙二层', "start": (140, 144), "npc": (139, 144), "monster": '祖玛卫士'},
    'D2073': {"name": '牛魔寺庙三层', "start": (206, 206), "npc": (207, 206), "monster": '祖玛卫士'},
    'D2075': {"name": '牛魔寺庙四层', "start": (100, 100), "npc": (101, 100), "monster": '祖玛卫士'},
    'D2076': {"name": '牛魔寺庙五层', "start": (100, 100), "npc": (101, 100), "monster": '祖玛卫士'},
    'D2078': {"name": '牛魔寺庙六层', "start": (150, 150), "npc": (151, 150), "monster": '祖玛卫士'},
    'D2079': {"name": '牛魔寺庙大厅', "start": (50, 50), "npc": (51, 50), "monster": '祖玛卫士'},
    'H001': {"name": '幻境一层', "start": (75, 75), "npc": (76, 75), "monster": '祖玛卫士'},
    'H002': {"name": '幻境二层', "start": (200, 200), "npc": (200, 201), "monster": '祖玛卫士'},
    'H003': {"name": '幻境三层', "start": (50, 50), "npc": (51, 50), "monster": '祖玛卫士'},
    'H004': {"name": '幻境四层', "start": (101, 102), "npc": (102, 102), "monster": '祖玛卫士'},
    'H005': {"name": '幻境五层', "start": (142, 158), "npc": (143, 158), "monster": '祖玛卫士'},
    'H006': {"name": '幻境六层', "start": (50, 50), "npc": (51, 50), "monster": '祖玛卫士'},
    'H007': {"name": '幻境七层', "start": (100, 100), "npc": (101, 100), "monster": '祖玛卫士'},
    'H008': {"name": '幻境八层', "start": (50, 50), "npc": (51, 50), "monster": '祖玛卫士'},
    'H009': {"name": '幻境九层', "start": (150, 150), "npc": (151, 150), "monster": '祖玛卫士'},
    'H010': {"name": '屠龙殿', "start": (206, 206), "npc": (207, 206), "monster": '祖玛卫士'},
}

# These routes already have hand-calibrated entries in the compact fixture
# below. Dynamic catalog expansion supplies the remaining source maps and must
# not duplicate their MapInfo keys or initial spawns.
CURATED_FIXTURE_MAPS = {
    "1", "2", "3", "D021", "D022", "D023", "D024",
    "D401", "D402", "D403", "D404", "D405", "D406", "D411", "D413", "D414",
    "D421", "D422", "D501", "D502", "D503", "D504", "D505",
    "D710", "D711", "D712", "D713", "D714", "D715", "D716",
}


def _map_names():
    """Return source MapInfo names keyed by a case-insensitive map id."""
    source = SOURCE / "Mir200/Envir/MapInfo.txt"
    names = {}
    for key, name in re.findall(r"^\s*\[([^\]]+)\s+([^\]]+)\]", read_text(source), re.M):
        canonical = key.split("|", 1)[0].strip()
        names.setdefault(canonical.casefold(), name.strip())
    return names


def _map_info_flags():
    """Return source MapInfo flags keyed by canonical map id."""
    source = SOURCE / "Mir200/Envir/MapInfo.txt"
    flags = {}
    for raw_line in read_text(source).splitlines():
        match = re.match(r"^\s*\[([^\]]+)\](.*)$", raw_line)
        if not match:
            continue
        map_token = match.group(1).split(None, 1)[0].split("|", 1)[0].strip()
        suffix = match.group(2).strip()
        if map_token:
            flags.setdefault(map_token.casefold(), suffix)
    return flags


def _source_map_paths():
    """Return supported source maps under stable, case-insensitive ids."""
    result = {}
    for path in sorted((SOURCE / "Mir200/Map").glob("*.map")):
        try:
            ClassicMap(path.read_bytes())
        except UnsupportedMap:
            continue
        stem = path.stem
        # The original pack mixes lower-case dungeon filenames with upper-case
        # references. Browser URLs and runtime map names use a stable form.
        canonical = stem.upper() if any(char.isalpha() for char in stem) else stem
        result[canonical] = path
    return result


def _walkable_point(world):
    """Pick a deterministic walkable point, searching from the map centre."""
    cx, cy = world.width // 2, world.height // 2
    for radius in range(max(world.width, world.height) + 1):
        left, right = max(0, cx - radius), min(world.width - 1, cx + radius)
        top, bottom = max(0, cy - radius), min(world.height - 1, cy + radius)
        candidates = []
        for x in range(left, right + 1):
            candidates.extend(((x, top), (x, bottom)))
        for y in range(top + 1, bottom):
            candidates.extend(((left, y), (right, y)))
        for x, y in candidates:
            if not world.blocked(x, y):
                return x, y
    raise ValueError("source map contains no walkable cell")


def _route_monster(name):
    if re.search(r"沃玛", name):
        return "沃玛战士"
    if re.search(r"祖玛|牛魔", name):
        return "祖玛卫士"
    if re.search(r"矿|洞|地牢|墓|尸|骨|棺|阴森|死亡", name):
        return "僵尸1"
    if re.search(r"赤月|猪|封魔|苍月|幻境|石墓", name):
        return "红野猪"
    return "虎蛇"


def _expand_classic_routes(routes):
    """Add every supported source map with safe coordinates and a light spawn."""
    names = _map_names()
    for map_id, path in _source_map_paths().items():
        if map_id in {"0", "1", "2", "3", "D001"} or map_id in routes:
            continue
        world = ClassicMap(path.read_bytes())
        start = _walkable_point(world)
        npc = next((point for point in ((start[0] + 1, start[1]),
                                         (start[0] - 1, start[1]),
                                         (start[0], start[1] + 1),
                                         (start[0], start[1] - 1))
                    if 0 <= point[0] < world.width and 0 <= point[1] < world.height
                    and not world.blocked(*point)), start)
        routes[map_id] = {"name": names.get(map_id.casefold(), f"地图 {map_id}"),
                          "start": start, "npc": npc,
                          "monster": _route_monster(names.get(map_id.casefold(), map_id))}


def _generic_world_guide(map_id, meta):
    return (f"[@main]\n{meta['name']}向导：已抵达 {map_id}，可返回比奇省。\\\n"
            f"<返回比奇/@home> <返回/@exit>\n\n"
            "[@home]\n#ACT\nMAPMOVE 0 330 266\nBREAK\n")


def _build_extended_guide(routes):
    """Build a paginated map catalogue so one NPC can reach the full set."""
    # The three surface maps have hand-calibrated entries in the compact
    # fixture and therefore do not live in CLASSIC_EXTRA_ROUTES. Keep them in
    # the full catalogue so the directory is genuinely complete from the
    # player's point of view.
    fixture_routes = {
        "1": {"name": "沃玛森林", "start": (240, 300)},
        "2": {"name": "毒蛇山谷", "start": (510, 474)},
        "3": {"name": "盟重省", "start": (332, 328)},
    }
    catalog = {**fixture_routes, **routes}
    ordered = list(dict.fromkeys(["1", "2", "3", "D001"] + list(routes)))
    page_size = 16
    pages = [ordered[i:i + page_size] for i in range(0, len(ordered), page_size)]
    lines = ["[@main]", "完整地图目录：请选择分页。\\"]
    lines.extend(f"<第 {index + 1} 页/@page{index}>" for index in range(len(pages)))
    lines.append("<返回比奇/@home> <关闭/@exit>")
    for index, page in enumerate(pages):
        lines.extend(["", f"[@page{index}]"])
        for offset, map_id in enumerate(page):
            meta = {"name": "兽人古墓一层"} if map_id == "D001" else catalog[map_id]
            lines.append(f"<{meta['name']}({map_id})/@route{index}_{offset}>\\")
        if index + 1 < len(pages):
            lines.append(f"<下一页/@page{index + 1}>\\")
        lines.append("<返回目录/@main> <返回比奇/@home>")
        for offset, map_id in enumerate(page):
            meta = {"start": (168, 350)} if map_id == "D001" else catalog[map_id]
            lines.extend(["", f"[@route{index}_{offset}]", "#ACT",
                          f"MAPMOVE {map_id} {meta['start'][0]} {meta['start'][1]}",
                          "BREAK"])
    lines.extend(["", "[@home]", "#ACT", "MAPMOVE 0 330 266", "BREAK"])
    return "\n".join(lines) + "\n"


def _classic_mon_gen(route_maps):
    """Merge the source spawn table with deterministic fallback spawns."""
    allowed = {map_id.casefold(): map_id for map_id in route_maps}
    bounds = {}
    for map_id, path in _source_map_paths().items():
        world = ClassicMap(path.read_bytes())
        bounds[map_id.casefold()] = (world.width, world.height)
    seen = set()
    source_lines = []
    for raw_line in read_text(SOURCE / "Mir200/Envir/MonGen.txt").splitlines():
        line = raw_line.strip()
        fields = line.split()
        if not fields or fields[0].startswith((";", "；")):
            continue
        canonical = allowed.get(fields[0].casefold())
        if canonical is None or canonical in {"0", "D001"}:
            continue
        if len(fields) < 4:
            continue
        try:
            x, y = int(fields[1]), int(fields[2])
        except ValueError:
            continue
        width, height = bounds.get(canonical.casefold(), (0, 0))
        if not (0 <= x < width and 0 <= y < height):
            # A few historical packs contain coordinates copied from a larger
            # map revision. Let the deterministic fallback represent that
            # route instead of handing an invalid center to the engine.
            continue
        rest = line.split(None, 1)[1] if len(fields) > 1 else ""
        source_lines.append(f"{canonical} {rest}".rstrip())
        seen.add(canonical)
    lines = ["0 292 623 鸡 3 4 1", "0 300 626 鹿 4 3 1"]
    lines.extend(source_lines)
    lines.extend(["D001 168 350 骷髅 2 2 45", "D001 176 350 掷斧骷髅 2 1 60",
                  "D001 180 345 骷髅战士 2 1 75", "D001 185 345 骷髅战将 2 1 90",
                  "D001 190 340 骷髅精灵 1 1 300"])
    for map_id, meta in CLASSIC_EXTRA_ROUTES.items():
        if map_id in {"0", "D001"} or map_id in seen:
            continue
        lines.append(f"{map_id} {meta['npc'][0]} {meta['npc'][1]} {meta['monster']} 3 2 30")
    return "\n".join(lines) + "\n"


def read_text(path):
    raw = path.read_bytes()
    if raw.startswith(b"\xef\xbb\xbf"):
        return raw.decode("utf-8-sig")
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("gb18030")


def _filtered_route_definitions(path, map_field, route_maps):
    """Return source NPC definitions whose map belongs to the selected world.

    The historical data pack mixes casing (and, for some files, padded map
    names) while MapInfo uses canonical ids.  Normalize only the map token so
    the engine can resolve every supported route on case-sensitive hosts.
    """
    allowed = {map_id.casefold(): map_id for map_id in route_maps}
    result = []
    seen = set()
    for raw_line in read_text(path).splitlines():
        line = raw_line.strip()
        if not line or line.startswith((";", "；")):
            continue
        fields = line.split()
        if len(fields) <= map_field:
            continue
        canonical = allowed.get(fields[map_field].casefold())
        if canonical is None:
            continue
        fields[map_field] = canonical
        normalized = " ".join(fields)
        if normalized in seen:
            continue
        seen.add(normalized)
        result.append(normalized)
    return result


def _filtered_map_quests(path, route_maps):
    """Import source map-quest definitions for the selected classic route.

    MapQuest.txt is a fixed-column legacy file.  Keep the original fields so
    the engine's MapQuest loader retains its flag, monster, item and NPC
    semantics, while normalizing the map token for case-sensitive hosts.
    """
    allowed = {map_id.casefold(): map_id for map_id in route_maps}
    result = []
    seen = set()
    for raw_line in read_text(path).splitlines():
        line = raw_line.strip()
        if not line or line.startswith((";", "；")):
            continue
        fields = line.split()
        if len(fields) < 6:
            continue
        canonical = allowed.get(fields[0].casefold())
        if canonical is None:
            continue
        fields[0] = canonical
        normalized = " ".join(fields)
        if normalized in seen:
            continue
        seen.add(normalized)
        result.append(normalized)
    return result


def _copy_classic_market_definitions(route_mode):
    """Import the source NPC scripts for the full classic route.

    The compact P0 fixture intentionally keeps only its hand-written test
    merchants.  Route mode needs every source Market_Def script so a clean
    runtime has the same NPC/dialogue surface as the checked-in data pack.
    """
    if not route_mode:
        return 0
    source_root = SOURCE / "Mir200/Envir/Market_Def"
    target_root = SERVER / "Mir200/Envir/Market_Def"
    copied = 0
    for source in sorted(source_root.rglob("*")):
        if not source.is_file():
            continue
        target = target_root / source.relative_to(source_root)
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists():
            shutil.copyfile(source, target)
            copied += 1
    return copied


def _normalize_castle_configs():
    """Keep legacy castle INI files in the engine's GB2312 encoding."""
    source_root = SOURCE / "Mir200/Castle"
    target_root = SERVER / "Mir200/Castle"
    normalized = 0
    for source in sorted(source_root.rglob("*")):
        if not source.is_file():
            continue
        target = target_root / source.relative_to(source_root)
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            raw = target.read_bytes()
            try:
                text = raw.decode("gb18030")
            except UnicodeDecodeError:
                text = raw.decode("utf-8-sig")
            if raw == text.encode("gb18030"):
                continue
            target.chmod(0o600)
        else:
            text = read_text(source)
        target.write_bytes(text.encode("gb18030"))
        normalized += 1
    return normalized


def write_new(path, text, encoding="utf-8-sig"):
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_text(text, encoding=encoding)


def configure(directory, source_name, target_name, updates):
    cfg = configparser.ConfigParser(strict=False, interpolation=None)
    cfg.optionxform = str
    cfg.read_string(read_text(SOURCE / directory / source_name))
    for section, values in updates.items():
        if not cfg.has_section(section):
            cfg.add_section(section)
        for key, value in values.items():
            for previous in list(cfg[section]):
                if previous.lower() == key.lower():
                    del cfg[section][previous]
            cfg[section][key] = str(value)
    target = SERVER / directory / target_name
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        with target.open("w", encoding="utf-8-sig") as handle:
            cfg.write(handle, space_around_delimiters=False)


def schema_only(text):
    # Upstream exports one complete INSERT statement on each line.
    text = re.sub(r"(?m)^INSERT INTO .*?;\s*$", "", text)
    if re.search(r"\bINSERT\s+INTO\b", text, re.I):
        raise ValueError("Unknown multi-line data insert: refusing to import old saves")
    return text


_expand_classic_routes(CLASSIC_EXTRA_ROUTES)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh-p0", action="store_true",
                        help="Regenerate only the explicitly isolated P0 world fixtures")
    parser.add_argument("--refresh-classic-route", action="store_true",
                        help="Add the classic 0/1/2/3 world route while preserving accounts and saves")
    args = parser.parse_args()
    RUNTIME.mkdir(exist_ok=True)
    env = RUNTIME / "db.env"
    write_new(env, "MYSQL_ROOT_PASSWORD=" + secrets.token_hex(24) + "\n", "utf-8")
    env.chmod(0o600)
    password = env.read_text().strip().split("=", 1)[1]
    connection = lambda db: f"server=db;uid=root;pwd={password};database={db};"
    for index, name in enumerate(["mir2_account", "mir2_db", "mir2_data"]):
        source = ROOT / "vendor/openmir2/sql" / (name + ".sql")
        text = source.read_text(encoding="utf-8-sig")
        if name != "mir2_data":
            text = schema_only(text)
        write_new(RUNTIME / "sql" / f"{index:02d}-{name}.sql",
                  f"CREATE DATABASE IF NOT EXISTS {name};\nUSE {name};\n{text}", "utf-8")
    # Keep all source maps available. The default runtime loads the isolated
    # P0 pair; --refresh-classic-route selects every supported classic map.
    for directory in ["Map", "Envir", "Notice"]:
        src = SOURCE / "Mir200" / directory
        if src.exists():
            for source in src.rglob("*"):
                if source.is_file() and source.suffix.lower() in (".map", ".txt"):
                    relative = source.relative_to(src)
                    if directory == "Envir" and relative.parts and relative.parts[0] == "Market_Def":
                        # P0 installs only its explicit test merchants.  The
                        # classic route imports every source script below.
                        continue
                    target = SERVER / "Mir200" / source.relative_to(SOURCE / "Mir200")
                    target.parent.mkdir(parents=True, exist_ok=True)
                    if not target.exists():
                        shutil.copyfile(source, target)
                    if source.suffix.lower() == ".map":
                        # Some historical packs store dungeon maps in lower
                        # case while MapInfo uses upper-case ids. Keep a
                        # canonical filename beside the original so the same
                        # runtime works on case-sensitive hosts.
                        canonical = source.stem.upper() if any(c.isalpha() for c in source.stem) else source.stem
                        canonical_target = target.with_name(canonical + source.suffix.lower())
                        if not canonical_target.exists():
                            shutil.copyfile(source, canonical_target)
    for name in ["Exps.conf", "String.conf", "Command.conf", "Global.conf"]:
        source = SOURCE / "Mir200" / name
        text = read_text(source)
        # The pinned data pack keeps this legacy template in printf syntax,
        # while the current engine formats group notices with string.Format.
        if name == "String.conf":
            text = re.sub(r"(?m)^JoinGroupMsg=%s(.*)$", r"JoinGroupMsg={0}\1", text)
        write_new(SERVER / "Mir200" / name.lower(), text)
    configure("Mir200", "Server.conf", "server.conf", {
        "DataBase": {"ConnctionString": connection("mir2_data")},
        "Server": {"ServerName": "热血传奇", "DBAddr": "127.0.0.1", "IDSAddr": "127.0.0.1",
                   "MsgSrvAddr": "127.0.0.1", "LogServerAddr": "127.0.0.1",
                   "GateAddr": "127.0.0.1", "LocalIP": "127.0.0.1",
                   # Personal P0 worlds should bound the data-loss window after
                   # an unclean process exit. Normal shutdown still waits for
                   # the explicit database acknowledgement.
                   "SaveHumanRcdTime": 60_000},
        "Share": {"GuildFile": "GuildBase/GuildList.txt"},
    })
    configure("DBServer", "dbsvr.conf", "dbsvr.conf", {
        "DataBase": {"ConnctionString": connection("mir2_db")},
        "Setup": {"ServerAddr": "127.0.0.1", "GateAddr": "127.0.0.1",
                  "MapFile": "/workspace/.runtime/server/Mir200/Envir/MapInfo.txt"},
        "Server": {"IDSAddr": "127.0.0.1"},
        "DB": {k: k for k in ["dir", "IdDir", "HumDir", "FeeDir", "Backup",
                              "connectDir", "LogDir", "BackupDir", "ClearLogDir"]},
    })
    configure("LoginSrv", "config.conf", "logsrv.conf", {
        "DataBase": {"ConnctionString": connection("mir2_account")},
        "Server": {**{k: "127.0.0.1" for k in ["GateAddr", "ServerAddr", "MonAddr",
                   "DBServer", "FeeServer", "LogServer", "RunAddr"]}, "TestServer": 1},
        "DB": {k: k for k in ["IdDir", "FeedIDList", "FeedIPList", "CountLogDir",
                              "WebLogDir", "ChrLogDir", "IdLogDir"]},
    })
    for directory, section in [("LoginGate", "LoginGate"), ("SelGate", "SelGate")]:
        configure(directory, "config.conf", "config.conf", {
            section: {"ServerAddr0": "127.0.0.1", "GateAddr0": "0.0.0.0"},
        })
    configure("RunGate", "config.conf", "config.conf", {
        "GameGate": {"ServerWorkThread": 1, "ServerAddr1": "127.0.0.1",
                     "GateAddress1": "0.0.0.0", "GatePort1": 7200},
        "Cloud": {"UseCloudGate": 0},
    })
    write_new(SERVER / "DBServer/AddrTable.txt", "127.0.0.1\n")
    write_new(SERVER / "DBServer/ServerInfo.txt", "127.0.0.1 127.0.0.1 7200\n")
    write_new(SERVER / "LoginSrv/ServerAddr.txt", "127.0.0.1\n")
    write_new(SERVER / "LoginSrv/UserLimit.txt", "热血传奇 热血传奇 20\n")
    write_new(SERVER / "LoginSrv/AddrTable.txt",
              "热血传奇 Classic 127.0.0.1 127.0.0.1 127.0.0.1:7100\n")
    write_new(SERVER / "Mir200/!runaddr.txt", "127.0.0.1\n")
    write_new(SERVER / "Mir200/!servertable.txt", "0 127.0.0.1 7200\n")
    castle_configs = _normalize_castle_configs()
    write_new(SERVER / "Mir200/GuildBase/GuildList.txt", "")
    (SERVER / "Mir200/GuildBase/Guilds").mkdir(parents=True, exist_ok=True)
    write_new(SERVER / "Mir200/Castle/List.txt", "")
    # Explicit P0 fixtures; a marker prevents subsequent preparation overwriting edits.
    marker = RUNTIME / "p0-world.json"
    if not marker.exists() or args.refresh_p0 or args.refresh_classic_route:
        route_mode = args.refresh_classic_route
        market_definitions = _copy_classic_market_definitions(route_mode)
        route_maps = list(dict.fromkeys(["0", "D001"] + (["1", "2", "3", "D021", "D022", "D023", "D024",
                                          "D401", "D402", "D403", "D404", "D405", "D406",
                                          "D411", "D413", "D414", "D421", "D422",
                                          "D501", "D502", "D503", "D504", "D505",
                                          "D710", "D711", "D712", "D713", "D714", "D715", "D716"]
                                         + list(CLASSIC_EXTRA_ROUTES) if route_mode else [])))
        dynamic_routes = ((map_id, meta) for map_id, meta in CLASSIC_EXTRA_ROUTES.items()
                          if map_id not in CURATED_FIXTURE_MAPS)
        source_map_flags = _map_info_flags()
        extra_map_info = "".join(
            f"[{map_id} {meta['name']}] {source_map_flags.get(map_id.casefold()) or 'DAY'}\n"
            for map_id, meta in dynamic_routes
        ) if route_mode else ""
        dynamic_routes = ((map_id, meta) for map_id, meta in CLASSIC_EXTRA_ROUTES.items()
                          if map_id not in CURATED_FIXTURE_MAPS)
        extra_start_points = "".join(
            f"{map_id} {meta['start'][0]} {meta['start'][1]}\n"
            for map_id, meta in dynamic_routes
        ) if route_mode else ""
        dynamic_routes = ((map_id, meta) for map_id, meta in CLASSIC_EXTRA_ROUTES.items()
                          if map_id not in CURATED_FIXTURE_MAPS)
        extra_monsters = "".join(
            f"{map_id} {meta['npc'][0]} {meta['npc'][1]} {meta['monster']} 3 2 30\n"
            for map_id, meta in dynamic_routes
        ) if route_mode else ""
        fixtures = {
            "MapInfo.txt": ("[0 比奇省] DAY\n"
                            + ("[1 沃玛森林] DAY\n"
                               "[2 毒蛇山谷] DAY\n"
                               "[3 盟重省] DAY\n"
                               "[D021 沃玛寺庙入口] DARK\n"
                               "[D022 沃玛寺庙一层] DARK\n"
                               "[D023 沃玛寺庙二层] DARK\n"
                               "[D024 沃玛教主大殿] DARK NORECALL NORANDOMMOVE NORECONNECT(D023)\n"
                               "[D401 废矿入口] MINE CHECKQUEST(Q001)\n"
                               "[D402 矿区通道] DAY\n"
                               "[D403 矿区一层] DAY\n"
                               "[D404 矿区B二层] DAY\n"
                               "[D405 矿物回收站] DAY\n"
                               "[D406 废矿区南部] DAY\n"
                               "[D411 矿区B一层] DAY\n"
                               "[D413 矿区A一层] DAY\n"
                               "[D414 矿区C一层] DAY\n"
                               "[D421 山谷矿区一层] DAY\n"
                               "[D422 山谷矿区二层] DAY\n"
                               "[D501 祖玛寺庙一层] DAY\n"
                               "[D502 祖玛寺庙二层] DAY\n"
                               "[D503 祖玛寺庙三层] DAY\n"
                               "[D504 祖玛寺庙四层] DAY\n"
                               "[D505 祖玛寺庙五层] DAY\n"
                               "[D710 石墓入口] DAY\n"
                               "[D711 石墓一层] DAY\n"
                               "[D712 石墓二层] DAY\n"
                               "[D713 石墓三层] DAY\n"
                               "[D714 石墓四层] DAY\n"
                               "[D715 石墓深处] DAY\n"
                               "[D716 石墓六层] DAY\n" if route_mode else "")
                            + extra_map_info
                            + "[D001 兽人古墓一层]\n"),
            "StartPoint.txt": ("0 289 618\n0 650 631\n0 330 266\n"
                                + ("1 240 300\n2 510 474\n3 332 328\n"
                                "D021 50 50\nD022 338 355\nD023 198 195\nD024 16 19\n"
                                "D401 100 100\nD402 100 100\nD403 100 100\nD404 100 100\nD405 112 103\nD406 109 113\n"
                                "D411 60 7\nD413 10 7\nD414 14 79\nD421 87 87\nD422 97 103\n"
                                "D501 200 200\nD502 200 200\nD503 200 200\nD504 200 200\nD505 53 54\n"
                                "D710 25 25\nD711 205 197\nD712 196 204\nD713 200 200\nD714 15 201\nD715 29 344\nD716 24 26\n" if route_mode else "")
                                + extra_start_points),
            "MonGen.txt": ("0 292 623 鸡 3 4 1\n"
                           "0 300 626 鹿 4 3 1\n"
                           + ("1 357 369 半兽人 200 100 3\n"
                              "1 306 207 多钩猫 120 80 3\n"
                              "2 321 216 虎蛇 160 100 3\n"
                              "2 450 337 毒蜘蛛 140 80 3\n"
                              "3 368 348 羊 80 100 3\n"
                              "3 395 310 盔甲虫 120 100 3\n" if route_mode else "")
                           + ("D021 52 50 山洞蝙蝠 3 2 20\n"
                              "D022 340 355 沃玛战士 3 2 20\n"
                              "D023 170 160 沃玛战士 4 2 20\n"
                              "D024 22 54 沃玛勇士 3 1 30\n"
                              "D401 104 100 僵尸2 4 2 20\n"
                              "D401 108 100 僵尸3 4 2 20\n"
                              "D402 104 100 洞蛆 3 2 20\n"
                              "D403 104 100 僵尸2 4 2 20\n"
                              "D404 104 100 僵尸3 4 2 20\n"
                              "D405 113 103 洞蛆 3 2 20\n"
                              "D406 109 114 僵尸1 4 2 20\n"
                              "D411 25 33 僵尸1 4 2 20\n"
                              "D413 21 42 僵尸3 4 2 20\n"
                              "D414 44 44 洞蛆 3 2 20\n"
                              "D421 86 87 僵尸2 4 2 20\n"
                              "D422 96 103 僵尸3 4 2 20\n"
                              "D501 205 200 祖玛卫士 4 2 30\n"
                              "D502 205 200 祖玛雕像 4 2 30\n"
                              "D503 205 200 祖玛弓箭手 4 2 30\n"
                              "D504 205 200 祖玛卫士 4 2 30\n"
                              "D505 54 54 祖玛雕像 3 2 30\n"
                              "D710 28 25 红野猪 3 2 30\n"
                              "D711 170 165 红野猪 3 2 30\n"
                              "D712 195 204 红野猪 3 2 30\n"
                              "D713 205 200 红野猪 3 2 30\n"
                              "D714 36 236 黑野猪 3 2 30\n"
                              "D715 32 344 红野猪 3 2 20\n"
                              "D716 25 26 黑野猪 3 2 30\n" if route_mode else "")
                           + extra_monsters
                           + "D001 168 350 骷髅 2 2 45\n"
                           "D001 176 350 掷斧骷髅 2 1 60\n"
                           "D001 180 345 骷髅战士 2 1 75\n"
                           "D001 185 345 骷髅战将 2 1 90\n"
                           "D001 190 340 骷髅精灵 1 1 300\n"),
            "AdminList.txt": "",
            "MapQuest.txt": "",
        }
        if route_mode:
            fixtures["MonGen.txt"] = _classic_mon_gen(route_maps)
            map_quest_source = SOURCE / "Mir200/Envir/MapQuest.txt"
            if map_quest_source.exists():
                map_quests = _filtered_map_quests(map_quest_source, route_maps)
                fixtures["MapQuest.txt"] = "\n".join(map_quests) + ("\n" if map_quests else "")
        # Keep the compact P0 fixture isolated by default.  Classic-route mode
        # imports every source definition whose map is in the supported route
        # catalogue, while preserving the deterministic test NPCs appended
        # below.
        definition_specs = {
            "Merchant.txt": 1,
            "Npcs.txt": 2,
            "GuardList.txt": 1,
        }
        for name, map_field in definition_specs.items():
            source_path = SOURCE / "Mir200/Envir" / name
            if route_mode:
                lines = _filtered_route_definitions(source_path, map_field, route_maps)
            else:
                lines = [line for line in read_text(source_path).splitlines()
                         if len(line.split()) > 1 and line.split()[1] == "0"]
            fixtures[name] = "\n".join(lines) + ("\n" if lines else "")
        fixtures["Merchant.txt"] += "比奇城/麦家铺子 0 286 609 边界仓库 0 9 0\n"
        fixtures["Merchant.txt"] += "测试/技能导师 0 284 609 边界导师 0 5 0\n"
        fixtures["Merchant.txt"] += "测试/技能导师 0 648 628 银杏导师 0 5 0\n"
        fixtures["Merchant.txt"] += "测试/新手试炼 0 288 609 比奇老兵 0 5 0\n"
        fixtures["Merchant.txt"] += "测试/猎人试炼 0 294 609 边界猎人 0 5 0\n"
        fixtures["Merchant.txt"] += "测试/药剂筹备 0 296 609 药师学徒 0 5 0\n"
        fixtures["Merchant.txt"] += "测试/铁匠试炼 0 301 609 铁匠学徒 0 5 0\n"
        fixtures["Merchant.txt"] += "测试/药剂筹备 0 647 628 银杏药师 0 5 0\n"
        fixtures["Merchant.txt"] += "测试/铁匠试炼 0 649 628 银杏铁匠 0 5 0\n"
        fixtures["Merchant.txt"] += "测试/药剂筹备 0 334 266 比奇药师 0 5 0\n"
        fixtures["Merchant.txt"] += "测试/铁匠试炼 0 336 266 比奇铁匠 0 5 0\n"
        boundary_shops = [
            ("边界武器", 282, 609, "边界武器店", 1, "卫家店-0103.txt"),
            ("边界服装", 280, 609, "边界服装店", 7, "安家布衣-0106.txt"),
            ("边界药店", 282, 613, "边界药店", 1, "小药-0119.txt"),
            ("边界戒指", 280, 613, "边界戒指店", 4, "戒指店-0105.txt"),
            ("边界手镯", 280, 615, "边界手镯店", 5, "手镯店-0105.txt"),
            ("边界项链", 282, 615, "边界项链店", 6, "项链店-0105.txt"),
        ]
        for script_name, x, y, display_name, appearance, _ in boundary_shops:
            fixtures["Merchant.txt"] += (
                f"测试/{script_name} 0 {x} {y} {display_name} 0 {appearance} 0\n"
            )
        fixtures["Merchant.txt"] += "测试/古墓向导 D001 153 362 古墓向导 0 5 0\n"
        fixtures["Merchant.txt"] += "测试/首领测试官 D001 198 331 首领测试官 0 5 0\n"
        if route_mode:
            fixtures["Merchant.txt"] += "测试/世界向导 0 326 270 世界向导 0 5 0\n"
            fixtures["Merchant.txt"] += "测试/扩展向导 0 295 610 扩展路线向导 0 5 0\n"
            fixtures["Merchant.txt"] += "测试/世界向导 1 235 305 世界向导 0 5 0\n"
            fixtures["Merchant.txt"] += "测试/世界向导 2 505 479 世界向导 0 5 0\n"
            fixtures["Merchant.txt"] += "测试/世界向导 3 327 327 世界向导 0 5 0\n"
            fixtures["Merchant.txt"] += "测试/世界向导 D021 51 50 沃玛向导 0 5 0\n"
            fixtures["Merchant.txt"] += "测试/世界向导 D022 339 356 沃玛一层向导 0 5 0\n"
            fixtures["Merchant.txt"] += "测试/世界向导 D023 199 196 沃玛二层向导 0 5 0\n"
            fixtures["Merchant.txt"] += "测试/世界向导 D024 17 19 教主殿向导 0 5 0\n"
            fixtures["Merchant.txt"] += "测试/世界向导 D401 101 100 矿区向导 0 5 0\n"
            fixtures["Merchant.txt"] += "测试/世界向导 D402 101 100 矿区通道向导 0 5 0\n"
            fixtures["Merchant.txt"] += "测试/世界向导 D403 101 100 矿区一层向导 0 5 0\n"
            fixtures["Merchant.txt"] += "测试/世界向导 D404 101 100 矿区B二层向导 0 5 0\n"
            fixtures["Merchant.txt"] += "测试/世界向导 D405 113 103 矿物回收站向导 0 5 0\n"
            fixtures["Merchant.txt"] += "测试/世界向导 D406 109 114 废矿南部向导 0 5 0\n"
            fixtures["Merchant.txt"] += "测试/世界向导 D411 60 8 矿区B层向导 0 5 0\n"
            fixtures["Merchant.txt"] += "测试/世界向导 D413 11 7 矿区A层向导 0 5 0\n"
            fixtures["Merchant.txt"] += "测试/世界向导 D414 15 79 矿区C层向导 0 5 0\n"
            fixtures["Merchant.txt"] += "测试/世界向导 D421 86 87 山谷矿区一层向导 0 5 0\n"
            fixtures["Merchant.txt"] += "测试/世界向导 D422 96 103 山谷矿区二层向导 0 5 0\n"
            fixtures["Merchant.txt"] += "测试/世界向导 D501 201 200 祖玛一层向导 0 5 0\n"
            fixtures["Merchant.txt"] += "测试/世界向导 D502 201 200 祖玛二层向导 0 5 0\n"
            fixtures["Merchant.txt"] += "测试/世界向导 D503 201 200 祖玛三层向导 0 5 0\n"
            fixtures["Merchant.txt"] += "测试/世界向导 D504 201 200 祖玛四层向导 0 5 0\n"
            fixtures["Merchant.txt"] += "测试/世界向导 D505 54 54 祖玛五层向导 0 5 0\n"
            fixtures["Merchant.txt"] += "测试/世界向导 D710 24 25 石墓向导 0 5 0\n"
            fixtures["Merchant.txt"] += "测试/世界向导 D711 205 198 石墓一层向导 0 5 0\n"
            fixtures["Merchant.txt"] += "测试/世界向导 D712 195 204 石墓二层向导 0 5 0\n"
            fixtures["Merchant.txt"] += "测试/世界向导 D713 201 200 石墓三层向导 0 5 0\n"
            fixtures["Merchant.txt"] += "测试/世界向导 D714 16 201 石墓四层向导 0 5 0\n"
            fixtures["Merchant.txt"] += "测试/世界向导 D715 30 344 石墓深处向导 0 5 0\n"
            fixtures["Merchant.txt"] += "测试/世界向导 D716 25 26 石墓六层向导 0 5 0\n"
            for map_id, meta in CLASSIC_EXTRA_ROUTES.items():
                if map_id in CURATED_FIXTURE_MAPS:
                    continue
                fixtures["Merchant.txt"] += (
                    f"测试/世界向导 {map_id} {meta['npc'][0]} {meta['npc'][1]} "
                    f"{meta['name']}向导 0 5 0\n"
                )
        # Source packs occasionally contain the same NPC more than once with
        # different spacing.  Collapse exact normalized duplicates after the
        # fixture additions so a map never gets duplicate actor keys.
        for name in definition_specs:
            unique_lines = []
            seen = set()
            for line in fixtures[name].splitlines():
                normalized = " ".join(line.split())
                if not normalized or normalized in seen:
                    continue
                seen.add(normalized)
                unique_lines.append(normalized)
            fixtures[name] = "\n".join(unique_lines) + ("\n" if unique_lines else "")
        for name, text in fixtures.items():
            (SERVER / "Mir200/Envir" / name).write_text(text, encoding="utf-8-sig")
        shutil.copyfile(SOURCE / "Mir200/Envir/Market_Def/比奇城/麦家铺子-0125.txt",
                        SERVER / "Mir200/Envir/Market_Def/比奇城/麦家铺子-0.txt")
        trainer = SERVER / "Mir200/Envir/Market_Def/测试/技能导师-0.txt"
        trainer.parent.mkdir(parents=True, exist_ok=True)
        trainer.write_text(read_text(ROOT / "content/classic-176/p0/skill-trainer.txt"), encoding="gb18030")
        tutorial = SERVER / "Mir200/Envir/Market_Def/测试/新手试炼-0.txt"
        tutorial.write_text(read_text(ROOT / "content/classic-176/p0/tutorial-quest.txt"), encoding="gb18030")
        hunter = SERVER / "Mir200/Envir/Market_Def/测试/猎人试炼-0.txt"
        hunter.write_text(read_text(ROOT / "content/classic-176/p0/hunter-quest.txt"), encoding="gb18030")
        potion = SERVER / "Mir200/Envir/Market_Def/测试/药剂筹备-0.txt"
        potion.write_text(read_text(ROOT / "content/classic-176/p0/potion-quest.txt"), encoding="gb18030")
        weapon = SERVER / "Mir200/Envir/Market_Def/测试/铁匠试炼-0.txt"
        weapon.write_text(read_text(ROOT / "content/classic-176/p0/weapon-quest.txt"), encoding="gb18030")
        shop_source = SOURCE / "Mir200/Envir/Market_Def/比奇城"
        for script_name, _, _, _, _, source_name in boundary_shops:
            shutil.copyfile(shop_source / source_name,
                            SERVER / f"Mir200/Envir/Market_Def/测试/{script_name}-0.txt")
        guide = SERVER / "Mir200/Envir/Market_Def/测试/古墓向导-D001.txt"
        guide.write_text(read_text(ROOT / "content/classic-176/p0/cave-guide.txt"), encoding="gb18030")
        boss_examiner = SERVER / "Mir200/Envir/Market_Def/测试/首领测试官-D001.txt"
        boss_examiner.write_text(read_text(ROOT / "content/classic-176/p0/cave-guide.txt"), encoding="gb18030")
        if route_mode:
            extended_guide = SERVER / "Mir200/Envir/Market_Def/测试/扩展向导-0.txt"
            extended_guide.write_text(_build_extended_guide(CLASSIC_EXTRA_ROUTES), encoding="gb18030")
            for map_id in ["0", "1", "2", "3", "D021", "D022", "D023", "D024",
                           "D401", "D402", "D403", "D404", "D405", "D406", "D411", "D413", "D414",
                           "D421", "D422", "D501", "D502", "D503", "D504", "D505",
                           "D710", "D711", "D712", "D713", "D714", "D715", "D716"] + list(CLASSIC_EXTRA_ROUTES):
                guide = SERVER / f"Mir200/Envir/Market_Def/测试/世界向导-{map_id}.txt"
                source_guide = ROOT / f"content/classic-176/p0/world-guide-{map_id}.txt"
                text = read_text(source_guide) if source_guide.exists() else _generic_world_guide(
                    map_id, {"name": CLASSIC_EXTRA_ROUTES[map_id]["name"]})
                guide.write_text(text, encoding="gb18030")
        skeleton_drops = read_text(ROOT / "content/classic-176/p0/skeleton-drops.txt")
        for monster in ["骷髅", "掷斧骷髅", "骷髅战士", "骷髅战将"]:
            (SERVER / "Mir200/Envir/MonItems" / f"{monster}.txt").write_text(skeleton_drops, encoding="gb18030")
        spirit_drops = read_text(ROOT / "content/classic-176/p0/skeleton-spirit-drops.txt")
        (SERVER / "Mir200/Envir/MonItems/骷髅精灵.txt").write_text(spirit_drops, encoding="gb18030")
        deer_drops = read_text(ROOT / "content/classic-176/p0/deer-drops.txt")
        (SERVER / "Mir200/Envir/MonItems/鹿.txt").write_text(deer_drops, encoding="gb18030")
        marker.write_text(json.dumps({"purpose": "P0 engine verification only",
                                     "maps": route_maps, "fullContentComplete": False,
                                     "classicRoute": route_mode}, indent=2, ensure_ascii=False))
    files = [p for p in (SOURCE / "Mir200/Map").glob("*.map")]
    report = {"mapCount": len(files), "clientGraphicsPresent": False,
              "accountDataImported": False, "legacyBinariesImported": False,
              "sqlSourceHashes": {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                   for p in (ROOT / "vendor/openmir2/sql").glob("*.sql")}}
    (RUNTIME / "reports").mkdir(exist_ok=True)
    (RUNTIME / "reports/import.json").write_text(json.dumps(report, indent=2))
    print(f"Prepared isolated P0 runtime; {len(files)} source maps; {market_definitions if 'market_definitions' in locals() else 0} classic market definitions imported; {castle_configs} castle configs normalized; empty account/save databases.")


if __name__ == "__main__":
    main()
