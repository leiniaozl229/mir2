#!/usr/bin/env python3
"""Check or repair only the 192 original sword PNGs in the locked Magic library.
Default is read-only for assets; --apply merges requested frames without deleting
other source indices/files. It never changes source WIL/WIX, maps or runtime data.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from wil_lib import WeMadeLibrary
from crystal_lib import png_rgba

LOCKS = {
    "sourceSha256": "be46a0258349b26db9ba7dba595abac1f0767d52fef11d9f508e704f2f6deaac",
    "indexSha256": "7f95ff7ba4add42157e10eb0d43ee7c77fd3c5ac3ea1183e39971066a40dfc91",
}
BASES = {"power": 800, "thrusting": 1410, "halfMoon": 1700, "fire": 3480}
INDICES = [base + direction * 10 + frame for base in BASES.values()
           for direction in range(8) for frame in range(6)]
FIELDS = ("index", "file", "width", "height", "offsetX", "offsetY", "sha256")


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def atomic_write(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".national-melee.tmp")
    temporary.write_bytes(data)
    temporary.replace(path)


def atomic_json(path, value):
    atomic_write(path, (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))


def verify_contract(contract, locks):
    evidence = contract["evidence"]
    if any(evidence.get(key) != value for key, value in locks.items()):
        raise ValueError("contract source lock mismatch")
    if evidence.get("sourceFrameCount") != 4010:
        raise ValueError("unexpected original Magic frame count")
    if {kind: entry["base"] for kind, entry in contract["specials"].items()} != BASES:
        raise ValueError("reference sword kind/base mapping changed")
    expected_body = {"action": "attack", "start": 200, "count": 6,
                     "directionStride": 8, "interval": 85,
                     "strictGreater": True, "advancePerTick": 1}
    if contract["bodyAction"] != expected_body:
        raise ValueError("reference body action changed")
    draw = contract["draw"]
    if draw["library"] != "Magic" or draw["directionStride"] != 10 or draw["blendMode"] != "screen" or draw["actorZIndex"] != 4:
        raise ValueError("reference sword layer changed")
    if set(contract["frames"]) != {str(index) for index in INDICES}:
        raise ValueError("contract must contain exactly 192 requested source indices")
    for index in INDICES:
        entry = contract["frames"][str(index)]
        if entry.get("index") != index or not isinstance(entry.get("file"), str) or Path(entry["file"]).name != entry["file"]:
            raise ValueError(f"unsafe or invalid source frame entry: {index}")


def inspect(data_dir, destination, contract, *, apply=False, locks=None):
    # Function-only fixture locks are used by unit tests. CLI never exposes an
    # override and always requires this release's immutable native WIL/WIX pair.
    locks = LOCKS if locks is None else locks
    verify_contract(contract, locks)
    data_dir, destination = Path(data_dir), Path(destination)
    sources = {p.name.casefold(): p for p in data_dir.iterdir() if p.is_file()}
    source, index = sources.get("magic.wil"), sources.get("magic.wix")
    if source is None or index is None:
        raise FileNotFoundError("missing original Magic.wil/Magic.wix")
    lib = WeMadeLibrary(source, index)
    source_meta = {"source": source.name, "sourceSha256": sha256(lib.data),
                   "index": index.name, "indexSha256": sha256(lib.index_data),
                   "sourceFrameCount": lib.count}
    if any(source_meta[key] != value for key, value in locks.items()) or lib.count != 4010:
        raise ValueError("source version mismatch; no asset output changed")
    manifest_path = destination / "library.json"
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if manifest.get("format") != "wil-classic" or any(manifest.get(key) != value for key, value in locks.items()):
            raise ValueError("existing manifest belongs to another source")
        if not isinstance(manifest.get("frames"), dict):
            raise ValueError("invalid existing frame map")
    else:
        manifest = {"schemaVersion": 1, "format": "wil-classic", **source_meta,
                    "rawIndexEntries": lib.raw_offset_count,
                    "discardedTrailingOffsets": lib.discarded_trailing_offsets,
                    "frames": {}, "empty": [], "missing": [],
                    "profile": "national-2003-gameplay"}
    # Decode and validate the entire requested range before any --apply writes.
    decoded, frames, issues = {}, [], []
    for number in INDICES:
        frame = lib.frame(number)
        if frame is None:
            raise ValueError(f"required native sword source frame is empty: {number}")
        png = png_rgba(frame["width"], frame["height"], frame["pixels"])
        digest = sha256(png)
        expected = {key: frame[key] for key in ("index", "width", "height", "offsetX", "offsetY")}
        expected.update(file=f"{number}.{digest[:16]}.png", sha256=digest)
        if any(contract["frames"][str(number)].get(key) != expected[key] for key in FIELDS):
            raise ValueError(f"contract differs from original decoded frame: {number}")
        present = manifest["frames"].get(str(number))
        output = destination / expected["file"]
        same_meta = isinstance(present, dict) and all(present.get(key) == expected[key] for key in FIELDS)
        same_png = output.is_file() and output.read_bytes() == png
        reasons = []
        if not same_meta:
            reasons.append("missing_or_changed_metadata")
        if not same_png:
            reasons.append("missing_or_changed_png")
        if reasons:
            issues.append({"index": number, "reasons": reasons})
        decoded[number] = (expected, png)
        frames.append({**expected, "rgbaSha256": sha256(frame["pixels"]),
                       "byteEqual": same_png, "geometryEqual": same_meta})
    repaired = []
    if apply and issues:
        combined = dict(manifest["frames"])
        for issue in issues:
            number = issue["index"]
            entry, png = decoded[number]
            atomic_write(destination / entry["file"], png)
            combined[str(number)] = entry
            repaired.append(number)
        manifest["frames"] = combined
        for field in ("empty", "missing"):
            manifest[field] = [i for i in manifest.get(field, []) if i not in repaired]
        atomic_json(manifest_path, manifest)
        for item in frames:
            number = item["index"]
            expected, png = decoded[number]
            item["byteEqualBeforeApply"] = item["byteEqual"]
            item["geometryEqualBeforeApply"] = item["geometryEqual"]
            item["byteEqual"] = (destination / expected["file"]).read_bytes() == png
            item["geometryEqual"] = all(manifest["frames"][str(number)].get(key) == expected[key] for key in FIELDS)
    complete = all(item["byteEqual"] and item["geometryEqual"] for item in frames)
    return {"schemaVersion": 1, "mode": "apply" if apply else "check",
            "recordedAt": datetime.now(timezone.utc).isoformat(),
            "environment": "local Python WeMadeLibrary direct original WIL/WIX decode; no network/browser/original executable",
            "scope": "native_pixels only: exact source pair, 192 source indices, signed geometry and PNG/alpha bytes; reference action mapping separate; no GPU/screen quantization or audio runtime conclusion",
            "source": {**source_meta, "path": str(source.resolve()), "indexPath": str(index.resolve())},
            "requested": len(INDICES), "matched": len(INDICES) - len(issues),
            "repaired": len(repaired), "repairedIndices": repaired,
            "issuesBeforeApply": issues, "frames": frames,
            "complete": complete}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=Path("C:/Program Files (x86)/shanda/Legend of Mir/Data"))
    parser.add_argument("--output", type=Path, default=ROOT / "assets/web/effects/Magic")
    parser.add_argument("--contract", type=Path, default=ROOT / "content/classic-176/melee-visual.json")
    parser.add_argument("--report", type=Path)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    contract = json.loads(args.contract.read_text(encoding="utf-8"))
    report = inspect(args.data_dir, args.output, contract, apply=args.apply)
    report["contractSha256"] = sha256(args.contract.read_bytes())
    report["scriptSha256"] = sha256(Path(__file__).read_bytes())
    if args.report:
        atomic_json(args.report, report)
    print(json.dumps({key: value for key, value in report.items() if key != "frames"}, ensure_ascii=False))
    return 0 if report["complete"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
