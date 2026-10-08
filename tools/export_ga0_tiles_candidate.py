#!/usr/bin/env python3
"""Plan or export unbound GA0 reference Tiles into a separate public namespace.

Default mode is read-only apart from the requested report. --apply creates only
the candidate namespace and its independent registration, with conflict refusal.
No production MAP/source choice, active contract or national library is changed.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import struct
import sys
import zlib

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from crystal_lib import CrystalLibrary, png_rgba
from ga0_tiles_candidate_audit import GA0_SHA256, research


def sha(data):
    return hashlib.sha256(data).hexdigest()


def json_bytes(data):
    return (json.dumps(data, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def decoded_png_rgba(data):
    """Read our deterministic PNG's CRC-protected, unfiltered RGBA scanlines."""
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("invalid PNG signature")
    cursor, compressed, geometry = 8, bytearray(), None
    while cursor < len(data):
        length = struct.unpack_from(">I", data, cursor)[0]
        kind = data[cursor + 4:cursor + 8]
        payload = data[cursor + 8:cursor + 8 + length]
        crc = struct.unpack_from(">I", data, cursor + 8 + length)[0]
        if zlib.crc32(kind + payload) & 0xffffffff != crc:
            raise ValueError("PNG chunk CRC mismatch")
        if kind == b"IHDR":
            width, height, depth, colour, compression, filtering, interlace = struct.unpack(">IIBBBBB", payload)
            if (depth, colour, compression, filtering, interlace) != (8, 6, 0, 0, 0):
                raise ValueError("unexpected PNG encoding")
            geometry = width, height
        elif kind == b"IDAT":
            compressed.extend(payload)
        cursor += length + 12
        if kind == b"IEND":
            break
    if geometry is None or cursor != len(data):
        raise ValueError("incomplete PNG")
    width, height = geometry
    raw = zlib.decompress(compressed)
    stride = width * 4 + 1
    if len(raw) != height * stride or any(raw[row * stride] != 0 for row in range(height)):
        raise ValueError("unexpected PNG scanline data")
    return geometry, b"".join(raw[row * stride + 1:(row + 1) * stride] for row in range(height))


def plan_export(source, context, root=ROOT):
    root = Path(root).resolve()
    destination = root / "assets/web/libraries/reference-ga0/Tiles"
    registration = root / "content/classic-176/ga0-tiles-candidate.json"
    if destination.resolve() != destination or registration.resolve() != registration:
        raise ValueError("candidate destination must not resolve through another namespace")
    locked = context["candidateLock"]
    raw = Path(source).read_bytes()
    if len(raw) != locked["bytes"] or sha(raw) != locked["sha256"]:
        raise ValueError("candidate differs from independent upstream lock")
    if context["map"]["id"] != "GA0" or context["map"]["sha256"] != GA0_SHA256:
        raise ValueError("candidate export requires the pinned GA0 map")
    if not context["candidate"]["sourceIdentityVerified"] or not context["candidate"].get("indexCoverageComplete"):
        raise ValueError("candidate indices must all decode; cannot substitute empty frames")
    requested = context["map"]["missingIndices"]
    if len(requested) != len(set(requested)) or not requested or sorted(requested) != [row["sourceIndex"] for row in context["candidate"]["frames"]]:
        raise ValueError("candidate selection must preserve the exact missing-index set")
    library = CrystalLibrary(raw)
    files, frames = {}, {}
    for index in requested:
        frame = library.frame(index)
        if frame is None or frame["width"] <= 0 or frame["height"] <= 0 or not any(frame["pixels"][3::4]):
            raise ValueError(f"candidate index {index} is empty")
        layers = [(frame, str(index)), (frame.get("mask"), str(index) + "-mask")]
        record = {key: value for key, value in frame.items() if key not in ("pixels", "mask")}
        record.update(sourceIndex=index, sourceSha256=locked["sha256"], pixelSha256=sha(frame["pixels"]))
        for layer, name in layers:
            if layer is None:
                continue
            png = png_rgba(layer["width"], layer["height"], layer["pixels"])
            filename = f"{name}.{sha(png)[:16]}.png"
            files[destination / filename] = png
            metadata = {key: value for key, value in layer.items() if key not in ("pixels", "mask")}
            metadata.update(file=filename, sha256=sha(png))
            if layer is frame:
                record.update(metadata)
            else:
                record["mask"] = metadata
        frames[str(index)] = record
    manifest = dict(schemaVersion=1, format=f"crystal-lib-v{library.version}", source=locked["file"],
        sourceSha256=locked["sha256"], sourceFrameCount=library.count, frames=frames, empty=[], missing=[],
        actions=library.actions, candidateId="ga0-tiles-reference-candidate", role="reference_candidate",
        provenance="reference_source", mapBindingActive=False, mapVersionPairingVerified=False,
        originalIndexPolicy="no remapping; unresolved GA0 indices only")
    files[destination / "library.json"] = json_bytes(manifest)
    registry = dict(schemaVersion=1, id="ga0-tiles-reference-candidate", role="reference_candidate",
        status="decoded-unbound", provenance="reference_source", version="crystal-patch-reference",
        namespace="/libraries/reference-ga0/Tiles", library="assets/web/libraries/reference-ga0/Tiles/library.json",
        source=dict(lockFile="content/classic-176/asset-sources.json", lockSection="files", **locked),
        map=dict(id="GA0", sha256=GA0_SHA256, originalIndices=sorted(requested)),
        sourceFrameCount=library.count, exportedFrames=len(frames), mapBindingActive=False,
        mapVersionPairingVerified=False, complete=False,
        sharedIndexComparison=context["candidate"]["sharedComparisonSummary"],
        nonExactSharedIndices=[row["sourceIndex"] for row in context["candidate"]["sharedIndexComparison"] if row["status"] != "exact"],
        scope="Reference candidate exports only. Production GA0 retains its unresolved frames and national source choice; historical pairing/browser/native rendering remain unverified.")
    files[registration] = json_bytes(registry)
    conflicts, unchanged, writes = [], [], []
    for path, data in files.items():
        relative = path.relative_to(root).as_posix()
        if path.exists():
            if not path.is_file() or path.read_bytes() != data:
                conflicts.append(relative)
            else:
                unchanged.append(relative)
        else:
            writes.append(relative)
    if conflicts:
        raise ValueError("candidate conflict; existing files preserved: " + ", ".join(conflicts))
    return dict(files=files, manifest=manifest, registry=registry, writes=writes, unchanged=unchanged, root=root)


def apply_plan(plan):
    # Validate all existing targets before any mutation, including plan/apply races.
    for path, data in plan["files"].items():
        if path.resolve() != path:
            raise ValueError("candidate target resolves outside its planned namespace")
        if path.exists() and (not path.is_file() or path.read_bytes() != data):
            raise ValueError("candidate changed after planning; all existing files preserved")
    written = []
    for path, data in plan["files"].items():
        if path.exists():
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("xb") as stream:
            stream.write(data)
        written.append(path.relative_to(plan["root"]).as_posix())
    return written


def verify_exports(plan, source):
    raw = Path(source).read_bytes()
    if sha(raw) != plan["manifest"]["sourceSha256"]:
        raise ValueError("candidate source changed after planning")
    library = CrystalLibrary(raw)
    results = []
    destination = plan["root"] / "assets/web/libraries/reference-ga0/Tiles"
    for value in plan["manifest"]["frames"].values():
        index = value["sourceIndex"]
        original = library.frame(index)
        for layer, exported in ((original, value), (original.get("mask"), value.get("mask"))):
            if layer is None:
                continue
            data = (destination / exported["file"]).read_bytes()
            geometry, pixels = decoded_png_rgba(data)
            expected = bytearray(layer["pixels"])
            expected[0::4], expected[2::4] = layer["pixels"][2::4], layer["pixels"][0::4]
            if sha(data) != exported["sha256"] or geometry != (layer["width"], layer["height"]) or pixels != expected:
                raise ValueError(f"candidate PNG differs from decoded source pixels: {index}")
            if (exported["offsetX"], exported["offsetY"]) != (layer["offsetX"], layer["offsetY"]):
                raise ValueError(f"candidate signed offsets differ: {index}")
        results.append(dict(index=index, pixelExact=True, alphaExact=True, geometryExact=True))
    for path, data in plan["files"].items():
        if path.read_bytes() != data:
            raise ValueError(f"candidate file changed during verification: {path}")
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidate", type=Path, default=ROOT / ".runtime/staging/candidate-maps/Tiles.Lib")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    context = research(args.candidate)
    plan = plan_export(args.candidate, context)
    written = apply_plan(plan) if args.apply else []
    verification = verify_exports(plan, args.candidate) if args.apply else []
    report = dict(schemaVersion=1, finishedAt=datetime.now(timezone.utc).isoformat(),
        operation="apply" if args.apply else "plan", candidateId=plan["registry"]["id"], complete=False,
        source=plan["registry"]["source"], sourceFrameCount=plan["registry"]["sourceFrameCount"],
        frames=len(plan["manifest"]["frames"]), namespace=plan["registry"]["namespace"],
        mapBindingActive=False, mapVersionPairingVerified=False, productionChanged=False,
        plannedWrites=plan["writes"], written=written, unchanged=plan["unchanged"],
        sourcePixelVerification=verification, sharedIndexComparison=context["candidate"]["sharedComparisonSummary"],
        scope="Independent unbound reference namespace only; no active-source, production MAP/renderer/DB/services changes",
        sources=[dict(path=name, sha256=sha((ROOT / name).read_bytes())) for name in (
            "tools/export_ga0_tiles_candidate.py", "tools/ga0_tiles_candidate_audit.py", "tools/crystal_lib.py",
            "content/classic-176/asset-sources.json", "content/classic-176/active-asset-sources.json")])
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_bytes(json_bytes(report))
    print(json.dumps({key: report[key] for key in ("operation", "frames", "namespace", "complete", "mapBindingActive", "mapVersionPairingVerified")} | dict(written=len(written), unchanged=len(plan["unchanged"]), pixelVerified=len(verification))))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
