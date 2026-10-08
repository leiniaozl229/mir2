#!/usr/bin/env python3
"""Export map-hash-bound Tiles.Lib frames for native 1x1/missing placeholders.

The ShandaMir2 Crystal Tiles.Lib is kept in a separate reference-candidate
namespace. Only tile indices actually used by a map and unavailable as a real
frame in the locked national Tiles.wil are exported. Existing national frames
are protected by source hash, index hash, frame count and a runtime 1x1 check.
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
SOURCE_NAME = "Tiles.Lib"
SOURCE_ID = "crystal-shandamir2-tiles"
SOURCE_SHA256 = "98ea436fdba1de0b401b67bb76d75fdde0360e458461f6acc5fedc592d2d1865"
SOURCE_BYTES = 78884815
SOURCE_FRAME_COUNT = 31775
NAMESPACE = "/libraries/reference-map-candidates/Tiles"


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".map-tile-candidate.tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n",
                         encoding="utf-8")
    temporary.replace(path)


def active_native_identity(active_path):
    active = read_json(active_path)
    matches = [entry for entry in active.get("assets", [])
               if entry.get("namespace") == "/libraries/Tiles"
               and entry.get("category") == "map"
               and entry.get("role") == "active_required"
               and entry.get("provenance") == "native_pixels"]
    if len(matches) != 1:
        raise ValueError("active national Tiles source identity is ambiguous")
    entry = matches[0]
    data = next((file for file in entry.get("sourceFiles", [])
                 if file.get("purpose") == "data"), None)
    lookup = next((file for file in entry.get("sourceFiles", [])
                   if file.get("purpose") == "index"), None)
    library = entry.get("library", {})
    if (not data or not lookup or not re.fullmatch(r"[a-f0-9]{64}", data.get("sha256", ""))
            or not re.fullmatch(r"[a-f0-9]{64}", lookup.get("sha256", ""))
            or library.get("format") != "wil-classic"
            or type(library.get("sourceFrameCount")) is not int):
        raise ValueError("active national Tiles source lock is incomplete")
    return {"sourceId": entry["id"], "sourceSha256": data["sha256"],
            "indexSha256": lookup["sha256"],
            "sourceFrameCount": library["sourceFrameCount"],
            "format": library["format"]}


def load_candidate(source_path):
    source_path = Path(source_path)
    data = source_path.read_bytes()
    if len(data) != SOURCE_BYTES or sha256(data) != SOURCE_SHA256:
        raise ValueError("candidate Tiles.Lib hash/size mismatch")
    library = CrystalLibrary(data)
    if library.count != SOURCE_FRAME_COUNT:
        raise ValueError("candidate Tiles.Lib frame count mismatch")
    return source_path, data, library


def collect_bindings(maps_dir, native_manifest, native_identity, candidate_library):
    if (native_manifest.get("sourceSha256") != native_identity["sourceSha256"]
            or native_manifest.get("indexSha256") != native_identity["indexSha256"]
            or native_manifest.get("sourceFrameCount") != native_identity["sourceFrameCount"]
            or native_manifest.get("format") != native_identity["format"]):
        raise ValueError("national Tiles export disagrees with active source locks")

    references, bindings, unresolved_maps, unresolved_refs = {}, [], [], []
    candidate_frame_cache = {}
    map_dirs = sorted(path for path in Path(maps_dir).iterdir() if path.is_dir())
    for directory in map_dirs:
        manifest_path = directory / "map.json"
        if not manifest_path.is_file():
            continue
        manifest_bytes = manifest_path.read_bytes()
        manifest = json.loads(manifest_bytes)
        map_id, map_hash = directory.name, manifest.get("sourceSha256")
        if (manifest.get("id") != map_id or manifest.get("format") != "classic-12"
                or not isinstance(map_hash, str)
                or not re.fullmatch(r"[a-f0-9]{64}", map_hash)):
            unresolved_maps.append({"map": map_id, "reason": "map_manifest_identity_or_hash"})
            continue

        selected, bad_chunk = set(), None
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
            for local_x in range(width):
                x = chunk["x"] + local_x
                for local_y in range(height):
                    y = chunk["y"] + local_y
                    # The native client paints 96x64 background tiles only on even/even cells.
                    if x & 1 or y & 1:
                        continue
                    cell_index = (local_x * height + local_y) * CELL.size
                    raw = CELL.unpack_from(payload, cell_index)[0] & 0x7fff
                    if not raw:
                        continue
                    index = raw - 1
                    if index >= native_identity["sourceFrameCount"]:
                        # GA0's 408 out-of-range frames remain under its existing, separate binding.
                        continue
                    current = native_manifest.get("frames", {}).get(str(index))
                    current_empty = index in native_manifest.get("empty", [])
                    current_missing = index in native_manifest.get("missing", [])
                    current_is_valid = current and not current_empty and not current_missing
                    if (current_is_valid and
                            (current.get("width") != 1 or current.get("height") != 1)):
                        continue
                    if index not in candidate_frame_cache:
                        try:
                            candidate_frame_cache[index] = candidate_library.frame(index)
                        except Exception as error:
                            candidate_frame_cache[index] = error
                    candidate = candidate_frame_cache[index]
                    if isinstance(candidate, Exception):
                        unresolved_refs.append({"map": map_id, "library": "Tiles",
                                                "index": index,
                                                "reason": f"candidate_decode_{type(candidate).__name__}"})
                        continue
                    if (candidate is None or not candidate.get("width") or not candidate.get("height")
                            or candidate["width"] <= 1 or candidate["height"] <= 1):
                        unresolved_refs.append({"map": map_id, "library": "Tiles",
                                                "index": index,
                                                "reason": "candidate_frame_empty_or_placeholder"})
                        continue
                    selected.add(index)
            if bad_chunk:
                break
        if bad_chunk:
            unresolved_maps.append({"map": map_id, "reason": bad_chunk})
            continue
        if selected:
            references[map_id] = selected
            bindings.append({
                "id": f"{map_id}-tiles", "mapId": map_id,
                "mapSourceSha256": map_hash, "layer": "background",
                "library": "Tiles", "namespace": NAMESPACE,
                "sourceId": SOURCE_ID, "sourceSha256": SOURCE_SHA256,
                "sourceFrameCount": SOURCE_FRAME_COUNT,
                "sourceFormat": "crystal-lib-v2", "indices": sorted(selected),
                "mapManifestSha256": sha256(manifest_bytes),
                "mapVersionPairingVerified": False,
            })

    union = sorted({index for indices in references.values() for index in indices})
    return references, union, bindings, unresolved_maps, unresolved_refs


def export_candidate(source, source_data, library, indices, output, *, apply=False):
    frames, empty, decode_errors, payloads = {}, [], [], {}
    for index in sorted(indices):
        try:
            frame = library.frame(index)
        except Exception as error:
            decode_errors.append({"index": index, "error": type(error).__name__})
            continue
        if not frame or frame["width"] <= 1 or frame["height"] <= 1:
            empty.append(index)
            continue
        png = png_rgba(frame["width"], frame["height"], frame.pop("pixels"))
        digest = sha256(png)
        filename = f"{index}.{digest[:16]}.png"
        frame.update(sourceIndex=index, sourceSha256=SOURCE_SHA256,
                     file=filename, sha256=digest)
        frames[str(index)] = frame
        payloads[filename] = png
    manifest = {
        "schemaVersion": 1, "candidateId": SOURCE_ID,
        "role": "reference_candidate", "provenance": "reference_source",
        "format": "crystal-lib-v2", "source": source.name,
        "sourceSha256": SOURCE_SHA256, "sourceFrameCount": library.count,
        "frames": frames, "empty": empty, "missing": [],
        "mapTileCandidateImport": {
            "sourceUrl": SOURCE_BASE + SOURCE_NAME,
            "selectedIndices": sorted(indices), "pairingVerified": False,
        },
    }
    if apply:
        destination = Path(output)
        destination.mkdir(parents=True, exist_ok=True)
        old_path = destination / "library.json"
        if old_path.is_file():
            old = read_json(old_path)
            if (old.get("candidateId") != SOURCE_ID
                    or old.get("sourceSha256") != SOURCE_SHA256
                    or old.get("sourceFrameCount") != library.count):
                raise ValueError("existing candidate Tiles manifest identity mismatch")
            old_indices = set(old.get("frames", {})) | {str(i) for i in old.get("empty", [])}
            if old_indices - {str(i) for i in indices}:
                raise ValueError("existing candidate Tiles manifest contains unselected frames")
        for filename, payload in payloads.items():
            target = destination / filename
            if not target.is_file() or sha256(target.read_bytes()) != sha256(payload):
                target.write_bytes(payload)
        atomic_json(old_path, manifest)
    return manifest, {"exported": len(frames), "empty": empty,
                      "decodeErrors": decode_errors, "uniqueRequested": len(indices)}


def run_import(source_path, maps_dir, native_manifest_path, active_sources_path,
               output, contract_path, *, apply=False):
    source, source_data, candidate_library = load_candidate(source_path)
    native_identity = active_native_identity(active_sources_path)
    native_manifest = read_json(native_manifest_path)
    references, indices, bindings, unresolved_maps, unresolved_refs = collect_bindings(
        maps_dir, native_manifest, native_identity, candidate_library)
    manifest, stats = export_candidate(source, source_data, candidate_library,
                                       set(indices), output, apply=False)
    contract = {
        "schemaVersion": 1, "id": "server-map-tile-candidates-2026-10-02",
        "role": "reference_candidate", "provenance": "reference_source",
        "status": "candidate-unverified", "complete": False,
        "sourceDirectory": SOURCE_BASE, "mapVersionPairingVerified": False,
        "native": {"namespace": "/libraries/Tiles",
                   "sourceId": native_identity["sourceId"],
                   "sourceSha256": native_identity["sourceSha256"],
                   "indexSha256": native_identity["indexSha256"],
                   "sourceFrameCount": native_identity["sourceFrameCount"],
                   "format": native_identity["format"]},
        "libraries": ([{
            "library": "Tiles", "namespace": NAMESPACE,
            "sourceId": SOURCE_ID, "sourceUrl": SOURCE_BASE + SOURCE_NAME,
            "sourceSha256": SOURCE_SHA256, "sourceBytes": SOURCE_BYTES,
            "sourceFrameCount": SOURCE_FRAME_COUNT,
            "sourceFormat": "crystal-lib-v2", "indices": indices,
            "pairingVerified": False,
        }] if indices else []),
        "bindings": bindings, "unresolvedMaps": unresolved_maps,
        "unresolvedReferences": unresolved_refs,
    }
    export_errors = stats["decodeErrors"]
    if apply and not unresolved_maps and not export_errors:
        export_candidate(source, source_data, candidate_library, set(indices), output, apply=True)
        atomic_json(contract_path, contract)
    status = "unresolved" if unresolved_maps or export_errors else "candidate-unverified"
    return {"schemaVersion": 1, "mode": "apply" if apply else "plan",
            "status": status, "complete": False, "candidateRole": "reference_candidate",
            "mapCount": len(references), "bindingCount": len(bindings),
            "libraries": {"Tiles": {**stats, "sourceSha256": SOURCE_SHA256,
                                     "sourceFrameCount": SOURCE_FRAME_COUNT}},
            "unresolvedMaps": unresolved_maps,
            "unresolvedReferenceCount": len(unresolved_refs),
            "unresolvedReferences": unresolved_refs,
            "contractPath": str(contract_path), "assetOutput": str(output),
            "manifestFrameCount": len(manifest["frames"])}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path,
                        default=ROOT / ".runtime/staging/candidate-maps/Tiles.Lib")
    parser.add_argument("--maps", type=Path, default=ROOT / "assets/web/maps")
    parser.add_argument("--native-manifest", type=Path,
                        default=ROOT / "assets/web/libraries/Tiles/library.json")
    parser.add_argument("--active-sources", type=Path,
                        default=ROOT / "content/classic-176/active-asset-sources.json")
    parser.add_argument("--output", type=Path,
                        default=ROOT / "assets/web/libraries/reference-map-candidates/Tiles")
    parser.add_argument("--contract", type=Path,
                        default=ROOT / "content/classic-176/map-tile-candidates.json")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    report = run_import(args.source, args.maps, args.native_manifest,
                        args.active_sources, args.output, args.contract,
                        apply=args.apply)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["status"] == "candidate-unverified" else 2


if __name__ == "__main__":
    raise SystemExit(main())
