#!/usr/bin/env python3
"""Plan or import hash-locked national map frames required by the current profile.

The default run is read-only for map assets; pass --apply to write PNGs and merged
library manifests. No MAP, world, database or source WIL/WIX files are changed.
Out-of-range references remain explicit unresolved entries; no bank remapping is
inferred. Existing frame files and unrequested indices are retained.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from wil_lib import WeMadeLibrary, WeMadeFormatError
from crystal_lib import png_rgba

FAMILIES = ("Tiles", "SmTiles", "Objects")
SOURCE_LOCKS = {
    "Tiles": {
        "sourceSha256": "92dc40c4ed6ed4417daf1ae7ad753624f992a9a24e493d651cc2eebd11963f27",
        "indexSha256": "d19435d0996b8d386bf709da1748a68b96105535d420a05b36eae715dab4e146",
    },
    "SmTiles": {
        "sourceSha256": "f87570676bff54457e9b56630a4b557e1129c3f0a5a359047668be40e44a0605",
        "indexSha256": "16d41274a8c68632a1bd6d4a64d065ff70cb81e468c97fd34021fd772267e0ed",
    },
    "Objects": {
        "sourceSha256": "80b27c1be115a19c9d8baac878e90e182c9543ddb0640fda8626b90c636690f0",
        "indexSha256": "199be3894f277cb4e8ac16e222d7dcda725f2e1fc620d207f432367509afc503",
    },
}


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".national-map.tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n",
                         encoding="utf-8")
    temporary.replace(path)


def dependencies_for_profile(profile_path, maps_dir, map_ids=None):
    """Collect zero-based, animation-expanded dependencies from exported MAPs."""
    profile_path, maps_dir = Path(profile_path), Path(maps_dir)
    profile = read_json(profile_path)
    all_maps = profile.get("p0Baseline", {}).get("maps", [])
    if not isinstance(all_maps, list) or not all_maps:
        raise ValueError("profile must contain unique nonempty p0Baseline.maps")
    for name in all_maps:
        if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", name):
            raise ValueError(f"invalid profile map id: {name!r}")
    if len(all_maps) != len(set(all_maps)):
        raise ValueError("profile must contain unique nonempty p0Baseline.maps")
    selected = list(dict.fromkeys(map_ids)) if map_ids is not None else all_maps
    if not selected or set(selected) - set(all_maps):
        raise ValueError("requested maps must be a nonempty subset of the profile")
    refs = {name: {} for name in FAMILIES}
    maps, unresolved = [], []
    for map_id in selected:
        path = maps_dir / map_id / "map.json"
        if not path.is_file():
            unresolved.append({"map": map_id, "reason": "map_manifest_missing"})
            continue
        manifest = read_json(path)
        if manifest.get("id") != map_id or manifest.get("format") != "classic-12":
            unresolved.append({"map": map_id, "reason": "map_manifest_identity_or_format"})
            continue
        dependency = manifest.get("dependencies")
        if not isinstance(dependency, dict) or any(name not in dependency for name in FAMILIES):
            unresolved.append({"map": map_id, "reason": "map_dependencies_missing"})
            continue
        checked = {}
        for name in FAMILIES:
            values = dependency[name]
            if not isinstance(values, list) or any(
                type(value) is not int or value < 0 for value in values
            ):
                raise ValueError(f"invalid {name} dependencies for map {map_id}")
            checked[name] = sorted(set(values))
        maps.append({"id": map_id, "sourceSha256": manifest.get("sourceSha256"),
                     "manifestSha256": sha256(path.read_bytes()),
                     "dependencyCounts": {name: len(checked[name]) for name in FAMILIES}})
        for name in FAMILIES:
            for number in checked[name]:
                refs[name].setdefault(number, []).append(map_id)
    return {
        "profile": profile.get("id"),
        "profileSha256": sha256(profile_path.read_bytes()),
        "scope": "profile" if map_ids is None else "explicit-map-subset",
        "profileMapCount": len(all_maps), "requestedMapCount": len(selected),
        "maps": maps, "unresolvedMaps": unresolved,
    }, refs


def load_sources(data_dir, locks):
    """Preflight all three source pairs before any asset output is touched."""
    files = {}
    for path in Path(data_dir).iterdir():
        if path.is_file():
            key = path.name.casefold()
            if key in files:
                raise ValueError(f"ambiguous source filenames: {path.name}")
            files[key] = path
    libraries = {}
    for name in FAMILIES:
        source, index = files.get(f"{name}.wil".casefold()), files.get(f"{name}.wix".casefold())
        if source is None or index is None:
            raise FileNotFoundError(f"missing original WIL/WIX pair: {name}")
        expected = locks.get(name, {})
        library = WeMadeLibrary(source, index)
        if sha256(library.data) != expected.get("sourceSha256") or sha256(
            library.index_data
        ) != expected.get("indexSha256"):
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
    # A numeric frame key is only meaningful within this exact source pair.
    # Keep incompatible manifests intact and refuse a false native provenance.
    if (manifest.get("sourceSha256") != sha256(library.data)
            or manifest.get("indexSha256") != sha256(library.index_data)
            or manifest.get("format") != "wil-classic"):
        raise ValueError(f"existing library belongs to another source: {path}")
    for key, frame in manifest["frames"].items():
        if not key.isdigit() or not isinstance(frame, dict):
            raise ValueError(f"invalid existing frame entry: {path}/{key}")
        filename = frame.get("file")
        if not isinstance(filename, str) or Path(filename).name != filename:
            raise ValueError(f"invalid existing frame file: {path}/{key}")
    for field in ("empty", "missing"):
        values = manifest.get(field, [])
        if not isinstance(values, list) or any(type(value) is not int or value < 0 for value in values):
            raise ValueError(f"invalid existing {field}: {path}")
    return manifest


def frame_present(frame, destination):
    if frame is None:
        return False
    path = Path(destination) / frame["file"]
    if not path.is_file():
        return False
    digest = frame.get("sha256")
    # A source-bound manifest without a PNG hash cannot prove that the pixels
    # are still present. Re-export that dependency rather than hiding corruption.
    return isinstance(digest, str) and sha256(path.read_bytes()) == digest


def source_metadata(library):
    return {
        "source": library.source.name, "sourceSha256": sha256(library.data),
        "index": library.index_path.name, "indexSha256": sha256(library.index_data),
        "sourceFrameCount": library.count, "rawIndexEntries": library.raw_offset_count,
        "discardedTrailingOffsets": library.discarded_trailing_offsets,
    }


def plan_family(name, library, manifest, destination, references):
    requested = sorted(references)
    present, valid, empty, unresolved, repair = [], [], [], [], []
    for number in requested:
        if not 0 <= number < library.count:
            unresolved.append({"index": number, "reason": "out_of_source_range",
                               "sourceFrameCount": library.count, "maps": references[number]})
            continue
        entry = manifest["frames"].get(str(number))
        if frame_present(entry, destination):
            present.append(number)
            continue
        if entry is not None:
            repair.append(number)
        try:
            frame = library.frame(number)
        except (WeMadeFormatError, IndexError) as error:
            unresolved.append({"index": number, "reason": "source_frame_decode_error",
                               "detail": str(error), "maps": references[number]})
            continue
        if frame is None:
            if entry is not None:
                unresolved.append({"index": number,
                                   "reason": "existing_frame_conflicts_with_source_empty",
                                   "maps": references[number]})
            else:
                empty.append(number)
        else:
            valid.append(number)
    return {
        "name": name, **source_metadata(library),
        "requestedIndices": requested, "alreadyPresentIndices": present,
        "exportableIndices": valid, "emptyIndices": empty,
        "repairIndices": repair, "unresolved": unresolved,
        "requestedUniqueCount": len(requested), "alreadyPresentCount": len(present),
        "exportableCount": len(valid), "emptyCount": len(empty),
        "unresolvedCount": len(unresolved), "exportedIndices": [],
    }


def apply_family(library, destination, previous, plan, scope):
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=True)
    frames = dict(previous["frames"])
    for number in plan["exportableIndices"]:
        frame = library.frame(number)
        png = png_rgba(frame["width"], frame["height"], frame.pop("pixels"))
        digest = sha256(png)
        filename = f"{number}.{digest[:16]}.png"
        target = destination / filename
        if not target.is_file() or sha256(target.read_bytes()) != digest:
            target.write_bytes(png)
        frame.update(sourceIndex=number, file=filename, sha256=digest,
                     sourceSha256=plan["sourceSha256"], indexSha256=plan["indexSha256"])
        frames[str(number)] = frame
        plan["exportedIndices"].append(number)
    empty = set(previous.get("empty", [])) | set(plan["emptyIndices"])
    # Preserve every old index and file. A stale entry contradicting a native
    # empty frame is diagnosed as unresolved during planning, never removed.
    empty.difference_update(int(key) for key in frames)
    resolved = set(plan["alreadyPresentIndices"]) | set(plan["exportedIndices"]) | set(plan["emptyIndices"])
    missing = set(previous.get("missing", [])) | {item["index"] for item in plan["unresolved"]}
    missing.difference_update(resolved)
    manifest = {
        **previous, "schemaVersion": 1, "format": "wil-classic",
        **source_metadata(library), "frames": frames,
        "empty": sorted(empty), "missing": sorted(missing),
        "nationalMapImport": {
            "profile": scope["profile"], "profileSha256": scope["profileSha256"],
            "scope": scope["scope"], "requestedMapCount": scope["requestedMapCount"],
            "maps": scope["maps"], "unresolvedMaps": scope["unresolvedMaps"],
            "requestedIndices": plan["requestedIndices"], "unresolved": plan["unresolved"],
            "indexPolicy": "original-zero-based; no inferred library-bank remapping",
        },
    }
    atomic_json(destination / "library.json", manifest)


def run_import(data_dir, profile_path, maps_dir, output, *, apply=False,
               map_ids=None, source_locks=None):
    scope, references = dependencies_for_profile(profile_path, maps_dir, map_ids)
    libraries = load_sources(data_dir, SOURCE_LOCKS if source_locks is None else source_locks)
    previous = {
        name: existing_manifest(Path(output) / name, libraries[name]) for name in FAMILIES
    }
    plans = [
        plan_family(name, libraries[name], previous[name], Path(output) / name, references[name])
        for name in FAMILIES
    ]
    report = {"schemaVersion": 1, "profile": "national-2003-map-dependencies",
              "mode": "apply" if apply else "plan", **scope, "families": plans}
    if apply:
        for plan in plans:
            apply_family(libraries[plan["name"]], Path(output) / plan["name"],
                         previous[plan["name"]], plan, scope)
    report["totals"] = {
        "requestedUnique": sum(plan["requestedUniqueCount"] for plan in plans),
        "alreadyPresent": sum(plan["alreadyPresentCount"] for plan in plans),
        "exportable": sum(plan["exportableCount"] for plan in plans),
        "empty": sum(plan["emptyCount"] for plan in plans),
        "unresolved": sum(plan["unresolvedCount"] for plan in plans),
        "exported": sum(len(plan["exportedIndices"]) for plan in plans),
        "unresolvedMaps": len(scope["unresolvedMaps"]),
    }
    report["status"] = ("unresolved" if report["totals"]["unresolved"] or scope["unresolvedMaps"]
                        else "imported" if apply else "planned")
    report["complete"] = bool(apply and scope["scope"] == "profile"
                              and report["status"] == "imported")
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path,
                        default=Path("C:/Program Files (x86)/shanda/Legend of Mir/Data"))
    parser.add_argument("--profile", type=Path, default=ROOT / "content/classic-176/version-profile.json")
    parser.add_argument("--maps-dir", type=Path, default=ROOT / "assets/web/maps")
    parser.add_argument("--output", type=Path, default=ROOT / "assets/web/libraries")
    parser.add_argument("--map", action="append", help="explicit profile subset; report will not claim full coverage")
    parser.add_argument("--source-lock-file", type=Path, help="reviewed family-to-WIL/WIX SHA256 locks")
    parser.add_argument("--report", type=Path, default=ROOT / ".runtime/reports/national-map-import.json")
    parser.add_argument("--apply", action="store_true", help="write missing native frames and merge manifests")
    args = parser.parse_args()
    try:
        locks = read_json(args.source_lock_file) if args.source_lock_file else None
        report = run_import(args.data_dir, args.profile, args.maps_dir, args.output,
                            apply=args.apply, map_ids=args.map, source_locks=locks)
        atomic_json(args.report, report)
    except (ValueError, OSError) as error:
        parser.error(str(error))
    print(json.dumps({"status": report["status"], "mode": report["mode"],
                      "scope": report["scope"], "complete": report["complete"],
                      "totals": report["totals"], "report": str(args.report)},
                     ensure_ascii=False, indent=2))
    return 2 if report["status"] == "unresolved" else 0


if __name__ == "__main__":
    raise SystemExit(main())
