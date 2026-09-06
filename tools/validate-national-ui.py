#!/usr/bin/env python3
"""Check that a local 2003 national-client UI asset set is complete.

The checker is intentionally format-agnostic. It validates the WIL/WIX,
WZL/WZX, or single-PAK file contract before a decoder is selected for the
particular client build.
"""
import argparse
import json
from pathlib import Path
import sys
from typing import Optional


ROOT = Path(__file__).resolve().parents[1]
PROFILE_PATH = ROOT / "content/classic-176/national-ui-profile.json"


def file_index(data_dir: Path):
    index = {}
    for path in data_dir.rglob("*"):
        if path.is_file():
            index.setdefault(path.name.casefold(), []).append(str(path.relative_to(data_dir)))
    return index


def validate(data_dir: Optional[Path]):
    profile = json.loads(PROFILE_PATH.read_text())
    families = profile["sourceContract"]["families"]
    report = {
        "profile": profile["id"],
        "label": profile["label"],
        "dataDir": str(data_dir) if data_dir else None,
        "families": [],
        "ok": False,
    }
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
    report["status"] = "ready-for-decoder" if report["ok"] else "blocked-missing-reference-assets"
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, help="local client's Data directory")
    parser.add_argument("--json", type=Path, help="also write the JSON report to this path")
    args = parser.parse_args()
    report = validate(args.data_dir)
    payload = json.dumps(report, ensure_ascii=False, indent=2)
    print(payload)
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(payload + "\n")
    return 0 if report["ok"] else 2


if __name__ == "__main__":
    sys.exit(main())
