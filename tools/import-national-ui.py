#!/usr/bin/env python3
"""Import a local 2003 national-client UI set into browser PNG manifests."""
import argparse
import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
PROFILE = ROOT / "content/classic-176/national-ui-profile.json"
sys.path.insert(0, str(ROOT / "tools"))
from wil_lib import WeMadeFormatError, export


def index_files(data_dir):
    result = {}
    for path in data_dir.rglob("*"):
        if path.is_file():
            result.setdefault(path.name.casefold(), []).append(path)
    return result


def choose_variant(family, files):
    for variant in family["variants"]:
        candidates = [files.get(name.casefold(), []) for name in variant]
        if all(candidates):
            return [paths[0] for paths in candidates]
    return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, required=True, help="local client's Data directory")
    parser.add_argument("--output", type=Path, default=ROOT / "assets/web/ui-national", help="isolated output directory")
    parser.add_argument("--family", action="append", help="import only this family id; repeatable")
    parser.add_argument("--json", type=Path, help="also write an import report")
    args = parser.parse_args()
    if not args.data_dir.is_dir():
        parser.error(f"data directory does not exist: {args.data_dir}")
    profile = json.loads(PROFILE.read_text())
    families = profile["sourceContract"]["families"]
    selected = set(args.family or [family["id"] for family in families])
    known = {family["id"] for family in families}
    unknown = selected - known
    if unknown:
        parser.error(f"unknown family: {', '.join(sorted(unknown))}")
    files = index_files(args.data_dir)
    report = {"profile": profile["id"], "dataDir": str(args.data_dir), "output": str(args.output), "families": [], "ok": True}
    for family in families:
        if family["id"] not in selected:
            continue
        match = choose_variant(family, files)
        entry = {"id": family["id"], "label": family["label"]}
        if match is None:
            entry["status"] = "missing-or-unsupported"
            report["ok"] = False
        elif match[0].suffix.casefold() == ".pak":
            entry["status"] = "pak-requires-engine-specific-decoder"
            entry["files"] = [path.name for path in match]
            report["ok"] = False
        else:
            try:
                destination = args.output / family["id"]
                manifest = export(match[0], destination, index=match[1])
                entry.update(status="imported", files=[path.name for path in match], frames=len(manifest["frames"]), empty=len(manifest["empty"]), missing=len(manifest["missing"]))
            except (OSError, ValueError, WeMadeFormatError) as error:
                entry.update(status="decode-failed", error=str(error))
                report["ok"] = False
        report["families"].append(entry)
        print(json.dumps(entry, ensure_ascii=False))
    report["status"] = "imported" if report["ok"] else "blocked"
    payload = json.dumps(report, ensure_ascii=False, indent=2)
    print(payload)
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(payload + "\n")
    return 0 if report["ok"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
