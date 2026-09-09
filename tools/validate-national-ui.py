#!/usr/bin/env python3
"""Check that a local 2003 national-client UI asset set is complete.

The checker is intentionally format-agnostic. It validates the WIL/WIX,
WZL/WZX, or single-PAK file contract before a decoder is selected for the
particular client build.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys
from typing import Optional
import zlib

from ui_visual_diff import read_png


ROOT = Path(__file__).resolve().parents[1]
PROFILE_PATH = ROOT / "content/classic-176/national-ui-profile.json"


def file_index(data_dir: Path):
    index = {}
    for path in data_dir.rglob("*"):
        if path.is_file():
            index.setdefault(path.name.casefold(), []).append(str(path.relative_to(data_dir)))
    return index


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def audit_exported_libraries(export_root: Optional[Path]):
    """Classify exported frames and report integrity diagnostics.

    The source contract above only checks that a decoder can find paired
    files.  This optional pass checks the decoded PNG output without making
    Pillow a runtime dependency.  A frame is blank when every decoded pixel
    has zero alpha; duplicate frames are classified by identical file hash.
    """
    if export_root is None:
        return None
    result = {"root": str(export_root), "libraries": [], "ok": False}
    if not export_root.is_dir():
        result["error"] = f"export root does not exist: {export_root}"
        return result
    for manifest_path in sorted(export_root.rglob("library.json")):
        try:
            manifest = json.loads(manifest_path.read_text())
        except (OSError, ValueError) as error:
            result["libraries"].append({"library": str(manifest_path.parent), "error": str(error)})
            continue
        frames = manifest.get("frames", {})
        summary = {
            "library": str(manifest_path.parent.relative_to(export_root)),
            "source": manifest.get("source"),
            "totalFrames": len(frames),
            "validFrames": 0,
            "blankFrames": 0,
            "duplicateFrames": 0,
            "decodeFailedFrames": 0,
            "missingFrames": 0,
            "hashMismatches": 0,
            "geometryMismatches": 0,
            "issues": [],
        }
        seen_hashes = {}
        def frame_sort_key(entry):
            frame_id = str(entry[0])
            return (0, int(frame_id)) if frame_id.isdigit() else (1, frame_id)

        for frame_id, frame in sorted(frames.items(), key=frame_sort_key):
            file_name = frame.get("file") if isinstance(frame, dict) else None
            if not file_name:
                summary["missingFrames"] += 1
                summary["issues"].append({"frame": frame_id, "kind": "missing-file"})
                continue
            frame_path = manifest_path.parent / file_name
            if not frame_path.is_file():
                summary["missingFrames"] += 1
                summary["issues"].append({"frame": frame_id, "kind": "missing-file", "file": file_name})
                continue
            digest = _sha256(frame_path)
            expected_hash = frame.get("sha256") if isinstance(frame, dict) else None
            if expected_hash and expected_hash != digest:
                summary["hashMismatches"] += 1
                summary["issues"].append({"frame": frame_id, "kind": "hash-mismatch", "file": file_name})
            duplicate_of = seen_hashes.get(digest)
            try:
                width, height, pixels = read_png(frame_path)
            except (OSError, ValueError, zlib.error) as error:
                summary["decodeFailedFrames"] += 1
                summary["issues"].append({"frame": frame_id, "kind": "decode-failed", "file": file_name, "error": str(error)})
                continue
            if duplicate_of is not None:
                summary["duplicateFrames"] += 1
                summary["issues"].append({"frame": frame_id, "kind": "duplicate", "duplicateOf": duplicate_of})
                continue
            seen_hashes[digest] = frame_id
            if isinstance(frame, dict) and (frame.get("width") != width or frame.get("height") != height):
                summary["geometryMismatches"] += 1
                summary["issues"].append({"frame": frame_id, "kind": "geometry-mismatch", "file": file_name, "decoded": [width, height]})
            if all(pixels[index] == 0 for index in range(3, len(pixels), 4)):
                summary["blankFrames"] += 1
            else:
                summary["validFrames"] += 1
        result["libraries"].append(summary)
    result["ok"] = bool(result["libraries"]) and all(
        "error" not in library
        and library.get("decodeFailedFrames", 0) == 0
        and library.get("missingFrames", 0) == 0
        and library.get("hashMismatches", 0) == 0
        and library.get("geometryMismatches", 0) == 0
        for library in result["libraries"]
    )
    return result


def validate(data_dir: Optional[Path], export_root: Optional[Path] = None):
    profile = json.loads(PROFILE_PATH.read_text())
    families = profile["sourceContract"]["families"]
    report = {
        "profile": profile["id"],
        "label": profile["label"],
        "dataDir": str(data_dir) if data_dir else None,
        "families": [],
        "ok": False,
    }
    if export_root is not None:
        report["exportAudit"] = audit_exported_libraries(export_root)
    required_families = [family["id"] for family in families if family.get("required", True)]
    if data_dir is None:
        report["error"] = "missing --data-dir"
        report["missingFamilies"] = required_families
        return report
    if not data_dir.is_dir():
        report["error"] = f"data directory does not exist: {data_dir}"
        report["missingFamilies"] = required_families
        return report

    index = file_index(data_dir)
    missing = []
    for family in families:
        matched = None
        for variant in family["variants"]:
            if all(name.casefold() in index for name in variant):
                matched = {"files": variant, "paths": [index[name.casefold()] for name in variant]}
                break
        result = {
            "id": family["id"],
            "label": family["label"],
            "required": family.get("required", True),
            "matched": matched,
        }
        report["families"].append(result)
        if matched is None and family.get("required", True):
            missing.append(family["id"])
    report["missingFamilies"] = missing
    report["missingOptionalFamilies"] = [
        family["id"]
        for family, result in zip(families, report["families"])
        if result["matched"] is None and not family.get("required", True)
    ]
    report["ok"] = not missing
    if export_root is not None:
        report["ok"] = report["ok"] and bool(report["exportAudit"] and report["exportAudit"].get("ok"))
    if missing:
        report["status"] = "blocked-missing-reference-assets"
    elif export_root is not None and not report["exportAudit"].get("ok", False):
        report["status"] = "blocked-export-integrity"
    else:
        report["status"] = "ready-for-decoder"
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, help="local client's Data directory")
    parser.add_argument("--export-root", type=Path, help="optional exported UI root containing library.json manifests")
    parser.add_argument("--json", type=Path, help="also write the JSON report to this path")
    args = parser.parse_args()
    report = validate(args.data_dir, args.export_root)
    payload = json.dumps(report, ensure_ascii=False, indent=2)
    print(payload)
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(payload + "\n")
    return 0 if report["ok"] else 2


if __name__ == "__main__":
    sys.exit(main())
