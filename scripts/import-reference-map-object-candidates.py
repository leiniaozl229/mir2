#!/usr/bin/env python3
"""Import exact-index candidate object banks for maps that need Objects8+.

The 2016 ShandaMir2 Crystal resource listing is a reference candidate, not a
verified 2003 national-client source. Only map hashes and btArea/index pairs
present in the exported map set are selected. Candidate files are written to a
separate namespace and never overwrite national WIL-derived libraries.
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
from crystal_lib import CrystalLibrary, png_rgba

CELL = struct.Struct("<HHHBBBBBB")
SOURCE_BASE = "https://mirfiles.com/resources/mir2/crystal/patch/Data/Map/ShandaMir2/"
AREA_TO_LIBRARY = {7: "Objects8", 8: "Objects9", 9: "Objects10",
                   12: "Objects13", 13: "Objects14"}
SOURCE_LOCKS = {
    "Objects8": {"sha256": "ba94451845f472d2967b617eddbf15089b3161f34d75aff8e69fb85a3aad3045",
                 "bytes": 17420533, "count": 9919},
    "Objects9": {"sha256": "f9c606f662dd77943a2087ed6559e60d23bf584f8dd0750d1c23bbceb0c9b5c8",
                 "bytes": 12509814, "count": 9067},
    "Objects10": {"sha256": "48b4dc14e14e6050113253191fb97192ea2b9ae0bb90e847c94836b911605438",
                  "bytes": 18254605, "count": 8014},
    "Objects13": {"sha256": "036a9b4e45c6dc9b2b2405d0bac860f30ea9628dbec0e9fa6bd9c39dfef2b852",
                  "bytes": 15675072, "count": 7032},
    "Objects14": {"sha256": "1a593049f08551af9fb6263f8d2f5897a8f2cb8843e7ed4653f45d535c7f5ade",
                  "bytes": 8520655, "count": 3648},
}
SOURCE_IDS = {name: f"crystal-shandamir2-{name.lower()}" for name in AREA_TO_LIBRARY.values()}


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".map-object-candidate.tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n",
                         encoding="utf-8")
    temporary.replace(path)


def load_candidate_sources(source_dir, locks=None):
    locks = SOURCE_LOCKS if locks is None else locks
    libraries = {}
    for name in sorted(set(AREA_TO_LIBRARY.values())):
        path = Path(source_dir) / f"{name}.Lib"
        data = path.read_bytes()
        lock = locks.get(name, {})
        if len(data) != lock.get("bytes") or sha256(data) != lock.get("sha256"):
            raise ValueError(f"candidate source hash mismatch: {name}")
        library = CrystalLibrary(data)
        if library.count != lock.get("count"):
            raise ValueError(f"candidate source frame count mismatch: {name}")
        libraries[name] = (path, data, library)
    return libraries


def collect_references(maps_dir):
    maps_dir = Path(maps_dir)
    references = {name: {} for name in AREA_TO_LIBRARY.values()}
    bindings, unresolved_maps, area_counts = [], [], {}
    map_dirs = sorted(path for path in maps_dir.iterdir() if path.is_dir())
    for directory in map_dirs:
        map_id = directory.name
        manifest_path = directory / "map.json"
        if not manifest_path.is_file():
            continue
        manifest_bytes = manifest_path.read_bytes()
        manifest = json.loads(manifest_bytes)
        map_hash = manifest.get("sourceSha256")
        if (manifest.get("id") != map_id or manifest.get("format") != "classic-12"
                or not isinstance(map_hash, str) or not re.fullmatch(r"[a-f0-9]{64}", map_hash)):
            unresolved_maps.append({"map": map_id, "reason": "map_manifest_identity_or_hash"})
            continue
        per_library = {name: set() for name in references}
        bad_chunk = None
        for chunk in manifest.get("chunks", []):
            filename = chunk.get("file") if isinstance(chunk, dict) else None
            if not isinstance(filename, str) or Path(filename).name != filename:
                bad_chunk = "map_chunk_path_invalid"
                break
            try:
                payload = (directory / filename).read_bytes()
            except OSError:
                bad_chunk = "map_chunk_missing"
                break
            width, height = chunk.get("width"), chunk.get("height")
            if (type(width) is not int or type(height) is not int or width <= 0 or height <= 0
                    or len(payload) != width * height * CELL.size
                    or not re.fullmatch(r"[a-f0-9]{64}", str(chunk.get("sha256", "")))
                    or sha256(payload) != chunk["sha256"]):
                bad_chunk = "map_chunk_identity_or_size_mismatch"
                break
            for cell in CELL.iter_unpack(payload):
                raw_front, animation, area = cell[2] & 0x7fff, cell[5] & 0x7f, cell[7]
                if not raw_front or not 7 <= area <= 14:
                    continue
                area_counts[area] = area_counts.get(area, 0) + 1
                library_name = AREA_TO_LIBRARY.get(area)
                if library_name is None:
                    bad_chunk = f"unsupported_object_area_{area}"
                    break
                first = raw_front - 1
                per_library[library_name].update(range(first, first + max(1, animation)))
            if bad_chunk:
                break
        if bad_chunk:
            unresolved_maps.append({"map": map_id, "reason": bad_chunk})
            continue
        for name, indices in per_library.items():
            if not indices:
                continue
            for index in indices:
                references[name].setdefault(index, set()).add(map_id)
            bindings.append({
                "id": f"{map_id}-{name.lower()}", "mapId": map_id,
                "mapSourceSha256": map_hash, "area": next(area for area, lib in AREA_TO_LIBRARY.items() if lib == name),
                "library": name, "namespace": f"/libraries/reference-map-candidates/{name}",
                "sourceId": SOURCE_IDS[name], "sourceSha256": None,
                "sourceFrameCount": None, "sourceFormat": "crystal-lib-v2",
                "indices": sorted(indices), "mapManifestSha256": sha256(manifest_bytes),
                "mapVersionPairingVerified": False,
            })

    return references, bindings, unresolved_maps, area_counts


def export_library(name, source, source_hash, library, indices, destination, *, apply):
    destination = Path(destination)
    exported, empty, out_of_range, decode_errors = {}, [], [], []
    png_payloads = {}
    for index in sorted(indices):
        if not 0 <= index < library.count:
            out_of_range.append(index)
            continue
        try:
            frame = library.frame(index)
        except Exception as error:  # source frame faults must stay explicit
            decode_errors.append({"index": index, "error": type(error).__name__})
            continue
        if frame is None or not frame["width"] or not frame["height"]:
            empty.append(index)
            continue
        png = png_rgba(frame["width"], frame["height"], frame.pop("pixels"))
        digest = sha256(png)
        filename = f"{index}.{digest[:16]}.png"
        frame.update(sourceIndex=index, sourceSha256=source_hash,
                     file=filename, sha256=digest)
        exported[str(index)] = frame
        png_payloads[filename] = png

    manifest = {
        "schemaVersion": 1, "candidateId": SOURCE_IDS[name],
        "role": "reference_candidate", "provenance": "reference_source",
        "format": "crystal-lib-v2", "source": source.name,
        "sourceSha256": source_hash, "sourceFrameCount": library.count,
        "frames": exported, "empty": empty, "missing": [],
        "mapObjectBankCandidateImport": {
            "sourceUrl": SOURCE_BASE + source.name,
            "selectedIndices": sorted(indices), "pairingVerified": False,
        },
    }
    if apply:
        destination.mkdir(parents=True, exist_ok=True)
        old_path = destination / "library.json"
        if old_path.is_file():
            old = read_json(old_path)
            if (old.get("candidateId") != SOURCE_IDS[name]
                    or old.get("sourceSha256") != source_hash
                    or old.get("sourceFrameCount") != library.count):
                raise ValueError(f"existing candidate manifest identity mismatch: {name}")
            old_indices = set(old.get("frames", {})) | {str(i) for i in old.get("empty", [])}
            selected_indices = {str(i) for i in indices}
            if old_indices - selected_indices:
                raise ValueError(f"existing candidate manifest has unselected frames: {name}")
        for filename, payload in png_payloads.items():
            target = destination / filename
            if not target.is_file() or sha256(target.read_bytes()) != sha256(payload):
                target.write_bytes(payload)
        atomic_json(old_path, manifest)
    return manifest, {"exported": len(exported), "empty": empty,
                      "outOfRange": out_of_range, "decodeErrors": decode_errors,
                      "uniqueRequested": len(indices)}


def build_contract(references, bindings, libraries, unresolved_maps, area_counts):
    for binding in bindings:
        lock = SOURCE_LOCKS[binding["library"]]
        binding["sourceSha256"] = lock["sha256"]
        binding["sourceFrameCount"] = lock["count"]
    sources = []
    for area, name in sorted(AREA_TO_LIBRARY.items()):
        if not references[name]:
            continue
        source, data, library = libraries[name]
        lock = SOURCE_LOCKS[name]
        sources.append({
            "library": name, "area": area, "namespace": f"/libraries/reference-map-candidates/{name}",
            "sourceId": SOURCE_IDS[name], "sourceUrl": SOURCE_BASE + source.name,
            "sourceSha256": lock["sha256"], "sourceBytes": lock["bytes"],
            "sourceFrameCount": lock["count"], "sourceFormat": "crystal-lib-v2",
            "indices": sorted(references[name]), "pairingVerified": False,
        })
    return {
        "schemaVersion": 1, "id": "server-map-object-bank-candidates-2026-10-02",
        "role": "reference_candidate", "provenance": "reference_source",
        "status": "candidate-unverified", "sourceDirectory": SOURCE_BASE,
        "mapVersionPairingVerified": False,
        "areaToLibrary": {str(area): name for area, name in AREA_TO_LIBRARY.items()},
        "libraries": sources, "bindings": bindings,
        "unresolvedMaps": unresolved_maps,
        "areaReferenceCounts": {str(key): value for key, value in sorted(area_counts.items())},
    }


def run_import(source_dir, maps_dir, output, contract_path, *, apply=False):
    source_libraries = load_candidate_sources(source_dir)
    references, bindings, unresolved_maps, area_counts = collect_references(maps_dir)
    contract = build_contract(references, bindings, source_libraries,
                              unresolved_maps, area_counts)
    reports = {}
    plans = {}
    for name, indices in references.items():
        if not indices:
            continue
        source, data, library = source_libraries[name]
        manifest, stats = export_library(name, source, sha256(data), library, indices,
                                         Path(output) / name, apply=False)
        plans[name] = (source, data, library, indices, manifest, stats)
        reports[name] = {**stats, "sourceSha256": sha256(data),
                         "sourceFrameCount": library.count}
    export_errors = [name for name, report in reports.items()
                     if report["outOfRange"] or report["decodeErrors"]]
    if apply and not unresolved_maps and not export_errors:
        # Validate every existing manifest before writing any candidate files.
        for name, (_, data, library, indices, _, _) in plans.items():
            old_path = Path(output) / name / "library.json"
            if not old_path.is_file():
                continue
            old = read_json(old_path)
            if (old.get("candidateId") != SOURCE_IDS[name]
                    or old.get("sourceSha256") != sha256(data)
                    or old.get("sourceFrameCount") != library.count):
                raise ValueError(f"existing candidate manifest identity mismatch: {name}")
            old_indices = set(old.get("frames", {})) | {str(i) for i in old.get("empty", [])}
            if old_indices - {str(i) for i in indices}:
                raise ValueError(f"existing candidate manifest has unselected frames: {name}")
        for name, (source, data, library, indices, _, _) in plans.items():
            export_library(name, source, sha256(data), library, indices,
                           Path(output) / name, apply=True)
        atomic_json(contract_path, contract)
    status = "unresolved" if unresolved_maps or export_errors else "candidate-unverified"
    return {"schemaVersion": 1, "mode": "apply" if apply else "plan",
            "status": status, "complete": False, "candidateRole": "reference_candidate",
            "mapCount": len({binding["mapId"] for binding in bindings}),
            "bindingCount": len(bindings), "libraries": reports,
            "unresolvedMaps": unresolved_maps, "exportErrors": export_errors,
            "contractPath": str(contract_path), "assetOutput": str(output)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=Path,
                        default=ROOT / ".runtime/map-extension-candidates-2026-10-02")
    parser.add_argument("--maps", type=Path, default=ROOT / "assets/web/maps")
    parser.add_argument("--output", type=Path,
                        default=ROOT / "assets/web/libraries/reference-map-candidates")
    parser.add_argument("--contract", type=Path,
                        default=ROOT / "content/classic-176/map-object-bank-candidates.json")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    report = run_import(args.source_dir, args.maps, args.output, args.contract, apply=args.apply)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["status"] == "candidate-unverified" else 2


if __name__ == "__main__":
    raise SystemExit(main())
