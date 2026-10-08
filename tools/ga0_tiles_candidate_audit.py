#!/usr/bin/env python3
"""Research the hash-locked GA0 Tiles candidate without activating any resources.

Only --fetch-locked-source writes a candidate binary, into isolated staging.
The report distinguishes decode coverage from a proven MAP/library pairing.
"""
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import sys
from urllib.request import Request, urlopen
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from crystal_lib import CrystalLibrary
from map_tool import ClassicMap
from wil_lib import WeMadeLibrary

GA0_SHA256 = "231b29ef5afa24aa276d195c037fa576b268033726642f0750e8c5ae2bbe5c2f"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def fetch_locked(lock, directory, opener=urlopen):
    """Download exactly one independently locked library; never overwrite files."""
    directory = Path(directory)
    if Path(lock["file"]).name != lock["file"] or lock["file"] != "Tiles.Lib":
        raise ValueError("candidate must be the independently locked Tiles.Lib basename")
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / lock["file"]
    if target.exists():
        data = target.read_bytes()
        if len(data) != lock["bytes"] or digest(data) != lock["sha256"]:
            raise ValueError("existing staging candidate does not match independent lock; preserved")
        return target, {"reused": True, "url": lock["url"], "bytes": len(data)}
    temporary = directory / ("Tiles.Lib." + uuid.uuid4().hex + ".unverified")
    count, checksum = 0, hashlib.sha256()
    try:
        request = Request(lock["url"], headers={"User-Agent": "Mir2AssetAudit/1.0"})
        with opener(request, timeout=60) as response, temporary.open("xb") as stream:
            final_url = response.geturl() if hasattr(response, "geturl") else lock["url"]
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                count += len(chunk)
                if count > lock["bytes"]:
                    raise ValueError("download exceeds independently locked byte count")
                checksum.update(chunk)
                stream.write(chunk)
        if count != lock["bytes"] or checksum.hexdigest() != lock["sha256"]:
            raise ValueError(f"download lock mismatch; unverified staging file preserved: {temporary}")
        if target.exists():
            raise ValueError("candidate target appeared during download; preserved both files")
        temporary.rename(target)
        return target, {"reused": False, "url": lock["url"], "finalUrl": final_url,
                        "bytes": count, "sha256": checksum.hexdigest()}
    except Exception:
        # No source/public file is touched; failed candidate bytes remain isolated.
        raise


def scan_local(roots):
    results = []
    for root in roots:
        root = Path(root)
        matches = []
        for directory, names, files in os.walk(root):
            names[:] = [name for name in names if name not in ("node_modules", ".git", ".nuget", "dotnet", "dotnet-home")]
            for filename in files:
                p = Path(directory) / filename
                if p.stem.casefold() == "tiles" and p.suffix.casefold() in (".lib", ".wil", ".wix", ".wzl", ".wzx"):
                    matches.append({"path": str(p), "bytes": p.stat().st_size,
                                    "sha256": digest(p.read_bytes())})
        results.append({"root": str(root), "exists": root.is_dir(), "matches": matches})
    return results


def frame_identity(frame):
    return tuple(frame[key] for key in ("width", "height", "offsetX", "offsetY"))


def inspect_candidate(source, lock, requested, native=None, overlap=()):
    """Decode every requested original index; count alone never grants approval."""
    source = Path(source)
    data = source.read_bytes()
    report = {"path": str(source), "bytes": len(data), "sha256": digest(data),
        "lockedBytes": lock["bytes"], "lockedSha256": lock["sha256"],
        "provenance": "reference_source", "frames": [], "sharedIndexComparison": [],
        "sourceIdentityVerified": len(data) == lock["bytes"] and digest(data) == lock["sha256"],
        "mapVersionPairingVerified": False, "activationRecommended": False}
    if not report["sourceIdentityVerified"]:
        report["error"] = "candidate_source_lock_mismatch"
        return report
    try:
        library = CrystalLibrary(data)
    except ValueError as error:
        report["error"] = str(error)
        return report
    report.update({"format": f"crystal-lib-v{library.version}", "sourceFrameCount": library.count})
    for index in sorted(set(requested)):
        row = {"sourceIndex": index}
        try:
            frame = library.frame(index)
            if frame is None or not frame["width"] or not frame["height"]:
                row["status"] = "empty"
            else:
                alpha = frame["pixels"][3::4]
                visible = sum(value > 0 for value in alpha)
                row.update({"status": "usable" if visible else "transparent_only",
                    "width": frame["width"], "height": frame["height"],
                    "offsetX": frame["offsetX"], "offsetY": frame["offsetY"],
                    "pixelSha256": digest(frame["pixels"]), "visiblePixels": visible,
                    "alphaValues": sorted(set(alpha)), "shadow": frame["shadow"],
                    "mask": bool(frame.get("mask"))})
        except IndexError:
            row["status"] = "out_of_source_range"
        except (ValueError, OSError, EOFError) as error:
            row.update(status="decode_error", error=str(error))
        report["frames"].append(row)
    for index in sorted(set(overlap)):
        row = {"sourceIndex": index}
        try:
            candidate, original = library.frame(index), native.frame(index)
            if candidate is None or original is None:
                row.update(status="both_empty" if candidate is None and original is None else "empty_mismatch")
            else:
                geometry_match = frame_identity(candidate) == frame_identity(original)
                pixels_match = candidate["pixels"] == original["pixels"]
                row.update(status="exact" if geometry_match and pixels_match else "different",
                    geometryMatch=geometry_match, pixelsMatch=pixels_match,
                    candidateGeometry=list(frame_identity(candidate)), nativeGeometry=list(frame_identity(original)),
                    candidatePixelSha256=digest(candidate["pixels"]), nativePixelSha256=digest(original["pixels"]))
        except (IndexError, ValueError, OSError, EOFError) as error:
            row.update(status="decode_error", error=str(error))
        report["sharedIndexComparison"].append(row)
    report["coverage"] = dict(Counter(row["status"] for row in report["frames"]))
    report["sharedComparisonSummary"] = dict(Counter(row["status"] for row in report["sharedIndexComparison"]))
    report["geometryHistogram"] = {f"{w}x{h}@{x},{y}": count for (w, h, x, y), count in Counter(
        (row["width"], row["height"], row["offsetX"], row["offsetY"])
        for row in report["frames"] if row["status"] == "usable").items()}
    report["indexCoverageComplete"] = all(row["status"] == "usable" for row in report["frames"]) and bool(report["frames"])
    return report


def research(candidate, *, scans=()):
    profile = read_json(ROOT / "content/classic-176/version-profile.json")
    if "GA0" not in profile["p0Baseline"]["maps"]:
        raise ValueError("GA0 must remain in the production profile")
    raw_path = ROOT / "vendor/mirserver-data/Mir200/Map/GA0.map"
    raw = raw_path.read_bytes()
    if digest(raw) != GA0_SHA256:
        raise ValueError("GA0 source differs from independently pinned audit baseline")
    world = ClassicMap(raw)
    dependencies = sorted(world.dependencies()[0][0])
    exported = read_json(ROOT / "assets/web/maps/GA0/map.json")
    if exported["sourceSha256"] != GA0_SHA256 or exported["dependencies"]["Tiles"] != dependencies:
        raise ValueError("exported GA0 Tiles dependencies differ from real MAP bytes")
    contract = read_json(ROOT / "content/classic-176/active-asset-sources.json")
    active = next(row for row in contract["assets"] if row["id"] == "national:map:Tiles")
    source_paths = {}
    for lock in active["sourceFiles"]:
        path = Path(contract["roots"][lock["root"]]) / lock["path"]
        data = path.read_bytes()
        if len(data) != lock["bytes"] or digest(data) != lock["sha256"]:
            raise ValueError("active national Tiles source lock mismatch")
        source_paths[lock["purpose"]] = path
    native = WeMadeLibrary(source_paths["data"], source_paths["index"])
    manifest = read_json(ROOT / "assets/web/libraries/Tiles/library.json")
    available = set(map(int, manifest["frames"])) | set(manifest["empty"])
    missing = sorted(set(dependencies) - available)
    lock = next(row for row in read_json(ROOT / "content/classic-176/asset-sources.json")["files"] if row["file"] == "Tiles.Lib")
    report = {"schemaVersion": 1, "finishedAt": datetime.now(timezone.utc).isoformat(),
        "domain": "GA0-tiles-source-research", "complete": False,
        "scope": "Locked candidate identity/index/decoded-pixel comparison only; MAP-library historical pairing and browser/native rendering are unverified",
        "map": {"id": "GA0", "path": str(raw_path), "sha256": digest(raw), "width": world.width, "height": world.height,
            "tileDependencies": len(dependencies), "missingUnique": len(missing), "missingIndices": missing},
        "native": {"sourceFrameCount": native.count, "data": str(source_paths["data"]), "index": str(source_paths["index"])},
        "candidateLock": lock, "localScans": list(scans),
        "productionChanged": False, "databaseAccessed": False, "servicesChanged": False,
        "sources": [{"path": name, "sha256": digest((ROOT / name).read_bytes())} for name in (
            "tools/ga0_tiles_candidate_audit.py", "tools/crystal_lib.py", "tools/wil_lib.py", "tools/map_tool.py",
            "content/classic-176/asset-sources.json", "content/classic-176/active-asset-sources.json", "content/classic-176/version-profile.json")]}
    report["candidate"] = inspect_candidate(candidate, lock, missing, native, [i for i in dependencies if i < native.count])
    report["gaps"] = ["Independent upstream Tiles.Lib lock proves candidate identity only, not the paired GA0 MAP version",
        "GA0 is absent from the national 2003 Map inventory", "Original-client/reference pack pairing, MAP-specific source choice and browser visual comparison remain open",
        "No candidate is enabled or placed in /libraries/Tiles; existing 572-map national namespaces are unchanged"]
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidate", type=Path)
    parser.add_argument("--fetch-locked-source", action="store_true")
    parser.add_argument("--scan-root", type=Path, action="append", default=[])
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    lock = next(row for row in read_json(ROOT / "content/classic-176/asset-sources.json")["files"] if row["file"] == "Tiles.Lib")
    scan = scan_local(args.scan_root)
    fetch = None
    if args.fetch_locked_source:
        candidate, fetch = fetch_locked(lock, ROOT / ".runtime/staging/candidate-maps")
    elif args.candidate:
        candidate = args.candidate
    else:
        parser.error("provide a candidate or explicitly fetch the independently locked source")
    report = research(candidate, scans=scan)
    report["fetch"] = fetch
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"complete": False, "candidateIdentity": report["candidate"]["sourceIdentityVerified"],
        "nativeSourceFrames": report["native"]["sourceFrameCount"], "missingUnique": report["map"]["missingUnique"],
        "candidateSourceFrames": report["candidate"].get("sourceFrameCount"),
        "candidateCoverage": report["candidate"].get("coverage"),
        "sharedComparison": report["candidate"].get("sharedComparisonSummary"),
        "mapVersionPairingVerified": False, "activationRecommended": False}, ensure_ascii=False))
    return 0 if report["candidate"]["sourceIdentityVerified"] and report["candidate"].get("indexCoverageComplete") else 2


if __name__ == "__main__":
    raise SystemExit(main())
