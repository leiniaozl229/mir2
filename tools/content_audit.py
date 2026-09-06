#!/usr/bin/env python3
"""Audit the locked classic-176 content profile and generated web assets.

The audit is deliberately read-only.  It checks the source locks and the
generated manifests without importing or rewriting runtime data, so it can be
used in CI, before a release, or after refreshing the classic route.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[1]


def read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ValueError(f"cannot read JSON {path}: {error}") from error


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def source_file_map() -> dict[str, Path]:
    directory = ROOT / "vendor/mirserver-data/Mir200/Map"
    return {path.stem.casefold(): path for path in directory.glob("*.map")}


def profile_map_ids(profile: dict[str, Any]) -> list[str]:
    return [str(value) for value in profile["p0Baseline"]["maps"]]


def source_entry_path(sources: dict[str, Any], category: str, entry: dict[str, Any]) -> Path:
    filename = entry["file"]
    if category == "map":
        return ROOT / "assets/raw/crystal-shanda" / filename
    if category == "actor":
        return ROOT / "assets/raw/crystal-actors" / filename
    if category == "effect":
        return ROOT / "assets/raw/crystal-effects" / filename
    if category == "item":
        return ROOT / "assets/raw/crystal-items" / filename
    if category == "audio":
        return ROOT / "assets/raw/crystal-sounds" / filename
    if category == "ui":
        return ROOT / "assets/raw/crystal-ui" / filename
    if category == "cursor":
        return ROOT / "assets/raw/crystal-cursors" / filename
    raise ValueError(category)


def web_library_path(category: str, filename: str) -> Path:
    stem = Path(filename).stem
    directory = {
        "map": ROOT / "assets/web/libraries",
        "actor": ROOT / "assets/web/actors",
        "effect": ROOT / "assets/web/effects",
        "item": ROOT / "assets/web/items",
        "ui": ROOT / "assets/web/ui",
    }[category]
    return directory / stem / "library.json"


def check_source_locks(sources: dict[str, Any], verify_hashes: bool) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for category, key in (
        ("map", "files"),
        ("actor", "actorFiles"),
        ("effect", "effectFiles"),
        ("item", "itemFiles"),
        ("audio", "audioFiles"),
        ("ui", "uiFiles"),
        ("cursor", "cursorFiles"),
    ):
        entries = []
        for entry in sources.get(key, []):
            path = source_entry_path(sources, category, entry)
            exists = path.is_file()
            size = path.stat().st_size if exists else None
            hash_value = sha256(path) if exists and verify_hashes else None
            lock_ok = exists and size == entry.get("bytes")
            if verify_hashes:
                lock_ok = lock_ok and hash_value == entry.get("sha256")
            entries.append({
                "file": entry["file"],
                "path": str(path.relative_to(ROOT)),
                "exists": exists,
                "bytes": size,
                "lockedBytes": entry.get("bytes"),
                "sha256": hash_value,
                "lockedSha256": entry.get("sha256"),
                "lockOk": lock_ok,
            })
        result[category] = {
            "expected": len(entries),
            "present": sum(item["exists"] for item in entries),
            "locked": sum(item["lockOk"] for item in entries),
            "entries": entries,
        }
    return result


def library_status(category: str, entry: dict[str, Any]) -> dict[str, Any]:
    path = web_library_path(category, entry["file"])
    item: dict[str, Any] = {
        "file": entry["file"],
        "path": str(path.relative_to(ROOT)),
        "exists": path.is_file(),
        "sourceHashOk": False,
        "missing": [],
        "empty": [],
        "frameCount": 0,
    }
    if not path.is_file():
        return item
    try:
        library = read_json(path)
    except ValueError as error:
        item["error"] = str(error)
        return item
    item["sourceHashOk"] = library.get("sourceSha256") == entry.get("sha256")
    item["missing"] = list(library.get("missing", []))
    item["empty"] = list(library.get("empty", []))
    item["frameCount"] = len(library.get("frames", {}))
    item["sourceFrameCount"] = library.get("sourceFrameCount")
    item["librarySchema"] = library.get("schemaVersion")
    return item


def map_status(map_ids: Iterable[str]) -> dict[str, Any]:
    expected = list(map_ids)
    source = source_file_map()
    exported = {}
    for path in (ROOT / "assets/web/maps").glob("*/map.json"):
        try:
            manifest = read_json(path)
        except ValueError as error:
            exported[path.parent.name] = {"path": str(path.relative_to(ROOT)), "error": str(error)}
            continue
        exported[path.parent.name] = manifest

    missing_source = [map_id for map_id in expected if map_id.casefold() not in source]
    missing_export = [map_id for map_id in expected if map_id not in exported]
    malformed: list[str] = []
    dependency_missing: dict[str, dict[str, list[int]]] = {}
    dependency_libraries: dict[str, dict[str, Any]] = {}
    for name in ("Tiles", "SmTiles", "Objects"):
        path = ROOT / "assets/web/libraries" / name / "library.json"
        if not path.is_file():
            dependency_libraries[name] = {"exists": False}
            continue
        library = read_json(path)
        dependency_libraries[name] = {
            "exists": True,
            "frames": len(library.get("frames", {})),
            "empty": len(library.get("empty", [])),
            "missing": len(library.get("missing", [])),
        }
    for map_id in expected:
        manifest = exported.get(map_id)
        if not isinstance(manifest, dict):
            continue
        if manifest.get("id") != map_id or not manifest.get("chunks"):
            malformed.append(map_id)
        missing_for_map: dict[str, list[int]] = {}
        for name, indexes in manifest.get("dependencies", {}).items():
            library_path = ROOT / "assets/web/libraries" / name / "library.json"
            if not library_path.is_file():
                missing_for_map[name] = list(indexes)
                continue
            library = read_json(library_path)
            frames = {str(index) for index in library.get("frames", {})}
            empty = {int(index) for index in library.get("empty", [])}
            absent = [int(index) for index in indexes if str(index) not in frames and int(index) not in empty]
            if absent:
                missing_for_map[name] = absent
        if missing_for_map:
            dependency_missing[map_id] = missing_for_map
    return {
        "expected": len(expected),
        "source": len(source),
        "exported": len(exported),
        "missingSource": missing_source,
        "missingExport": missing_export,
        "malformed": malformed,
        "dependencyMissing": dependency_missing,
        "dependencyLibraries": dependency_libraries,
    }


def guide_status(map_ids: Iterable[str]) -> dict[str, Any]:
    expected = set(map_ids)
    destinations: set[str] = set()
    guide_files = []
    for path in sorted((ROOT / "content/classic-176/p0").glob("world-guide*.txt")):
        guide_files.append(str(path.relative_to(ROOT)))
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            text = path.read_text(encoding="gb18030", errors="replace")
        for line in text.splitlines():
            fields = line.split()
            if len(fields) >= 2 and fields[0].upper() == "MAPMOVE":
                destinations.add(fields[1])
    # The committed guide files cover hand-authored P0 entries.  The complete
    # 570-map catalogue is generated from the same source map set by
    # prepare-runtime.py, so audit that generated text as well.
    prepare_path = ROOT / "scripts/prepare-runtime.py"
    spec = importlib.util.spec_from_file_location("mir2_prepare_runtime", prepare_path)
    if spec is not None and spec.loader is not None:
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        generated = module._build_extended_guide(module.CLASSIC_EXTRA_ROUTES)
        for line in generated.splitlines():
            fields = line.split()
            if len(fields) >= 2 and fields[0].upper() == "MAPMOVE":
                destinations.add(fields[1])
    return {
        "files": len(guide_files),
        "paths": guide_files,
        "destinations": len(destinations),
        "missingDestinations": sorted(expected - destinations - {"0"}),
        "unknownDestinations": sorted(destinations - expected),
    }


def sabuk_status(profile: dict[str, Any], map_ids: Iterable[str]) -> dict[str, Any]:
    sabuk = profile.get("worldRules", {}).get("sabuk", {})
    expected_maps = [str(value) for value in sabuk.get("maps", [])]
    known = {str(value) for value in map_ids}
    missing_maps = [map_id for map_id in expected_maps if map_id not in known]
    castle = ROOT / "vendor/mirserver-data/Mir200" / sabuk.get("castleFile", "")
    runtime = ROOT / ".runtime/server/Mir200" / sabuk.get("castleFile", "")
    text = ""
    if castle.is_file():
        raw = castle.read_bytes()
        text = raw.decode("gb18030", errors="replace")
    required = [
        f"CastleMap={sabuk.get('home', {}).get('map', '3')}",
        f"CastlePlaceMap={sabuk.get('placeMap', '')}",
        f"CastleSecretMap={sabuk.get('secretMap', '')}",
        f"CastleHomeX={sabuk.get('home', {}).get('x', '')}",
        f"CastleHomeY={sabuk.get('home', {}).get('y', '')}",
    ]
    missing_fields = [field for field in required if field not in text]
    return {
        "name": sabuk.get("name"),
        "maps": expected_maps,
        "missingMaps": missing_maps,
        "castleFile": sabuk.get("castleFile"),
        "castleExists": castle.is_file(),
        "runtimeCastleExists": runtime.is_file(),
        "missingFields": missing_fields,
        "ok": not missing_maps and castle.is_file() and not missing_fields,
    }


def quest_status() -> dict[str, Any]:
    spec = importlib.util.spec_from_file_location("quest_catalog_audit", ROOT / "tools/quest_catalog_audit.py")
    if spec is None or spec.loader is None:
        return {"ok": False, "error": "quest catalog missing"}
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    report = module.audit()
    return {
        "ok": bool(report.get("ok")),
        "sourceEntries": report.get("sourceEntries", 0),
        "runtimeEntries": report.get("runtimeEntries", 0),
        "missingRuntimeMaps": report.get("missingRuntimeMaps", []),
        "missingRuntimeScripts": report.get("missingRuntimeScripts", []),
        "missingRuntimeBindings": report.get("missingRuntimeBindings", []),
        "missingRuntimeTriggers": report.get("missingRuntimeTriggers", []),
    }


def world_catalog_status() -> dict[str, Any]:
    spec = importlib.util.spec_from_file_location("world_catalog_audit", ROOT / "tools/world_catalog_audit.py")
    if spec is None or spec.loader is None:
        return {"ok": False, "error": "world catalog missing"}
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    report = module.audit()
    return {
        "ok": bool(report.get("ok")),
        "uniqueMonsters": report.get("uniqueMonsters", 0),
        "spawnRows": report.get("spawnRows", 0),
        "dropFiles": report.get("dropFiles", 0),
        "visuals": report.get("visuals", 0),
        "missingSql": report.get("missingSql", []),
        "unexpectedSql": report.get("unexpectedSql", []),
        "knownSqlGaps": report.get("knownSqlGaps", []),
        "missingDrops": report.get("missingDrops", []),
        "missingVisuals": report.get("missingVisuals", []),
        "missingBaseline": report.get("missingBaseline", []),
    }


def catalog_status(profile: dict[str, Any]) -> dict[str, Any]:
    baseline = profile.get("p0Baseline", {})
    sql_path = ROOT / ".runtime/sql/02-mir2_data.sql"
    names: set[str] = set()
    if sql_path.is_file():
        for line in sql_path.read_text(encoding="utf-8", errors="replace").splitlines():
            if "VALUES (" in line and "'" in line:
                start = line.find("'")
                end = line.find("'", start + 1)
                if start >= 0 and end > start:
                    names.add(line[start + 1:end])
    monsters = list(baseline.get("monsters", []))
    items = list(baseline.get("items", []))
    missing_monsters = [name for name in monsters if name not in names and name.rstrip("0123456789") not in names]
    missing_items = [name for name in items if name not in names]
    return {
        "monsters": {"expected": len(monsters), "missing": missing_monsters},
        "items": {"expected": len(items), "missing": missing_items},
        "ok": not missing_monsters and not missing_items,
    }


def audit(*, verify_hashes: bool = False) -> dict[str, Any]:
    profile = read_json(ROOT / "content/classic-176/version-profile.json")
    sources = read_json(ROOT / "content/classic-176/asset-sources.json")
    maps = profile_map_ids(profile)
    source_locks = check_source_locks(sources, verify_hashes)
    asset_libraries = {
        category: [library_status(category, entry) for entry in sources.get(key, [])]
        for category, key in (
            ("actor", "actorFiles"),
            ("effect", "effectFiles"),
            ("item", "itemFiles"),
            ("ui", "uiFiles"),
        )
    }
    source_failures = [
        f"{category}:{entry['file']}"
        for category, value in source_locks.items()
        for entry in value["entries"]
        if not entry["lockOk"]
    ]
    library_failures = [
        f"{category}:{entry['file']}"
        for category, entries in asset_libraries.items()
        for entry in entries
        if not entry["exists"] or not entry["sourceHashOk"] or entry.get("missing")
    ]
    map_report = map_status(maps)
    guide_report = guide_status(maps)
    sabuk_report = sabuk_status(profile, maps)
    quest_report = quest_status()
    catalog_report = catalog_status(profile)
    world_catalog_report = world_catalog_status()
    failures = {
        "sourceLocks": source_failures,
        "libraries": library_failures,
        "maps": map_report["missingSource"] + map_report["missingExport"] + map_report["malformed"],
        "mapDependencies": map_report["dependencyMissing"],
        "routes": guide_report["missingDestinations"] + guide_report["unknownDestinations"],
        "sabuk": sabuk_report["missingMaps"] + sabuk_report["missingFields"] + ([] if sabuk_report["castleExists"] else [sabuk_report["castleFile"]]),
        "quests": [] if quest_report.get("sourceEntries") else ["MapQuest.txt"],
        "catalog": catalog_report["monsters"]["missing"] + catalog_report["items"]["missing"],
        "worldCatalog": world_catalog_report.get("unexpectedSql", []) + world_catalog_report.get("missingBaseline", []),
    }
    ok = not any(failures.values())
    return {
        "schemaVersion": 1,
        "profile": {"id": profile["id"], "label": profile["label"], "status": profile["status"]},
        "verifyHashes": verify_hashes,
        "ok": ok,
        "maps": map_report,
        "routes": guide_report,
        "sabuk": sabuk_report,
        "quests": quest_report,
        "catalog": catalog_report,
        "worldCatalog": world_catalog_report,
        "sourceLocks": source_locks,
        "libraries": asset_libraries,
        "declaredUnresolved": profile.get("unresolved", []),
        "failures": failures,
    }


def markdown(report: dict[str, Any]) -> str:
    maps = report["maps"]
    routes = report["routes"]
    locks = report["sourceLocks"]
    libraries = report["libraries"]
    lines = [
        f"# 内容审计：{report['profile']['label']}",
        "",
        f"- 结果：**{'通过' if report['ok'] else '存在缺口'}**",
        f"- 运行模式：{'校验 SHA-256' if report['verifyHashes'] else '校验文件大小与生成清单哈希'}",
        f"- 地图：{maps['exported']}/{maps['expected']} 张已导出；源地图 {maps['source']} 张",
        f"- 路线向导：{routes['destinations']} 个目标，缺失 {len(routes['missingDestinations'])} 个",
        f"- 沙巴克：{len(report.get('sabuk', {}).get('maps', []))} 张城堡地图，配置文件 {'存在' if report.get('sabuk', {}).get('castleExists') else '缺失'}",
        f"- 任务：源 MapQuest {report.get('quests', {}).get('sourceEntries', 0)} 条",
        f"- 清单：怪物 {report.get('catalog', {}).get('monsters', {}).get('expected', 0)}，物品 {report.get('catalog', {}).get('items', {}).get('expected', 0)}",
        f"- 世界刷怪：{report.get('worldCatalog', {}).get('uniqueMonsters', 0)} 种 / {report.get('worldCatalog', {}).get('spawnRows', 0)} 条，掉落文件 {report.get('worldCatalog', {}).get('dropFiles', 0)}，已映射外观 {report.get('worldCatalog', {}).get('visuals', 0)}，缺 SQL {len(report.get('worldCatalog', {}).get('missingSql', []))}，缺掉落 {len(report.get('worldCatalog', {}).get('missingDrops', []))}，缺外观 {len(report.get('worldCatalog', {}).get('missingVisuals', []))}",
        "",
        "## 素材锁",
        "",
        "| 类别 | 期望 | 已存在 | 锁定通过 |",
        "|---|---:|---:|---:|",
    ]
    for category, value in locks.items():
        lines.append(f"| {category} | {value['expected']} | {value['present']} | {value['locked']} |")
    lines.extend(["", "## Web 素材库", "", "| 类别 | 库数量 | 缺失/哈希异常 |", "|---|---:|---:|"])
    for category, entries in libraries.items():
        bad = sum(not entry["exists"] or not entry["sourceHashOk"] or bool(entry.get("missing")) for entry in entries)
        lines.append(f"| {category} | {len(entries)} | {bad} |")
    lines.extend(["", "## 缺口", ""])
    any_failure = False
    for category, values in report["failures"].items():
        if not values:
            continue
        any_failure = True
        lines.append(f"- **{category}**：`{json.dumps(values, ensure_ascii=False)}`")
    if not any_failure:
        lines.append("- 未发现生成链路缺口。")
    lines.extend(["", "## 已声明待校准项", ""])
    for item in report["declaredUnresolved"]:
        lines.append(f"- {item}")
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", type=Path, help="write the JSON report to this path")
    parser.add_argument("--markdown", type=Path, help="write the Markdown report to this path")
    parser.add_argument("--verify-hashes", action="store_true", help="hash every raw source file")
    args = parser.parse_args()
    report = audit(verify_hashes=args.verify_hashes)
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if args.markdown:
        args.markdown.parent.mkdir(parents=True, exist_ok=True)
        args.markdown.write_text(markdown(report), encoding="utf-8")
    print(json.dumps({"ok": report["ok"], "maps": report["maps"]["exported"], "expectedMaps": report["maps"]["expected"], "worldCatalog": {"unique": report.get("worldCatalog", {}).get("uniqueMonsters"), "drops": report.get("worldCatalog", {}).get("dropFiles"), "visuals": report.get("worldCatalog", {}).get("visuals")}, "failures": report["failures"]}, ensure_ascii=False))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
