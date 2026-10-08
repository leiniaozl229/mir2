"""Audit explicitly selected reference MAP pixels without verifying historical pairing.

No resource, runtime or source-choice file is written. A usable selection requires
the original MAP/chunk bytes, independent library locks and every exported pixel.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re
import struct
from typing import Any

from crystal_lib import CrystalLibrary, png_rgba
from map_tool import CELL, ClassicMap
from wil_lib import WeMadeLibrary

ROOT = Path(__file__).resolve().parents[1]
SHA = re.compile(r"[0-9a-f]{64}")


def safe_path(root: Path, value: str) -> Path:
    if not isinstance(value, str) or not value or "\\" in value or ":" in value:
        raise ValueError("expected a relative forward-slash path")
    relative = Path(value)
    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError("path escapes its source root")
    path = (root / relative).resolve()
    if not path.is_relative_to(root.resolve()):
        raise ValueError("path escapes its source root")
    return path


def validate_contract(contract: Any) -> list[str]:
    if not isinstance(contract, dict) or contract.get("schemaVersion") != 1 or contract.get("domain") != "map-asset-bindings":
        return ["map binding schemaVersion/domain invalid"]
    bindings = contract.get("bindings")
    if not isinstance(bindings, list) or len(bindings) != 1:
        return ["this contract permits exactly one scoped GA0 background binding"]
    row = bindings[0]
    if not isinstance(row, dict):
        return ["binding must be an object"]
    errors = []
    exact = {"id": "ga0-background-reference-tiles", "mapId": "GA0", "layer": "background", "library": "Tiles",
             "namespace": "/libraries/reference-ga0/Tiles", "nativeNamespace": "/libraries/Tiles",
             "selectionEvidence": "reference_source", "selectionPolicy": "exact-missing-original-indices-only",
             "sourceId": "ga0-tiles-reference-candidate", "nativeSourceId": "national:map:Tiles",
             "sourceFormat": "crystal-lib-v2"}
    for key, value in exact.items():
        if row.get(key) != value:
            errors.append(f"binding requires {key}={value}")
    if row.get("status") not in ("pending", "enabled"):
        errors.append("binding status must be pending/enabled")
    if row.get("mapVersionPairingVerified") is not False:
        errors.append("reference selection cannot upgrade historical pairing with a flag")
    for key in ("mapSourceSha256", "sourceSha256", "nativeSourceSha256", "nativeIndexSha256"):
        if not isinstance(row.get(key), str) or SHA.fullmatch(row[key]) is None:
            errors.append(f"binding requires {key} SHA-256")
    for key in ("mapSourceCommit", "mapSourceGitBlob"):
        if not isinstance(row.get(key), str) or re.fullmatch(r"[0-9a-f]{40}", row[key]) is None:
            errors.append(f"binding requires {key} Git identity")
    for key in ("sourceFrameCount", "nativeSourceFrameCount", "mapSourceBytes"):
        if type(row.get(key)) is not int or row[key] <= 0:
            errors.append(f"binding requires positive {key}")
    for key in ("indices", "preserveNativeIndices", "protectedNativeIndices"):
        values = row.get(key)
        if not isinstance(values, list) or not values or any(type(index) is not int or index < 0 for index in values) or values != sorted(set(values)):
            errors.append(f"binding requires canonical unique {key}")
    if row.get("protectedNativeIndices") != [9, 14]:
        errors.append("native placeholder indices 9/14 must remain protected")
    if not errors:
        if set(row["indices"]) & set(row["preserveNativeIndices"]):
            errors.append("selected indices overlap preserved native indices")
        if not set(row["protectedNativeIndices"]) <= set(row["preserveNativeIndices"]):
            errors.append("protected indices must be preserved native references")
    for key in ("mapManifest", "candidateRegistry", "candidateManifest", "nativeManifest", "pairingEvidence", "exportEvidence"):
        descriptor = row.get(key)
        if not isinstance(descriptor, dict) or type(descriptor.get("bytes")) is not int or descriptor["bytes"] < 0 or not isinstance(descriptor.get("sha256"), str) or SHA.fullmatch(descriptor["sha256"]) is None:
            errors.append(f"binding requires locked {key}")
            continue
        try:
            safe_path(ROOT, descriptor.get("path"))
        except (TypeError, ValueError) as error:
            errors.append(f"{key}: {error}")
    for key in ("candidateSource", "upstreamLock"):
        descriptor = row.get(key)
        if not isinstance(descriptor, dict):
            errors.append(f"binding requires {key}")
            continue
        try:
            safe_path(ROOT, descriptor.get("path"))
        except (TypeError, ValueError) as error:
            errors.append(f"{key}: {error}")
    try:
        safe_path(ROOT, row.get("mapSourcePath"))
    except (TypeError, ValueError) as error:
        errors.append(f"MAP source: {error}")
    return errors


def cell_references(raw: bytes) -> dict[str, list[int]]:
    """Derive each static and animated original index from actual classic cells."""
    values = [set(), set(), set()]
    for cell in CELL.iter_unpack(raw):
        for layer in range(3):
            number = cell[layer] & 0x7fff
            if 0 < number < 0x7f00:
                values[layer].add(number - 1)
        front, count = cell[2] & 0x7fff, cell[5] & 0x7f
        if 0 < front < 0x7f00 and count:
            values[2].update(range(front - 1, front - 1 + count))
    return dict(zip(("Tiles", "SmTiles", "Objects"), (sorted(value) for value in values)))


def audit_bindings(contract: Any, *, root: Path = ROOT,
                   source_roots: dict[str, Path] | None = None) -> dict[str, Any]:
    root = Path(root).resolve()
    errors = validate_contract(contract)
    result = {"schemaVersion": 1, "contractErrors": errors, "entries": [], "failures": [],
              "historicalFailures": [], "technicalOk": False, "complete": False,
              "scope": "MAP/chunk/source/export identity and decoded reference pixels. Explicit render selection never verifies original national pairing or browser/native runtime."}
    if errors:
        return result
    for binding in contract["bindings"]:
        row = {key: binding[key] for key in ("id", "mapId", "mapSourceSha256", "layer", "library", "namespace", "sourceId", "sourceSha256", "status", "preserveNativeIndices", "protectedNativeIndices")}
        row.update(technicalOk=False, selectionActive=False, renderIndices=[], nativeMissingIndices=[],
                   frames={}, checkedPngFrames=0, mapVersionPairingVerified=False, failures=[],
                   chunks=[], sourceChecks=[])
        result["entries"].append(row)
        failures = row["failures"]
        def fail(reason, **detail):
            failures.append({"reason": reason, **detail})
        def read_locked(descriptor):
            path = safe_path(root, descriptor["path"])
            raw = path.read_bytes()
            checksum = hashlib.sha256(raw).hexdigest()
            row["sourceChecks"].append({"path": descriptor["path"], "bytes": len(raw), "sha256": checksum})
            if len(raw) != descriptor["bytes"] or checksum != descriptor["sha256"]:
                raise ValueError(f"source/export lock mismatch: {descriptor['path']}")
            return raw
        def read_json_locked(descriptor):
            return json.loads(read_locked(descriptor))
        try:
            original = read_locked({"path": binding["mapSourcePath"], "bytes": binding["mapSourceBytes"], "sha256": binding["mapSourceSha256"]})
            world = ClassicMap(original)
            blob = hashlib.sha1(b"blob " + str(len(original)).encode() + b"\0" + original).hexdigest()
            if binding.get("mapSourceGitBlob") != blob:
                fail("map_git_blob_mismatch")
            manifest = read_json_locked(binding["mapManifest"])
            if (manifest.get("id"), manifest.get("sourceSha256"), manifest.get("format"), manifest.get("cellOrder"), manifest.get("cellBytes"), manifest.get("width"), manifest.get("height"), manifest.get("trailingBytes")) != (binding["mapId"], binding["mapSourceSha256"], "classic-12", "column-major", 12, world.width, world.height, world.trailing_bytes):
                fail("map_manifest_identity")
            assembled = bytearray(world.cell_bytes)
            covered = bytearray(world.width * world.height)
            chunks = manifest.get("chunks")
            if not isinstance(chunks, list) or not chunks:
                raise ValueError("MAP manifest has no chunks")
            directory = safe_path(root, binding["mapManifest"]["path"]).parent
            for chunk in chunks:
                x, y, width, height = (chunk[key] for key in ("x", "y", "width", "height"))
                if any(type(value) is not int for value in (x, y, width, height)) or x < 0 or y < 0 or width <= 0 or height <= 0 or x + width > world.width or y + height > world.height:
                    raise ValueError("MAP chunk geometry outside source")
                filename = chunk["file"]
                if Path(filename).name != filename:
                    raise ValueError("MAP chunk filename escapes map directory")
                path = safe_path(directory, filename)
                data = path.read_bytes()
                if len(data) != width * height * 12 or chunk.get("bytes") != len(data) or hashlib.sha256(data).hexdigest() != chunk.get("sha256"):
                    raise ValueError(f"MAP chunk lock/length mismatch: {filename}")
                for cx in range(width):
                    start = ((x + cx) * world.height + y)
                    if any(covered[start:start + height]):
                        raise ValueError("MAP chunks overlap")
                    covered[start:start + height] = b"\1" * height
                    assembled[start * 12:(start + height) * 12] = data[cx * height * 12:(cx + 1) * height * 12]
                row["chunks"].append({"file": filename, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(), "dependencies": cell_references(data)})
            if not all(covered) or bytes(assembled) != original[52:52 + world.cell_bytes]:
                fail("chunk_cells_differ_from_original_map_or_missing")
            dependencies = cell_references(bytes(assembled))
            row["chunkDerivedDependencies"] = dependencies
            if dependencies != manifest.get("dependencies") or dependencies != cell_references(original[52:52 + world.cell_bytes]):
                fail("chunk_derived_dependencies_mismatch")

            active = json.loads(safe_path(root, "content/classic-176/active-asset-sources.json").read_bytes())
            matches = [asset for asset in active["assets"] if asset.get("id") == binding["nativeSourceId"]]
            if len(matches) != 1:
                raise ValueError("native source ID is not an independent active source")
            national = matches[0]
            locks = {entry["purpose"]: entry for entry in national["sourceFiles"]}
            if (national.get("role"), national.get("namespace"), national.get("provenance"), locks["data"]["sha256"], locks["index"]["sha256"], national["library"]["sourceFrameCount"]) != ("active_required", binding["nativeNamespace"], "native_pixels", binding["nativeSourceSha256"], binding["nativeIndexSha256"], binding["nativeSourceFrameCount"]):
                fail("native_independent_contract_identity")
            roots = {key: root if key == "repository" else Path(value) for key, value in active["roots"].items()}
            for key, value in (source_roots or {}).items():
                if key not in roots or key == "repository":
                    raise ValueError("invalid external source root override")
                roots[key] = Path(value)
            native_paths = {}
            for purpose in ("data", "index"):
                lock = locks[purpose]
                path = safe_path(roots[lock["root"]], lock["path"])
                raw = path.read_bytes()
                if len(raw) != lock["bytes"] or hashlib.sha256(raw).hexdigest() != lock["sha256"]:
                    raise ValueError(f"native {purpose} source lock mismatch")
                native_paths[purpose] = path
            native_reader = WeMadeLibrary(native_paths["data"], native_paths["index"])
            native = read_json_locked(binding["nativeManifest"])
            if (native.get("format"), native.get("sourceSha256"), native.get("indexSha256"), native.get("sourceFrameCount"), native_reader.count) != ("wil-classic", binding["nativeSourceSha256"], binding["nativeIndexSha256"], binding["nativeSourceFrameCount"], binding["nativeSourceFrameCount"]):
                fail("native_manifest_identity")
            native_available = {int(index) for index in native["frames"]} | set(native.get("empty", []))
            native_missing = sorted(set(dependencies["Tiles"]) - native_available)
            row["nativeMissingIndices"] = native_missing
            preserved = sorted(set(dependencies["Tiles"]) - set(native_missing))
            if binding["indices"] != native_missing or binding["preserveNativeIndices"] != preserved:
                fail("exact_missing_or_preserved_index_set_mismatch")
            if any(index < native_reader.count for index in binding["indices"]):
                fail("reference_cannot_hide_unexported_valid_native_frames")
            if not set(binding["protectedNativeIndices"]) <= {int(index) for index in native["frames"]}:
                fail("native_placeholders_not_preserved")
            if binding["nativeManifest"]["path"] not in national["library"]["manifests"]:
                fail("native_manifest_not_registered")
            native_directory = safe_path(root, binding["nativeManifest"]["path"]).parent
            if "/" + native_directory.relative_to(root / "assets/web").as_posix() != binding["nativeNamespace"]:
                fail("native_namespace_path")
            row["checkedNativePreservedFrames"] = 0
            for index in binding["preserveNativeIndices"]:
                original_frame = native_reader.frame(index)
                frame = native["frames"].get(str(index))
                if frame is None:
                    if original_frame is not None and original_frame["width"] and original_frame["height"]:
                        fail("preserved_nonempty_native_frame_unexported", index=index)
                    continue
                # Older national exports omit per-frame source fields. Their
                # independently locked WIL/WIX and exact re-decoded PNG still
                # prove identity; supplied source fields must agree if present.
                if original_frame is None or frame.get("index") != index or any(frame.get(key) != original_frame[key] for key in ("width", "height", "offsetX", "offsetY")) or frame.get("sourceIndex", index) != index or frame.get("sourceSha256", binding["nativeSourceSha256"]) != binding["nativeSourceSha256"] or frame.get("indexSha256", binding["nativeIndexSha256"]) != binding["nativeIndexSha256"]:
                    fail("preserved_native_frame_identity", index=index)
                    continue
                filename = frame.get("file")
                if not isinstance(filename, str) or Path(filename).name != filename:
                    raise ValueError("preserved native PNG path escapes library")
                exported = safe_path(native_directory, filename).read_bytes()
                if hashlib.sha256(exported).hexdigest() != frame.get("sha256") or exported != png_rgba(original_frame["width"], original_frame["height"], original_frame["pixels"]):
                    fail("preserved_native_png_bytes_or_pixels_mismatch", index=index)
                row["checkedNativePreservedFrames"] += 1

            registry = read_json_locked(binding["candidateRegistry"])
            candidate = read_json_locked(binding["candidateManifest"])
            upstream = binding["upstreamLock"]
            source_list = json.loads(safe_path(root, upstream["path"]).read_bytes())[upstream["section"]]
            matches = [lock for lock in source_list if lock.get("file") == upstream["file"]]
            if len(matches) != 1:
                raise ValueError("candidate requires one independent upstream lock")
            lock = matches[0]
            if (lock["sha256"], lock["bytes"]) != (binding["sourceSha256"], binding["candidateSource"]["bytes"]):
                fail("candidate_upstream_lock_mismatch")
            if (registry.get("id"), registry.get("role"), registry.get("provenance"), registry.get("namespace"), registry.get("sourceFrameCount"), registry.get("source", {}).get("sha256"), registry.get("source", {}).get("bytes"), registry.get("map", {}).get("id"), registry.get("map", {}).get("sha256"), registry.get("map", {}).get("originalIndices")) != (binding["sourceId"], "reference_candidate", "reference_source", binding["namespace"], binding["sourceFrameCount"], binding["sourceSha256"], binding["candidateSource"]["bytes"], binding["mapId"], binding["mapSourceSha256"], binding["indices"]):
                fail("candidate_registry_identity")
            if registry.get("source", {}).get("url") != lock.get("url"):
                fail("candidate_registry_upstream_url")
            source = read_locked({**binding["candidateSource"], "sha256": binding["sourceSha256"]})
            reader = CrystalLibrary(source)
            if (candidate.get("schemaVersion"), candidate.get("format"), candidate.get("sourceSha256"), candidate.get("sourceFrameCount"), candidate.get("candidateId"), candidate.get("role"), candidate.get("provenance"), reader.count, reader.version) != (1, binding["sourceFormat"], binding["sourceSha256"], binding["sourceFrameCount"], binding["sourceId"], "reference_candidate", "reference_source", binding["sourceFrameCount"], 2):
                fail("candidate_manifest_identity")
            if sorted(int(index) for index in candidate["frames"]) != binding["indices"] or candidate.get("empty") or candidate.get("missing"):
                fail("candidate_exact_export_index_set")
            directory = safe_path(root, binding["candidateManifest"]["path"]).parent
            if "/" + directory.relative_to(root / "assets/web").as_posix() != binding["namespace"]:
                fail("candidate_namespace_path")
            for index in binding["indices"]:
                frame = candidate["frames"].get(str(index))
                original_frame = reader.frame(index)
                if not isinstance(frame, dict) or original_frame is None or not original_frame["width"] or not original_frame["height"] or not any(original_frame["pixels"][3::4]):
                    fail("candidate_frame_missing_empty_or_transparent", index=index)
                    continue
                if frame.get("index") != index or frame.get("sourceIndex") != index or frame.get("sourceSha256") != binding["sourceSha256"] or frame.get("pixelSha256") != hashlib.sha256(original_frame["pixels"]).hexdigest():
                    fail("candidate_original_index_or_pixel_identity", index=index)
                keys = ("width", "height", "offsetX", "offsetY", "shadowX", "shadowY", "shadow")
                if any(type(frame.get(key)) is not int or frame[key] != original_frame[key] for key in keys):
                    fail("candidate_signed_geometry_or_shadow_mismatch", index=index)
                # Rebuild the deterministic PNG from decoded locked BGRA. Exact
                # bytes cover RGBA channel conversion, alpha and PNG encoding.
                filename = frame.get("file")
                if not isinstance(filename, str) or Path(filename).name != filename:
                    raise ValueError("candidate PNG path escapes library")
                exported = safe_path(directory, filename).read_bytes()
                expected = png_rgba(original_frame["width"], original_frame["height"], original_frame["pixels"])
                if not isinstance(frame.get("sha256"), str) or SHA.fullmatch(frame["sha256"]) is None or hashlib.sha256(exported).hexdigest() != frame["sha256"] or exported != expected:
                    fail("candidate_png_bytes_or_decoded_pixels_mismatch", index=index)
                if original_frame.get("mask") is not None or frame.get("mask") is not None:
                    fail("unsupported_background_mask", index=index)
                row["checkedPngFrames"] += 1
                row["frames"][str(index)] = frame

            pairing = read_json_locked(binding["pairingEvidence"])
            target = pairing.get("targetMap", {})
            if pairing.get("mapId") != binding["mapId"] or target.get("sha256") != binding["mapSourceSha256"] or target.get("bytes") != binding["mapSourceBytes"] or target.get("gitBlob") != binding["mapSourceGitBlob"] or target.get("submoduleCommit") != binding["mapSourceCommit"] or pairing.get("mapVersionPairingVerified") is not False:
                fail("pairing_evidence_identity_or_false_upgrade")
            export = read_json_locked(binding["exportEvidence"])
            if (export.get("candidateId"), export.get("source", {}).get("sha256"), export.get("sourceFrameCount"), export.get("frames"), export.get("namespace"), export.get("mapBindingActive"), export.get("mapVersionPairingVerified")) != (binding["sourceId"], binding["sourceSha256"], binding["sourceFrameCount"], len(binding["indices"]), binding["namespace"], False, False):
                fail("frozen_candidate_export_scope_or_identity")
        except (OSError, ValueError, KeyError, TypeError, IndexError, struct.error) as error:
            fail("binding_resource_invalid", error=str(error))
        row["technicalOk"] = not failures
        row["selectionActive"] = row["technicalOk"] and binding["status"] == "enabled"
        row["renderIndices"] = list(binding["indices"]) if row["selectionActive"] else []
        if failures:
            result["failures"].append({"id": binding["id"], "entries": failures})
        result["historicalFailures"].append({"id": binding["id"], "mapId": binding["mapId"],
            "reason": "original_map_library_pairing_unverified", "nativeMissingIndices": row["nativeMissingIndices"],
            "scope": "Reference render coverage cannot satisfy the original national MAP/library pairing or original client comparison."})
    result["technicalOk"] = not result["contractErrors"] and not result["failures"]
    result["complete"] = result["technicalOk"] and not result["historicalFailures"]
    return result


def resolve_bound_frame(report: dict[str, Any], *, map_id: str, map_source_sha256: str,
                        layer: str, library: str, index: int) -> dict[str, Any] | None:
    """Resolve only a previously byte-audited explicit selection; no I/O here."""
    if type(index) is not int or not report.get("technicalOk") or report.get("contractErrors"):
        return None
    matches = [row for row in report.get("entries", []) if row.get("selectionActive")
        and (row.get("mapId"), row.get("mapSourceSha256"), row.get("layer"), row.get("library")) == (map_id, map_source_sha256, layer, library)
        and index in row.get("renderIndices", [])]
    if len(matches) != 1:
        return None
    row = matches[0]
    frame = row["frames"].get(str(index))
    if frame is None:
        return None
    return {"namespace": row["namespace"], "sourceId": row["sourceId"], "sourceSha256": row["sourceSha256"],
            "frame": frame, "url": row["namespace"] + "/" + frame["file"], "provenance": "reference_source",
            "index": index, "pairingVerified": False}
