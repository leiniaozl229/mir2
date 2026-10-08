#!/usr/bin/env python3
"""Import exact Objects2..Objects7 frames selected by classic MAP btArea.

MAP front-layer indices are not a single Objects.wil namespace. The original
client reads btArea at byte 10 and selects Objects.wil / Objects2.wil ..
Objects7.wil. This importer scans the already-exported, hash-locked 12-byte
cells and exports only the referenced frames. Areas 7..14 require Objects8..
Objects15, which are absent from the locked 2003 installation and remain
explicitly unresolved. Areas above 14 follow the reference client's fallback
to Objects.wil.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import struct
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from wil_lib import WeMadeLibrary, WeMadeFormatError
from crystal_lib import png_rgba

CELL = struct.Struct("<HHHBBBBBB")
AREA_TO_LIBRARY = {area: f"Objects{area + 1}" for area in range(1, 7)}
LIBRARIES = tuple(AREA_TO_LIBRARY.values())
SOURCE_LOCKS = {
    "Objects2": {
        "sourceSha256": "ff2730552e57007d0b4853fa18d119af2a6314f6d5404402b15138ab5849fed2",
        "indexSha256": "38cdbef3b586e39c66f175183bef5aff480768e5dbec8e08d6b22f6b6deea729",
    },
    "Objects3": {
        "sourceSha256": "03662dce4b451535a4be91e94745bda57c10f4aa33735033e84c34346ef50163",
        "indexSha256": "a00a376b60a79c0fc55e875424cc31e376ed5aa6f7f74b0030bc6cf6d298874f",
    },
    "Objects4": {
        "sourceSha256": "63383c8ed6e77bbee9ac6db91a9de00207b1f70cc42dd83d23f19c3d77ae7ce7",
        "indexSha256": "8baea3402617ffb53ded0d3cf758800c6b3a1a68df04c9d30b1945faa93d4897",
    },
    "Objects5": {
        "sourceSha256": "48ce0f6de481f67925b5f35774da84e8ec64436510e7581e641b77f205c45bac",
        "indexSha256": "3fe2cbb819d1db73ea4f1a414d6694506418e403b8738dab4a4f33d37f864cf0",
    },
    "Objects6": {
        "sourceSha256": "85794a7235862522a433319faa27e2d9b081b6b35a79e299ed9aef7980313539",
        "indexSha256": "9fb569d77d77dd4ca49b627c0e8ffacc7bfc1e55a04beb77b620fa64cf8b834b",
    },
    "Objects7": {
        "sourceSha256": "888b050987422247ed3a6954255e00afd547fadbc37d0fd87c5458660f02452b",
        "indexSha256": "2754be258a076085330c4da96ce1d4d4bed04153b2a53607fa00f0165fc321cc",
    },
}


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".object-banks.tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n",
                         encoding="utf-8")
    temporary.replace(path)


def collect_dependencies(profile_path, maps_dir, map_ids=None):
    profile_path, maps_dir = Path(profile_path), Path(maps_dir)
    profile = read_json(profile_path)
    all_maps = profile.get("p0Baseline", {}).get("maps", [])
    if not isinstance(all_maps, list) or not all_maps or len(all_maps) != len(set(all_maps)):
        raise ValueError("profile must contain unique nonempty p0Baseline.maps")
    if any(not isinstance(name, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", name)
           for name in all_maps):
        raise ValueError("profile contains an invalid map id")
    selected = list(dict.fromkeys(map_ids)) if map_ids is not None else all_maps
    if not selected or set(selected) - set(all_maps):
        raise ValueError("requested maps must be a nonempty subset of the profile")

    references = {name: {} for name in LIBRARIES}
    maps, unresolved_maps = [], []
    missing_banks = {}
    area_counts = {}
    for map_id in selected:
        manifest_path = maps_dir / map_id / "map.json"
        if not manifest_path.is_file():
            unresolved_maps.append({"map": map_id, "reason": "map_manifest_missing"})
            continue
        manifest = read_json(manifest_path)
        if manifest.get("id") != map_id or manifest.get("format") != "classic-12":
            unresolved_maps.append({"map": map_id, "reason": "map_manifest_identity_or_format"})
            continue
        dependencies = manifest.get("dependencies")
        if not isinstance(dependencies, dict) or not isinstance(dependencies.get("Objects"), list):
            unresolved_maps.append({"map": map_id, "reason": "object_dependencies_missing"})
            continue

        map_references = {name: set() for name in LIBRARIES}
        aggregate = set()
        map_area_counts = {}
        bad_chunk = None
        for chunk in manifest.get("chunks", []):
            filename = chunk.get("file") if isinstance(chunk, dict) else None
            if not isinstance(filename, str) or Path(filename).name != filename:
                bad_chunk = "map_chunk_path_invalid"
                break
            chunk_path = manifest_path.parent / filename
            try:
                payload = chunk_path.read_bytes()
            except OSError:
                bad_chunk = "map_chunk_missing"
                break
            expected_length = chunk.get("width", 0) * chunk.get("height", 0) * CELL.size
            if (len(payload) != expected_length or len(payload) % CELL.size
                    or not re.fullmatch(r"[a-f0-9]{64}", str(chunk.get("sha256", "")))
                    or sha256(payload) != chunk["sha256"]):
                bad_chunk = "map_chunk_identity_or_size_mismatch"
                break
            for cell in CELL.iter_unpack(payload):
                raw_front = cell[2] & 0x7fff
                if not raw_front or raw_front >= 0x7f00:
                    continue
                area, animation = cell[7], cell[5] & 0x7f
                frame_count = max(1, animation)
                first = raw_front - 1
                aggregate.update(range(first, first + frame_count))
                map_area_counts[area] = map_area_counts.get(area, 0) + 1
                if 1 <= area <= 6:
                    library = AREA_TO_LIBRARY[area]
                    map_references[library].update(range(first, first + frame_count))
                elif 7 <= area <= 14:
                    entry = missing_banks.setdefault(str(area), {"references": 0, "maps": set()})
                    entry["references"] += 1
                    entry["maps"].add(map_id)
        if bad_chunk:
            unresolved_maps.append({"map": map_id, "reason": bad_chunk})
            continue
        expected = dependencies["Objects"]
        if (any(type(value) is not int or value < 0 for value in expected)
                or aggregate != set(expected)):
            unresolved_maps.append({"map": map_id, "reason": "object_dependency_mismatch"})
            continue
        for name in LIBRARIES:
            for index in map_references[name]:
                references[name].setdefault(index, set()).add(map_id)
        for area, count in map_area_counts.items():
            area_counts[area] = area_counts.get(area, 0) + count
        maps.append({"id": map_id, "sourceSha256": manifest.get("sourceSha256"),
                     "manifestSha256": sha256(manifest_path.read_bytes()),
                     "objectBankCounts": {name: len(map_references[name]) for name in LIBRARIES},
                     "unavailableAreas": sorted(area for area in map_area_counts if 7 <= area <= 14)})

    return {
        "profile": profile.get("id"), "profileSha256": sha256(profile_path.read_bytes()),
        "scope": "profile" if map_ids is None else "explicit-map-subset",
        "profileMapCount": len(all_maps), "requestedMapCount": len(selected),
        "maps": maps, "unresolvedMaps": unresolved_maps,
        "areaReferenceCounts": {str(k): v for k, v in sorted(area_counts.items())},
        "unavailableObjectBanks": [
            {"area": int(area), "expectedLibrary": f"Objects{int(area) + 1}",
             "references": value["references"], "maps": sorted(value["maps"])}
            for area, value in sorted(missing_banks.items(), key=lambda pair: int(pair[0]))
        ],
    }, {name: {index: sorted(map_names) for index, map_names in values.items()}
        for name, values in references.items()}


def load_sources(data_dir, locks):
    files = {}
    for path in Path(data_dir).iterdir():
        if path.is_file():
            key = path.name.casefold()
            if key in files:
                raise ValueError(f"ambiguous source filenames: {path.name}")
            files[key] = path
    libraries = {}
    for name in LIBRARIES:
        source, index = files.get(f"{name}.wil".casefold()), files.get(f"{name}.wix".casefold())
        if source is None or index is None:
            raise FileNotFoundError(f"missing original WIL/WIX pair: {name}")
        library = WeMadeLibrary(source, index)
        expected = locks.get(name, {})
        if (sha256(library.data) != expected.get("sourceSha256")
                or sha256(library.index_data) != expected.get("indexSha256")):
            raise ValueError(f"source version mismatch: {name}; review WIL/WIX hashes")
        libraries[name] = library
    return libraries


def existing_manifest(destination, library):
    path = Path(destination) / "library.json"
    if not path.is_file():
        return {"frames": {}, "empty": [], "missing": []}
    manifest = read_json(path)
    if not isinstance(manifest.get("frames"), dict):
        raise ValueError(f"invalid existing frames: {path}")
    if (manifest.get("sourceSha256") != sha256(library.data)
            or manifest.get("indexSha256") != sha256(library.index_data)
            or manifest.get("format") != "wil-classic"):
        raise ValueError(f"existing library belongs to another source: {path}")
    for key, frame in manifest["frames"].items():
        if not key.isdigit() or not isinstance(frame, dict):
            raise ValueError(f"invalid existing frame entry: {path}/{key}")
        if not isinstance(frame.get("file"), str) or Path(frame["file"]).name != frame["file"]:
            raise ValueError(f"invalid existing frame file: {path}/{key}")
    return manifest


def frame_present(frame, destination):
    if not frame:
        return False
    path = Path(destination) / frame["file"]
    return path.is_file() and isinstance(frame.get("sha256"), str) and sha256(path.read_bytes()) == frame["sha256"]


def source_metadata(library):
    return {"source": library.source.name, "sourceSha256": sha256(library.data),
            "index": library.index_path.name, "indexSha256": sha256(library.index_data),
            "sourceFrameCount": library.count, "rawIndexEntries": library.raw_offset_count,
            "discardedTrailingOffsets": library.discarded_trailing_offsets}


def plan_library(name, library, previous, destination, references):
    requested = sorted(references)
    present, valid, empty, unresolved, repair = [], [], [], [], []
    for index in requested:
        if not 0 <= index < library.count:
            unresolved.append({"index": index, "reason": "out_of_source_range",
                               "sourceFrameCount": library.count, "maps": references[index]})
            continue
        frame = previous["frames"].get(str(index))
        if frame_present(frame, destination):
            present.append(index)
            continue
        if frame:
            repair.append(index)
        try:
            pixels = library.frame(index)
        except (WeMadeFormatError, IndexError) as error:
            unresolved.append({"index": index, "reason": "source_frame_decode_error",
                               "detail": str(error), "maps": references[index]})
            continue
        if pixels is None:
            if frame:
                unresolved.append({"index": index, "reason": "existing_frame_conflicts_with_source_empty",
                                   "maps": references[index]})
            else:
                empty.append(index)
        else:
            valid.append(index)
    return {"name": name, **source_metadata(library), "requestedIndices": requested,
            "alreadyPresentIndices": present, "exportableIndices": valid, "emptyIndices": empty,
            "repairIndices": repair, "unresolved": unresolved,
            "requestedUniqueCount": len(requested), "alreadyPresentCount": len(present),
            "exportableCount": len(valid), "emptyCount": len(empty),
            "unresolvedCount": len(unresolved), "exportedIndices": []}


def apply_library(name, library, previous, plan, destination, scope):
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=True)
    frames = dict(previous["frames"])
    for index in plan["exportableIndices"]:
        frame = library.frame(index)
        png = png_rgba(frame["width"], frame["height"], frame.pop("pixels"))
        digest = sha256(png)
        filename = f"{index}.{digest[:16]}.png"
        target = destination / filename
        if not target.is_file() or sha256(target.read_bytes()) != digest:
            target.write_bytes(png)
        frame.update(sourceIndex=index, file=filename, sha256=digest,
                     sourceSha256=plan["sourceSha256"], indexSha256=plan["indexSha256"])
        frames[str(index)] = frame
        plan["exportedIndices"].append(index)
    empty = set(previous.get("empty", [])) | set(plan["emptyIndices"])
    empty.difference_update(int(key) for key in frames)
    resolved = set(plan["alreadyPresentIndices"]) | set(plan["exportedIndices"]) | set(plan["emptyIndices"])
    missing = set(previous.get("missing", [])) | {item["index"] for item in plan["unresolved"]}
    missing.difference_update(resolved)
    manifest = {**previous, "schemaVersion": 1, "format": "wil-classic",
                **source_metadata(library), "frames": frames, "empty": sorted(empty), "missing": sorted(missing),
                "nationalMapObjectBankImport": {
                    "profile": scope["profile"], "profileSha256": scope["profileSha256"],
                    "scope": scope["scope"], "requestedMapCount": scope["requestedMapCount"],
                    "maps": scope["maps"], "unresolvedMaps": scope["unresolvedMaps"],
                    "requestedIndices": plan["requestedIndices"], "unresolved": plan["unresolved"],
                    "areaByteOffset": 10, "libraryIndex": LIBRARIES.index(name) + 1,
                    "indexPolicy": "native btArea; no cross-library or adjacent-index fallback"}}
    atomic_json(destination / "library.json", manifest)


def run_import(data_dir, profile_path, maps_dir, output, *, apply=False, map_ids=None,
               source_locks=None):
    scope, references = collect_dependencies(profile_path, maps_dir, map_ids)
    libraries = load_sources(data_dir, SOURCE_LOCKS if source_locks is None else source_locks)
    previous = {name: existing_manifest(Path(output) / name, libraries[name]) for name in LIBRARIES}
    plans = [plan_library(name, libraries[name], previous[name], Path(output) / name, references[name])
             for name in LIBRARIES]
    report = {"schemaVersion": 1, "profile": "national-2003-map-object-banks",
              "mode": "apply" if apply else "plan", **scope, "families": plans}
    if apply and not scope["unresolvedMaps"]:
        for plan in plans:
            name = plan["name"]
            apply_library(name, libraries[name], previous[name], plan, Path(output) / name, scope)
    totals = {field: sum(plan[key] for plan in plans) for field, key in (
        ("requestedUnique", "requestedUniqueCount"), ("alreadyPresent", "alreadyPresentCount"),
        ("exportable", "exportableCount"), ("empty", "emptyCount"), ("unresolved", "unresolvedCount"))}
    totals["exported"] = sum(len(plan["exportedIndices"]) for plan in plans)
    totals["unresolvedMaps"] = len(scope["unresolvedMaps"])
    totals["unavailableObjectBanks"] = len(scope["unavailableObjectBanks"])
    report["totals"] = totals
    report["status"] = ("unresolved" if (totals["unresolved"] or totals["unresolvedMaps"]
                         or totals["unavailableObjectBanks"]) else "imported" if apply else "planned")
    report["complete"] = bool(apply and scope["scope"] == "profile" and report["status"] == "imported")
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path,
                        default=Path("C:/Program Files (x86)/shanda/Legend of Mir/Data"))
    parser.add_argument("--profile", type=Path, default=ROOT / "content/classic-176/version-profile.json")
    parser.add_argument("--maps-dir", type=Path, default=ROOT / "assets/web/maps")
    parser.add_argument("--output", type=Path, default=ROOT / "assets/web/libraries")
    parser.add_argument("--map", action="append", help="explicit profile subset; cannot claim full coverage")
    parser.add_argument("--report", type=Path, default=ROOT / ".runtime/reports/national-map-object-bank-import.json")
    parser.add_argument("--apply", action="store_true", help="write missing, source-matched object-bank frames")
    args = parser.parse_args()
    try:
        report = run_import(args.data_dir, args.profile, args.maps_dir, args.output,
                            apply=args.apply, map_ids=args.map)
        atomic_json(args.report, report)
        print(json.dumps({"mode": report["mode"], "status": report["status"],
                          "maps": len(report["maps"]), "totals": report["totals"],
                          "unavailableObjectBanks": report["unavailableObjectBanks"]},
                         ensure_ascii=False, indent=2))
        return 2 if report["status"] == "unresolved" else 0
    except (OSError, ValueError, WeMadeFormatError, json.JSONDecodeError) as error:
        parser.error(str(error))


if __name__ == "__main__":
    raise SystemExit(main())
