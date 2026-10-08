#!/usr/bin/env python3
"""Export gameplay pixels and sounds from a local national-client installation.

No downloaded substitute libraries are used. Source indices, signed image
offsets, palette transparency and source hashes survive the conversion.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from wil_lib import export


def sources():
    result = [("Hum", "actors", "NHum"), ("Hair", "actors", "NHair"),
              ("Weapon", "actors", "NWeapon"), ("npc", "actors", "NPC00")]
    result += [(f"Mon{i}", "actors", f"Mon{i}") for i in range(1, 19)]
    result += [(name, "effects", name) for name in ("Magic", "Magic2", "Effect")]
    result += [(name, "items", name) for name in ("Items", "DnItems", "stateitem")]
    return result


def validate_source_pair(source, index, expected):
    for path, key in ((source, "sourceSha256"), (index, "indexSha256")):
        actual = hashlib.sha256(path.read_bytes()).hexdigest()
        if actual != expected[key]:
            raise ValueError(f"source version mismatch: {path.name}; expected {expected[key]}, got {actual}")


def import_family(source, destination, category, contract):
    manifest = export(source, destination)
    manifest["profile"] = contract["id"]
    if category == "actors":
        if source.stem.casefold() in ("hum", "hair", "weapon"):
            manifest["actions"] = contract["player"]["actions"]
        elif source.stem.casefold().startswith("mon"):
            manifest["actionsByRace"] = contract["monster"]["raceActions"]
    (destination / "library.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"source": source.name, "category": category, "library": destination.name,
            "sourceSha256": manifest["sourceSha256"],
            "indexSha256": manifest["indexSha256"],
            "frames": len(manifest["frames"]), "empty": len(manifest["empty"])}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--client-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=ROOT / "assets/web")
    parser.add_argument("--family", action="append", help="source WIL stem; repeatable")
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    contract = json.loads((ROOT / "content/classic-176/national-gameplay.json").read_text(encoding="utf-8"))
    files = {p.name.casefold(): p for p in (args.client_dir / "Data").iterdir() if p.is_file()}
    requested = {name.casefold() for name in args.family or []}
    known = {name.casefold() for name, _, _ in sources()}
    if requested - known:
        parser.error(f"unknown families: {sorted(requested - known)}")
    selected = [entry for entry in sources() if not requested or entry[0].casefold() in requested]
    # Validate the entire requested source set before writing any outputs.
    for name, _, target in selected:
        if f"{name}.wil".casefold() not in files or f"{name}.wix".casefold() not in files:
            parser.error(f"missing original WIL/WIX pair: {name}")
        try:
            validate_source_pair(files[f"{name}.wil".casefold()], files[f"{name}.wix".casefold()], contract["sourceFamilies"][target])
        except ValueError as error:
            parser.error(str(error))
    report = {"profile": contract["id"], "families": [], "audio": []}
    for name, category, target in selected:
        entry = import_family(files[f"{name}.wil".casefold()], args.output / category / target, category, contract)
        report["families"].append(entry)
        print(f"{target}: {entry['frames']} frames, {entry['empty']} empty", flush=True)
    if not requested:
        audio_dir = args.output / "audio"
        audio_dir.mkdir(parents=True, exist_ok=True)
        for source in sorted((args.client_dir / "Wav").glob("*")):
            if source.is_file() and source.suffix.casefold() == ".wav":
                target = audio_dir / source.name.lower()
                shutil.copyfile(source, target)
                report["audio"].append({"file": target.name, "sha256": hashlib.sha256(source.read_bytes()).hexdigest()})
        (audio_dir / "manifest.json").write_text(json.dumps(report["audio"], indent=2) + "\n", encoding="utf-8")
        print(f"audio: {len(report['audio'])} original clips", flush=True)
    report_path = args.report or args.output / "national-gameplay-import.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
