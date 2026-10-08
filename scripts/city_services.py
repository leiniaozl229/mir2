"""Compact local playtest shops and region-based travel for the classic client."""

from collections import OrderedDict
import re


# name, map, shop x/y, guide x/y. Each settlement has exactly one of each
# service; quests and storage remain independent.
CITY_HUBS = (
    ("比奇城", "0", 329, 270, 326, 270),
    ("边界村", "0", 292, 616, 295, 610),
    ("银杏村", "0", 644, 625, 646, 625),
    ("毒蛇山谷", "2", 505, 479, 507, 468),
    ("盟重土城", "3", 330, 329, 327, 327),
    ("沙巴克", "3", 661, 304, 663, 304),
    ("封魔谷", "4", 257, 250, 256, 249),
    ("苍月岛", "5", 140, 329, 138, 329),
    ("白日门", "11", 188, 300, 187, 300),
    ("庄园", "GA0", 64, 67, 65, 66),
)

SHOP_SCRIPT = "测试/综合商人"
TRAVEL_SCRIPT = "测试/区域传送"
CITY_MAPS = {hub[1] for hub in CITY_HUBS}

# These scripts either advertise a defunct server/payment scheme or duplicate
# services now present at every settlement. Keep warehouses, quests and the
# wilderness/dungeon guides unless explicitly named here.
RETIRED_SCRIPTS = {
    "新手接待员", "举证", "元宝充值", "盟重土城/流浪汉",
    "盟重土城/彩票", "盟重土城/足球", "盟重土城/裁判",
    "功能NPC/回收", "功能NPC/空白", "功能NPC/会战",
    "赌博NPC/赌庄", "赌博NPC/赌场", "沙巴克铁匠",
    "测试/装备商人", "测试/回城补给", "测试/练级向导",
    "测试/高级向导", "测试/扩展向导",
    "测试/边界武器", "测试/边界服装", "测试/边界药店",
    "测试/边界戒指", "测试/边界手镯", "测试/边界项链",
    "比奇城/卫家店", "比奇城/安家布衣", "比奇城/夏家",
    "比奇城/书店", "比奇城/杂货", "比奇城/戒指店",
    "比奇城/手镯店", "比奇城/项链店", "比奇城/肉店",
    "比奇城/万能", "比奇城/小药", "比奇城/小书", "比奇城/蛇杂",
    "盟重土城/肉店", "盟重土城/张家布衣", "盟重土城/手套店",
    "盟重土城/头盔店", "盟重土城/戒指店", "盟重土城/手镯店",
    "盟重土城/项链店", "盟重土城/药店", "盟重土城/罗家铺子",
    "盟重土城/书店", "盟重土城/铁匠铺",
    "沙巴克/武器铺", "沙巴克/布衣店", "沙巴克/手镯店",
    "沙巴克/项链店", "沙巴克/戒指店", "沙巴克/小贩",
    "沙巴克/药店",
    "苍月岛/杂货店", "苍月岛/武器店", "苍月岛/书店",
    "苍月岛/首饰店", "苍月岛/布料店", "苍月岛/药店",
    "白日门/武器", "白日门/服装", "白日门/书店",
    "白日门/首饰", "白日门/药店", "白日门/杂货",
    "封魔谷/恶魔杂货匠", "封魔谷/恶魔武器",
    "封魔谷/恶魔布衣", "封魔谷/恶魔首饰",
    "封魔谷/恶魔药剂师",
}

# A few former shopkeepers also advance the classic quest chain. Retain their
# actors as quest NPCs, but remove the selling/repair UI and stock from their
# scripts so the combined merchant remains the only town shop.
QUEST_ONLY_SHOPS = {
    ("比奇城/卫家店", "0103"): "卫家任务人",
    ("比奇城/书店", "0"): "书店任务人",
    ("比奇城/杂货", "0"): "杂货任务人",
    ("比奇城/项链店", "0105"): "项链任务人",
    ("比奇城/肉店", "0"): "屠夫任务人",
    ("盟重土城/戒指店", "0158"): "戒指任务人",
    ("盟重土城/手镯店", "0158"): "手镯任务人",
    ("盟重土城/铁匠铺", "0159"): "铁匠任务人",
    ("苍月岛/首饰店", "5"): "首饰任务人",
    ("白日门/武器", "1001"): "武器任务人",
}


def keep_merchant(line):
    fields = line.split()
    if len(fields) < 5:
        return False
    script, map_id = fields[:2]
    if (script, map_id) in QUEST_ONLY_SHOPS:
        return True
    if script in RETIRED_SCRIPTS:
        return False
    if map_id in CITY_MAPS and script.startswith("传送员/"):
        return False
    if script == "测试/世界向导" and (map_id in CITY_MAPS or map_id in {"G003", "B013"}):
        return False
    return True


def normalize_merchant(line):
    """Filter retired actors and relabel former shopkeepers with live quests."""
    if not keep_merchant(line):
        return None
    fields = line.split()
    quest_name = QUEST_ONLY_SHOPS.get((fields[0], fields[1]))
    if quest_name:
        fields[4] = quest_name
    return " ".join(fields)


def quest_only_script(source):
    """Keep quest branches while disabling stale sales, repairs and month cards."""
    sections = re.split(r"(?=^\[(?:@|~@|goods))", source, flags=re.M | re.I)
    kept = []
    for section in sections:
        label = re.match(r"^\[([^\]]+)\]", section)
        if not label:
            continue  # old merchant header: @buy, item types and price rate
        name = label.group(1).casefold().lstrip("~@")
        if name in {"goods", "buy", "sell", "repair", "s_repair", "yueka", "helpbooks"}:
            continue
        section = re.sub(r"<[^>]*?/@(?:buy|sell|repair|s_repair|yueka|helpbooks)>\s*",
                         "", section, flags=re.I)
        kept.append(section.rstrip())
    return "\n\n".join(kept) + "\n"


# Name, destination map and walkable arrival cell. Long areas are split into
# pages of six links so the 2003 client's nine-row dialogue remains clickable.
ROUTE_GROUPS = OrderedDict((
    ("城镇与村庄", (
        ("比奇城", "0", 330, 266), ("边界村", "0", 289, 618),
        ("银杏村", "0", 650, 631), ("毒蛇山谷", "2", 510, 474),
        ("盟重土城", "3", 332, 328), ("沙巴克", "3", 660, 304),
        ("封魔谷", "4", 255, 250), ("苍月岛", "5", 139, 330),
        ("白日门", "11", 187, 301), ("庄园", "GA0", 69, 71),
    )),
    ("新手与沃玛", (
        ("沃玛森林", "1", 240, 300), ("兽人古墓一层", "D001", 168, 350),
        ("兽人古墓二层", "D002", 200, 200), ("兽人古墓三层", "D003", 196, 204),
        ("沃玛寺庙入口", "D021", 50, 50), ("沃玛寺庙一层", "D022", 338, 355),
        ("沃玛寺庙二层", "D023", 198, 195), ("沃玛教主大殿", "D024", 16, 19),
    )),
    ("矿区与地牢", (
        ("废矿入口", "D401", 100, 100), ("矿区通道", "D402", 100, 100),
        ("矿区一层", "D403", 100, 100), ("矿区B二层", "D404", 100, 100),
        ("山谷矿区一层", "D421", 87, 87), ("山谷矿区二层", "D422", 97, 103),
        ("地牢一层东", "D601", 101, 127), ("地牢二层西", "D604", 110, 100),
        ("黑暗地带", "D612", 150, 154), ("绝望悬崖", "D619", 60, 50),
    )),
    ("祖玛与石墓", (
        ("祖玛一层", "D501", 200, 200), ("祖玛二层", "D502", 200, 200),
        ("祖玛三层", "D503", 200, 200), ("祖玛四层", "D504", 200, 200),
        ("祖玛五层", "D505", 53, 54), ("祖玛教主之家", "D515", 20, 20),
        ("石墓入口", "D710", 25, 25), ("石墓一层", "D711", 205, 197),
        ("石墓二层", "D712", 196, 204), ("石墓三层", "D713", 200, 200),
        ("石墓深处", "D715", 29, 344), ("石墓七层", "D717", 50, 50),
    )),
    ("赤月与封魔", (
        ("丛林迷宫", "12", 174, 249), ("赤月峡谷北", "D10011", 202, 195),
        ("赤月峡谷广场", "D1002", 155, 156), ("赤月抉择之地", "D1004", 150, 150),
        ("恶魔祭坛", "D10061", 15, 14), ("赤月魔穴", "D10062", 20, 20),
        ("封魔矿区", "D2000", 100, 100), ("封魔道", "D2003", 140, 159),
        ("霸者大厅", "D2008", 50, 50), ("封魔殿", "D2013", 50, 50),
    )),
    ("苍月与幻境", (
        ("尸魔洞一层", "D2051", 102, 105), ("尸魔洞三层", "D2052", 50, 50),
        ("骨魔洞一层", "D2061", 100, 100), ("骨魔洞五层", "D2067", 145, 158),
        ("牛魔寺庙入口", "D2070", 25, 25), ("牛魔寺庙大厅", "D2079", 50, 50),
        ("幻境一层", "H001", 75, 75), ("幻境五层", "H005", 142, 158),
        ("幻境七层", "H007", 100, 100), ("屠龙殿", "H010", 50, 50),
    )),
))


def build_travel_script(route_groups=None, introduction="区域传送员：先选地区，再选目的地。"):
    groups = list((ROUTE_GROUPS if route_groups is None else route_groups).items())
    lines = ["[@main]", introduction + "\\"]
    for index in range(0, len(groups), 2):
        links = [f"<{name}/@g{number}p0>" for number, (name, _) in
                 list(enumerate(groups))[index:index + 2]]
        lines.append(" ".join(links) + "\\")
    lines.append("<关闭/@exit>")
    lines.insert(len(lines) - 1, "<重置怪物刷新/@refresh>\\")
    for group_index, (group_name, destinations) in enumerate(groups):
        pages = [destinations[i:i + 6] for i in range(0, len(destinations), 6)]
        for page_index, page in enumerate(pages):
            lines.extend(["", f"[@g{group_index}p{page_index}]",
                          f"{group_name} {page_index + 1}/{len(pages)}：\\"])
            for offset, (name, _, _, _) in enumerate(page):
                route_index = page_index * 6 + offset
                lines.append(f"<{name}/@r{group_index}_{route_index}>\\")
            navigation = []
            if page_index:
                navigation.append(f"<上一页/@g{group_index}p{page_index - 1}>")
            if page_index + 1 < len(pages):
                navigation.append(f"<下一页/@g{group_index}p{page_index + 1}>")
            navigation.extend(("<分类/@main>", "<关闭/@exit>"))
            lines.append(" ".join(navigation))
        for route_index, (_, map_id, x, y) in enumerate(destinations):
            lines.extend(["", f"[@r{group_index}_{route_index}]", "#ACT",
                          f"MAPMOVE {map_id} {x} {y}", "BREAK"])
    lines.extend(build_refresh_sections(groups))
    return "\n".join(lines) + "\n"


def build_refresh_sections(groups):
    lines = ["", "[@refresh]", "选择地图补怪：存活怪保留，每图间隔30秒。\\",
             "<刷新当前地图/@refresh_current>\\"]
    for index in range(0, len(groups), 2):
        lines.append(" ".join(f"<{name}/@fg{number}p0>" for number, (name, _) in
                              list(enumerate(groups))[index:index + 2]) + "\\")
    lines.append("<返回/@main> <关闭/@exit>")
    lines.extend(["", "[@refresh_current]", "#ACT", "RESETMONSPAWN CURRENT", "BREAK"])
    for group_index, (group_name, destinations) in enumerate(groups):
        pages = [destinations[i:i + 6] for i in range(0, len(destinations), 6)]
        for page_index, page in enumerate(pages):
            lines.extend(["", f"[@fg{group_index}p{page_index}]", f"刷新{group_name} {page_index + 1}/{len(pages)}：\\"])
            for offset, (name, _, _, _) in enumerate(page):
                lines.append(f"<{name}/@fr{group_index}_{page_index * 6 + offset}>\\")
            navigation = []
            if page_index:
                navigation.append(f"<上一页/@fg{group_index}p{page_index - 1}>")
            if page_index + 1 < len(pages):
                navigation.append(f"<下一页/@fg{group_index}p{page_index + 1}>")
            navigation.extend(("<分类/@refresh>", "<关闭/@exit>"))
            lines.append(" ".join(navigation))
        for route_index, (_, map_id, _, _) in enumerate(destinations):
            lines.extend(["", f"[@fr{group_index}_{route_index}]", "#ACT", f"RESETMONSPAWN {map_id}", "BREAK"])
    return lines


def service_definitions(active_maps):
    for name, map_id, shop_x, shop_y, guide_x, guide_y in CITY_HUBS:
        if map_id in active_maps:
            yield f"{SHOP_SCRIPT} {map_id} {shop_x} {shop_y} 综合商人 0 5 0"
            yield f"{TRAVEL_SCRIPT} {map_id} {guide_x} {guide_y} 区域传送员 0 5 0"
