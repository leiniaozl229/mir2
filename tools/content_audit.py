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
import re
import struct
import sys
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[1]


def load_tool(name: str) -> Any:
    spec = importlib.util.spec_from_file_location(f"content_audit_{name}", ROOT / "tools" / f"{name}.py")
    if spec is None or spec.loader is None:
        raise ValueError(f"audit tool unavailable: {name}")
    module = importlib.util.module_from_spec(spec)
    old_path = list(sys.path)
    try:
        sys.path.insert(0, str(ROOT / "tools"))
        spec.loader.exec_module(module)
    finally:
        sys.path[:] = old_path
    return module


def contained_path(root: Path, relative: str) -> Path:
    if not isinstance(relative, str) or not relative or "\\" in relative:
        raise ValueError("expected a nonempty forward-slash relative path")
    parts = Path(relative)
    if parts.is_absolute() or ":" in relative or ".." in parts.parts:
        raise ValueError(f"path escapes its source root: {relative}")
    result = (root / parts).resolve()
    if not result.is_relative_to(root.resolve()):
        raise ValueError(f"path escapes its source root: {relative}")
    return result


def validate_active_contract(contract: Any) -> list[str]:
    """Validate the portable, hash-pinned contract before accessing its paths."""
    errors: list[str] = []
    if not isinstance(contract, dict) or contract.get("schemaVersion") != 1:
        return ["active contract schemaVersion must be 1"]
    for key in ("id", "targetVersion", "scope"):
        if not isinstance(contract.get(key), str) or not contract[key]:
            errors.append(f"active contract requires {key}")
    roots = contract.get("roots", {})
    if not isinstance(roots, dict) or roots.get("repository") != ".":
        errors.append("active contract repository root must be .")
        roots = {}
    if any(not isinstance(value, str) or not value for value in roots.values()):
        errors.append("source roots must be nonempty strings")
    assets = contract.get("assets")
    if not isinstance(assets, list) or not assets:
        return errors + ["active contract requires nonempty assets"]
    ids: set[str] = set()
    namespaces: set[str] = set()
    manifests: set[str] = set()
    for asset in assets:
        if not isinstance(asset, dict):
            errors.append("asset must be an object")
            continue
        identifier = asset.get("id", "<missing>")
        if not isinstance(identifier, str) or identifier in ids:
            errors.append(f"duplicate/invalid asset id: {identifier}")
        else:
            ids.add(identifier)
        for key in ("version", "namespace"):
            if not isinstance(asset.get(key), str) or not asset[key]:
                errors.append(f"{identifier}: requires {key}")
        if asset.get("role") not in ("active_required", "reference_candidate"):
            errors.append(f"{identifier}: invalid role")
        if asset.get("provenance") not in ("native_pixels", "reference_source"):
            errors.append(f"{identifier}: invalid provenance")
        if asset.get("category") not in ("map", "actor", "effect", "item", "audio", "ui", "cursor"):
            errors.append(f"{identifier}: invalid category")
        if asset.get("kind") not in ("library", "file"):
            errors.append(f"{identifier}: invalid kind")
        if asset.get("role") == "active_required":
            namespace = asset.get("namespace")
            if isinstance(namespace, str):
                if namespace in namespaces:
                    errors.append(f"{identifier}: duplicate active namespace {namespace}")
                namespaces.add(namespace)
        sources = asset.get("sourceFiles")
        if not isinstance(sources, list) or not sources:
            errors.append(f"{identifier}: requires sourceFiles")
            continue
        purposes = []
        for entry in sources:
            if not isinstance(entry, dict):
                errors.append(f"{identifier}: source must be an object")
                continue
            if entry.get("root") not in roots:
                errors.append(f"{identifier}: unknown source root")
            if entry.get("purpose") not in ("identity", "data", "index"):
                errors.append(f"{identifier}: invalid source purpose")
            purposes.append(entry.get("purpose"))
            if type(entry.get("bytes")) is not int or entry["bytes"] < 0:
                errors.append(f"{identifier}: requires source bytes")
            if not isinstance(entry.get("sha256"), str) or not re.fullmatch(r"[0-9a-f]{64}", entry["sha256"]):
                errors.append(f"{identifier}: requires a SHA-256 lock")
            try:
                contained_path(ROOT, entry.get("path"))
            except (ValueError, TypeError) as error:
                errors.append(f"{identifier}: {error}")
        if asset.get("kind") == "library":
            library = asset.get("library", {})
            if not isinstance(library, dict):
                errors.append(f"{identifier}: requires library object")
                continue
            if sorted(purposes) != ["data", "index"]:
                errors.append(f"{identifier}: library requires one data/index pair")
            if type(library.get("sourceFrameCount")) is not int or library["sourceFrameCount"] < 1:
                errors.append(f"{identifier}: requires positive sourceFrameCount")
            if library.get("format") != "wil-classic" or library.get("coverage") not in ("all_source", "map_dependencies"):
                errors.append(f"{identifier}: invalid library format/coverage")
            paths = library.get("manifests", [])
            if not isinstance(paths, list) or not paths:
                errors.append(f"{identifier}: requires manifest paths")
                continue
            for path in paths:
                try:
                    contained_path(ROOT / "assets/web", Path(path).relative_to("assets/web").as_posix())
                    namespace = "/" + Path(path).parent.relative_to("assets/web").as_posix()
                    if namespace != asset.get("namespace") or Path(path).name != "library.json":
                        errors.append(f"{identifier}: manifest namespace mismatch")
                    if path in manifests:
                        errors.append(f"{identifier}: duplicate active manifest {path}")
                    manifests.add(path)
                except (TypeError, ValueError) as error:
                    errors.append(f"{identifier}: invalid manifest path: {error}")
        else:
            exports = asset.get("exports")
            if not isinstance(exports, list):
                errors.append(f"{identifier}: requires exports list (empty for native metadata)")
            else:
                for path in exports:
                    try:
                        relative = Path(path).relative_to("assets/web").as_posix()
                        contained_path(ROOT / "assets/web", relative)
                        if "/" + relative != asset.get("namespace"):
                            errors.append(f"{identifier}: export namespace mismatch")
                    except (TypeError, ValueError) as error:
                        errors.append(f"{identifier}: invalid export path: {error}")
    if not any(asset.get("role") == "active_required" for asset in assets if isinstance(asset, dict)):
        errors.append("active contract has no required assets")
    return errors


def active_source_status(contract: dict[str, Any], *, source_roots: dict[str, Path] | None = None,
                         verify_hashes: bool = False) -> dict[str, Any]:
    """Required SHA locks are always checked; candidates cannot satisfy them."""
    errors = validate_active_contract(contract)
    contract = contract if isinstance(contract, dict) else {}
    result: dict[str, Any] = {"id": contract.get("id"), "targetVersion": contract.get("targetVersion"),
        "scope": contract.get("scope"), "contractErrors": errors, "entries": [],
        "referenceCandidates": [], "sourceLocks": {}, "libraries": {}, "failures": [],
        "pixelComparison": "PNG hashes are checked against export manifests; native indexes/geometry against locked WIL/WIX. Full native pixel re-decoding and browser comparison are not performed."}
    if errors:
        return result
    roots = {key: ROOT if key == "repository" else Path(value) for key, value in contract["roots"].items()}
    for key, value in (source_roots or {}).items():
        if key == "repository" or key not in roots:
            result["contractErrors"].append(f"cannot override source root {key}")
        else:
            roots[key] = Path(value)
    if result["contractErrors"]:
        return result
    hash_cache: dict[Path, str] = {}
    json_cache: dict[Path, Any] = {}
    def digest(path: Path) -> str:
        if path not in hash_cache:
            hash_cache[path] = sha256(path)
        return hash_cache[path]
    def manifest(path: Path) -> Any:
        if path not in json_cache:
            json_cache[path] = read_json(path)
        return json_cache[path]
    decoder = None
    for asset in contract["assets"]:
        required = asset["role"] == "active_required"
        item: dict[str, Any] = {key: asset[key] for key in ("id", "role", "provenance", "version", "namespace", "category", "kind")}
        item.update({"sources": [], "exports": [], "libraries": [], "failures": []})
        paths = {}
        for entry in asset["sourceFiles"]:
            path = contained_path(roots[entry["root"]], entry["path"])
            exists = path.is_file()
            actual_hash = digest(path) if exists and (required or verify_hashes) else None
            value = {"file": entry["path"], "path": str(path), "exists": exists,
                "bytes": path.stat().st_size if exists else None, "lockedBytes": entry["bytes"],
                "sha256": actual_hash, "lockedSha256": entry["sha256"],
                "hashChecked": required or verify_hashes,
                "lockOk": exists and path.stat().st_size == entry["bytes"] and (actual_hash == entry["sha256"] if required or verify_hashes else True)}
            item["sources"].append(value)
            paths[entry["purpose"]] = path
            if not value["lockOk"]:
                item["failures"].append({"reason": "source_missing" if not exists else "source_lock_mismatch", "path": str(path)})
        binding = asset.get("contractBinding")
        if binding and required:
            try:
                bound = manifest(contained_path(ROOT, binding["path"]))
                for key in binding["key"].split("."):
                    bound = bound[key]
                if binding.get("file"):
                    matching = [entry for entry in bound if entry.get("file") == binding["file"]]
                    if len(matching) != 1:
                        raise ValueError("source binding must identify one original lock")
                    bound = matching[0]
                    mismatch = bound["sha256"] != asset["sourceFiles"][0]["sha256"] or bound["bytes"] != asset["sourceFiles"][0]["bytes"]
                else:
                    expected = {e["purpose"]: e for e in asset["sourceFiles"]}
                    mismatch = bound["sourceSha256"] != expected["data"]["sha256"] or bound["indexSha256"] != expected["index"]["sha256"] or bound["frameCount"] != asset["library"]["sourceFrameCount"]
                if mismatch:
                    item["failures"].append({"reason": "source_contract_mismatch", "path": binding["path"]})
            except (KeyError, TypeError, ValueError) as error:
                item["failures"].append({"reason": "source_contract_invalid", "error": str(error)})
        if required and asset["kind"] == "file":
            expected_hash = asset["sourceFiles"][0]["sha256"]
            for relative in asset["exports"]:
                path = contained_path(ROOT, relative)
                exists = path.is_file()
                valid = exists and digest(path) == expected_hash
                item["exports"].append({"path": relative, "exists": exists, "hashOk": valid})
                if not valid:
                    item["failures"].append({"reason": "export_missing" if not exists else "export_hash_mismatch", "path": relative})
                if exists and asset["category"] == "cursor":
                    with path.open("rb") as stream:
                        header = stream.read(6)
                    if len(header) != 6 or struct.unpack("<HHH", header)[:2] != (0, 2) or struct.unpack("<HHH", header)[2] < 1:
                        item["failures"].append({"reason": "cursor_is_not_original_cur_format", "path": relative})
            if asset.get("exportManifest"):
                descriptor = asset["exportManifest"]
                try:
                    rows = manifest(contained_path(ROOT, descriptor["path"]))
                    matches = [row for row in rows if row.get("file") == descriptor["file"]]
                    if len(matches) != 1 or matches[0].get("sha256") != expected_hash:
                        item["failures"].append({"reason": "export_manifest_identity", "path": descriptor["path"]})
                except (AttributeError, TypeError, ValueError) as error:
                    item["failures"].append({"reason": "export_manifest_invalid", "error": str(error)})
        if required and asset["kind"] == "library":
            reader = None
            if all(value["lockOk"] for value in item["sources"]):
                try:
                    if decoder is None:
                        decoder = load_tool("wil_lib")
                    reader = decoder.WeMadeLibrary(paths["data"], paths["index"])
                    if reader.count != asset["library"]["sourceFrameCount"]:
                        item["failures"].append({"reason": "source_frame_count", "actual": reader.count})
                except (OSError, ValueError) as error:
                    item["failures"].append({"reason": "source_library_invalid", "error": str(error)})
            locks = {entry["purpose"]: entry for entry in asset["sourceFiles"]}
            for relative in asset["library"]["manifests"]:
                item["libraries"].append(active_library_status(asset, relative, locks, reader, manifest, digest, verify_hashes))
        item["ok"] = not item["failures"] and all(lib["ok"] for lib in item["libraries"])
        result["entries" if required else "referenceCandidates"].append(item)
        if required:
            category = asset["category"]
            group = result["sourceLocks"].setdefault(category, {"expected": 0, "present": 0, "locked": 0, "entries": []})
            group["entries"].extend(item["sources"])
            group["expected"] += len(item["sources"])
            group["present"] += sum(value["exists"] for value in item["sources"])
            group["locked"] += sum(value["lockOk"] for value in item["sources"])
            result["libraries"].setdefault(category, []).extend(item["libraries"])
            if not item["ok"]:
                result["failures"].append({"id": item["id"], "sourceFailures": item["failures"],
                    "libraryFailures": [{"path": lib["path"], "failures": lib["failures"]} for lib in item["libraries"] if not lib["ok"]]})
    result["ok"] = not result["failures"] and not result["contractErrors"]
    return result


def active_library_status(asset: dict[str, Any], relative: str, locks: dict[str, Any], reader: Any,
                          read: Any, digest: Any, verify_hashes: bool) -> dict[str, Any]:
    path = contained_path(ROOT, relative)
    result: dict[str, Any] = {"id": asset["id"], "file": locks["data"]["path"], "path": relative,
        "namespace": asset["namespace"], "exists": path.is_file(), "sourceHashOk": False,
        "frameCount": 0, "missing": [], "empty": [], "failures": []}
    if not result["exists"]:
        result["failures"].append({"reason": "library_missing"})
        result["ok"] = False
        return result
    try:
        data = read(path)
        if not isinstance(data, dict) or not isinstance(data.get("frames"), dict):
            raise ValueError("library must contain frames object")
        result.update({"sourceFrameCount": data.get("sourceFrameCount"), "librarySchema": data.get("schemaVersion"),
            "frameCount": len(data["frames"]), "missing": data.get("missing", []), "empty": data.get("empty", [])})
        count = asset["library"]["sourceFrameCount"]
        result["sourceHashOk"] = data.get("sourceSha256") == locks["data"]["sha256"] and data.get("indexSha256") == locks["index"]["sha256"]
        if not result["sourceHashOk"]:
            result["failures"].append({"reason": "library_source_hash"})
        if str(data.get("source", "")).casefold() != locks["data"]["path"].casefold() or str(data.get("index", "")).casefold() != locks["index"]["path"].casefold():
            result["failures"].append({"reason": "library_source_identity"})
        if data.get("schemaVersion") != 1 or data.get("format") != asset["library"]["format"] or data.get("sourceFrameCount") != count:
            result["failures"].append({"reason": "library_schema_format_frame_count"})
        if asset["library"].get("profile") and data.get("profile") != asset["library"]["profile"]:
            result["failures"].append({"reason": "library_profile_mismatch"})
        frame_indexes = {int(value) for value in data["frames"] if str(int(value)) == value}
        if len(frame_indexes) != len(data["frames"]):
            raise ValueError("frame keys must be canonical zero-based integers")
        if any(type(value) is not int for value in result["empty"]):
            raise ValueError("empty indexes must be integers")
        empty = set(result["empty"])
        invalid = sorted(index for index in frame_indexes | empty if not 0 <= index < count)
        if invalid or frame_indexes & empty or len(empty) != len(result["empty"]):
            result["failures"].append({"reason": "library_index_identity", "invalid": invalid, "overlap": sorted(frame_indexes & empty)})
        if asset["library"]["coverage"] == "all_source":
            missing = sorted(set(range(count)) - frame_indexes - empty)
            if missing:
                result["failures"].append({"reason": "source_frames_not_exported", "indexes": missing})
        if result["missing"]:
            result["failures"].append({"reason": "declared_missing_frames", "indexes": result["missing"]})
        geometry_failures, export_failures = [], []
        for index in sorted(frame_indexes | empty):
            if not 0 <= index < count:
                continue
            geometry = None
            if reader is not None and index < reader.count:
                offset = reader.offsets[index]
                if offset:
                    if offset < 0 or offset + reader.image_header_size > len(reader.data):
                        raise ValueError(f"invalid native frame header {index}")
                    geometry = struct.unpack_from("<hhhh", reader.data, offset)
                    width, height = geometry[:2]
                    if width < 0 or height < 0 or width * height > 16_777_216 or offset + reader.image_header_size + width * height > len(reader.data):
                        raise ValueError(f"invalid native frame geometry/pixels {index}")
                    if not width or not height:
                        geometry = None
            if index in empty:
                if geometry is not None:
                    geometry_failures.append({"index": index, "reason": "nonempty_source_marked_empty"})
                continue
            frame = data["frames"][str(index)]
            if frame.get("index") != index:
                geometry_failures.append({"index": index, "reason": "source_index_mismatch"})
            if "sourceIndex" in frame and frame["sourceIndex"] != index:
                geometry_failures.append({"index": index, "reason": "source_index_mismatch"})
            if ("sourceSha256" in frame and frame["sourceSha256"] != locks["data"]["sha256"]) or ("indexSha256" in frame and frame["indexSha256"] != locks["index"]["sha256"]):
                geometry_failures.append({"index": index, "reason": "frame_source_hash_mismatch"})
            expected = tuple(frame.get(key) for key in ("width", "height", "offsetX", "offsetY"))
            if any(type(value) is not int for value in expected) or expected[0] <= 0 or expected[1] <= 0:
                geometry_failures.append({"index": index, "reason": "invalid_signed_geometry"})
            elif reader is not None and geometry != expected:
                geometry_failures.append({"index": index, "reason": "native_geometry_mismatch"})
            filename = frame.get("file")
            exported = contained_path(path.parent, filename)
            if Path(filename).name != filename or not filename.endswith(".png"):
                raise ValueError(f"frame {index} filename must be a PNG basename")
            if not isinstance(frame.get("sha256"), str) or not re.fullmatch(r"[0-9a-f]{64}", frame["sha256"]):
                export_failures.append({"index": index, "reason": "export_hash_lock_missing"})
            if not exported.is_file():
                export_failures.append({"index": index, "reason": "export_missing"})
                continue
            with exported.open("rb") as stream:
                header = stream.read(24)
            if len(header) != 24 or header[:8] != b"\x89PNG\r\n\x1a\n" or header[12:16] != b"IHDR" or struct.unpack_from(">II", header, 16) != expected[:2]:
                export_failures.append({"index": index, "reason": "png_geometry_mismatch"})
            if digest(exported) != frame.get("sha256"):
                export_failures.append({"index": index, "reason": "export_hash_mismatch"})
        if geometry_failures:
            result["failures"].append({"reason": "frame_geometry", "entries": geometry_failures})
        if export_failures:
            result["failures"].append({"reason": "frame_exports", "entries": export_failures})
    except (OSError, ValueError, TypeError, KeyError, struct.error) as error:
        result["failures"].append({"reason": "library_invalid", "error": str(error)})
    result["ok"] = not result["failures"]
    return result


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


def map_binding_status(*, source_roots: dict[str, Path] | None = None) -> dict[str, Any]:
    """Check the selected extended-scene sources once, including actual pixels."""
    try:
        contract = read_json(ROOT / "content/classic-176/map-asset-bindings.json")
        return load_tool("map_asset_bindings").audit_bindings(contract, root=ROOT, source_roots=source_roots)
    except (OSError, ValueError, TypeError) as error:
        return {"contractErrors": [str(error)], "entries": [], "failures": [],
                "historicalFailures": [], "technicalOk": False, "complete": False}


def resolve_bound_map_frame(report: dict[str, Any], *, map_id: str, map_source_sha256: str,
                            layer: str, library: str, index: int) -> dict[str, Any] | None:
    return load_tool("map_asset_bindings").resolve_bound_frame(report, map_id=map_id,
        map_source_sha256=map_source_sha256, layer=layer, library=library, index=index)


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
    library_cache: dict[str, dict[str, Any]] = {}
    names = {"Tiles", "SmTiles", "Objects"}
    names.update(name for data in exported.values() if isinstance(data, dict)
                 for name in data.get("dependencies", {}) if re.fullmatch(r"[A-Za-z0-9_-]+", name))
    for name in sorted(names):
        path = ROOT / "assets/web/libraries" / name / "library.json"
        if not path.is_file():
            dependency_libraries[name] = {"exists": False}
            continue
        try:
            library = read_json(path)
            if not isinstance(library.get("frames", {}), dict):
                raise ValueError("library frames must be an object")
        except (ValueError, AttributeError) as error:
            dependency_libraries[name] = {"exists": True, "error": str(error)}
            continue
        library_cache[name] = library
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
        source_path = source.get(map_id.casefold())
        if manifest.get("id") != map_id or manifest.get("format") != "classic-12" or not manifest.get("chunks") or (source_path and manifest.get("sourceSha256") != sha256(source_path)):
            malformed.append(map_id)
        missing_for_map: dict[str, list[int]] = {}
        for name, indexes in manifest.get("dependencies", {}).items():
            library = library_cache.get(name)
            if library is None:
                missing_for_map[name] = list(indexes)
                continue
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


def resource_coverage_status() -> dict[str, Any]:
    """Use the production catalog, including extensions; no generated count is a target."""
    try:
        module = load_tool("resource_catalog")
        data = module.build()
        validation = module.validate(data)
        diagnostics = data.get("diagnostics", {})
        missing_items = [{"id": row["id"], "name": row["name"], "index": row.get("iconIndex"),
            "resolution": row.get("iconResolution")} for row in data["items"] if not row.get("iconUrl")]
        missing_skills = [{"id": row["idx"], "name": row["name"], "magicId": row["magicId"],
            "resolution": row.get("iconResolution")} for row in data["skills"] if not row.get("iconUrl")]
        conflicts = diagnostics.get("duplicateMagicIds", [])
        return {"ok": not validation and not missing_items and not missing_skills and not conflicts,
            "source": data.get("source", {}), "summary": data.get("summary", {}), "validation": validation,
            "missingItemIcons": missing_items, "missingSkillIcons": missing_skills,
            "duplicateMagicIds": conflicts, "magicIdentityConflicts": diagnostics.get("magicIdentityConflicts", []),
            "scope": "Generated seed/catalog resource and identity coverage; not a live DB or browser comparison"}
    except (OSError, ValueError, KeyError, TypeError) as error:
        return {"ok": False, "error": str(error), "validation": ["resource catalog unavailable"],
            "missingItemIcons": [], "missingSkillIcons": [], "duplicateMagicIds": []}


def audit(*, verify_hashes: bool = False, source_roots: dict[str, Path] | None = None) -> dict[str, Any]:
    profile = read_json(ROOT / "content/classic-176/version-profile.json")
    maps = profile_map_ids(profile)
    try:
        contract = read_json(ROOT / "content/classic-176/active-asset-sources.json")
        active = active_source_status(contract, source_roots=source_roots, verify_hashes=verify_hashes)
    except (OSError, ValueError, TypeError) as error:
        active = {"ok": False, "contractErrors": [str(error)], "entries": [],
            "referenceCandidates": [], "sourceLocks": {}, "libraries": {}, "failures": []}
    source_locks = active["sourceLocks"]
    asset_libraries = active["libraries"]
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
        if not entry["ok"]
    ]
    map_report = map_status(maps)
    bindings = map_binding_status(source_roots=source_roots)
    # Retain national dependencyMissing unchanged for original-version fidelity.
    # The selected reference scene has a separate, narrow rendering assessment.
    render_missing = {map_id: {name: list(indexes) for name, indexes in libraries.items()}
                      for map_id, libraries in map_report["dependencyMissing"].items()}
    for entry in bindings["entries"]:
        if not entry.get("selectionActive"):
            continue
        missing = render_missing.get(entry["mapId"], {})
        indexes = missing.get(entry["library"], [])
        remaining = sorted(set(indexes) - set(entry["renderIndices"]))
        if remaining:
            missing[entry["library"]] = remaining
        else:
            missing.pop(entry["library"], None)
        if not missing:
            render_missing.pop(entry["mapId"], None)
    map_report["renderDependencyMissing"] = render_missing
    map_report["assetBindings"] = bindings
    guide_report = guide_status(maps)
    sabuk_report = sabuk_status(profile, maps)
    quest_report = quest_status()
    catalog_report = catalog_status(profile)
    world_catalog_report = world_catalog_status()
    resource_coverage = resource_coverage_status()
    failures = {
        "activeContract": active["contractErrors"],
        "activeAssets": active["failures"],
        "sourceLocks": source_failures,
        "libraries": library_failures,
        "maps": map_report["missingSource"] + map_report["missingExport"] + map_report["malformed"],
        "mapDependencies": map_report["dependencyMissing"],
        "mapRenderDependencies": map_report["renderDependencyMissing"],
        "mapBindingContract": bindings["contractErrors"] + bindings["failures"],
        "mapHistoricalPairing": bindings["historicalFailures"],
        "routes": guide_report["missingDestinations"] + guide_report["unknownDestinations"],
        "sabuk": sabuk_report["missingMaps"] + sabuk_report["missingFields"] + ([] if sabuk_report["castleExists"] else [sabuk_report["castleFile"]]),
        "quests": [] if quest_report.get("sourceEntries") else ["MapQuest.txt"],
        "catalog": catalog_report["monsters"]["missing"] + catalog_report["items"]["missing"],
        "worldCatalog": world_catalog_report.get("unexpectedSql", []) + world_catalog_report.get("missingBaseline", []),
        "resourceCoverage": [] if resource_coverage["ok"] else {
            "validation": resource_coverage["validation"],
            "missingItemIcons": resource_coverage["missingItemIcons"],
            "missingSkillIcons": resource_coverage["missingSkillIcons"],
            "duplicateMagicIds": resource_coverage["duplicateMagicIds"],
        },
    }
    ok = not any(failures.values())
    return {
        "schemaVersion": 1,
        "profile": {"id": profile["id"], "label": profile["label"], "status": profile["status"]},
        "verifyHashes": verify_hashes,
        "ok": ok,
        "complete": ok,
        "scope": "Active resource identity/geometry and generated-content coverage; original-client and browser parity remain unverified",
        "activeSources": {key: value for key, value in active.items() if key not in ("sourceLocks", "libraries", "referenceCandidates")},
        "referenceCandidates": active["referenceCandidates"],
        "maps": map_report,
        "routes": guide_report,
        "sabuk": sabuk_report,
        "quests": quest_report,
        "catalog": catalog_report,
        "worldCatalog": world_catalog_report,
        "resourceCoverage": resource_coverage,
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
        "- 运行模式：必需源与所有导出文件始终校验 SHA-256、原索引和有符号偏移",
        f"- 参考候选：{len(report.get('referenceCandidates', []))} 项；{'同时校验候选 SHA-256' if report['verifyHashes'] else '候选缺失单独报告，不提供当前库回退证明'}",
        "- 范围：资源身份、帧几何和生成内容依赖；原端运行与浏览器比较待验收",
        f"- 地图：{maps['exported']}/{maps['expected']} 张已导出；源地图 {maps['source']} 张",
        f"- 地图参考绑定：{sum(bool(entry.get('selectionActive')) for entry in maps.get('assetBindings', {}).get('entries', []))} 项已选择；当前渲染缺依赖 {sum(len(indexes) for libraries in maps.get('renderDependencyMissing', {}).values() for indexes in libraries.values())}，原 national 缺依赖 {sum(len(indexes) for libraries in maps.get('dependencyMissing', {}).values() for indexes in libraries.values())}；历史配对独立验收",
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
        bad = sum(not entry["ok"] for entry in entries)
        lines.append(f"| {category} | {len(entries)} | {bad} |")
    lines.extend(["", "## 缺口", ""])
    coverage = report.get("resourceCoverage", {})
    lines.append(f"- 扩展目录覆盖：物品缺图标 {len(coverage.get('missingItemIcons', []))}，技能缺图标 {len(coverage.get('missingSkillIcons', []))}，技能身份冲突 {coverage.get('duplicateMagicIds', [])}。")
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
    parser.add_argument("--verify-hashes", action="store_true", help="also hash optional reference candidates; active sources/exports are always hashed")
    parser.add_argument("--client-dir", type=Path, help="override the hash-locked national installation directory (Data and Wav)")
    args = parser.parse_args()
    roots = {"nationalData": args.client_dir / "Data", "nationalWav": args.client_dir / "Wav"} if args.client_dir else None
    report = audit(verify_hashes=args.verify_hashes, source_roots=roots)
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if args.markdown:
        args.markdown.parent.mkdir(parents=True, exist_ok=True)
        args.markdown.write_text(markdown(report), encoding="utf-8")
    print(json.dumps({"ok": report["ok"], "complete": report["complete"], "maps": report["maps"]["exported"], "expectedMaps": report["maps"]["expected"], "failureCounts": {key: len(value) for key, value in report["failures"].items() if value}, "resourceCoverage": {"missingItems": len(report["resourceCoverage"]["missingItemIcons"]), "missingSkills": len(report["resourceCoverage"]["missingSkillIcons"]), "duplicateMagicIds": report["resourceCoverage"]["duplicateMagicIds"]}}, ensure_ascii=False))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
