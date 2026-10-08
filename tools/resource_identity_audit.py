#!/usr/bin/env python3
"""Read-only SQL/database and optional candidate icon diagnostics; never import data."""

from __future__ import annotations

import argparse
import ast
import importlib.util
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]


def load(name: str):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(name + ".py"))
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def read_database(mysql: Path, options: Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    # Credentials are read only by mysql.  The defaults option must be first;
    # do not copy the option file or relay stderr (which may contain auth data).
    prefix = [str(mysql), "--defaults-extra-file=" + str(options.resolve()), "--batch", "--raw", "--default-character-set=utf8mb4"]
    result = []
    for table, fields, keys in (
        ("stditems", "Id,Name,StdMode,Shape,ImgIndex", ("id", "name", "stdMode", "shape", "imgIndex")),
        ("magics", "Idx,MagID,MagName,EffectType,Effect", ("idx", "magicId", "name", "effectType", "effect")),
    ):
        output = subprocess.run(prefix + ["-e", f"SELECT {fields} FROM mir2_data.{table} ORDER BY {fields.split(',')[0]};"],
                                capture_output=True, encoding="utf-8", check=False)
        if output.returncode:
            raise RuntimeError(f"read-only {table} query failed with exit code {output.returncode}")
        rows = []
        for line in output.stdout.splitlines()[1:]:
            values = line.split("\t")
            if len(values) != len(keys):
                raise ValueError(f"unexpected {table} read-only result shape")
            rows.append({key: value if key == "name" else int(value) for key, value in zip(keys, values)})
        result.append(rows)
    return result[0], result[1]


def compare_rows(expected: list[dict[str, Any]], actual: list[dict[str, Any]], key: str, fields: tuple[str, ...]) -> dict[str, Any]:
    left, right = {row[key]: row for row in expected}, {row[key]: row for row in actual}
    return {"missing": [left[number] for number in sorted(left.keys() - right.keys())],
            "additional": [right[number] for number in sorted(right.keys() - left.keys())],
            "different": [{key: number, "sql": {field: left[number][field] for field in fields},
                           "database": {field: right[number][field] for field in fields}}
                          for number in sorted(left.keys() & right.keys())
                          if any(left[number][field] != right[number][field] for field in fields)]}


def runtime_origin(row: dict[str, Any], root: Path) -> dict[str, Any]:
    path = root / "scripts/install-playtest-home-stone.py"
    if path.is_file():
        constants = {}
        for node in ast.parse(path.read_text(encoding="utf-8")).body:
            if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name) and isinstance(node.value, ast.Constant):
                constants[node.targets[0].id] = node.value.value
        if row.get("id") == constants.get("STONE_ID") and row.get("name") == constants.get("STONE_NAME") and (
                row.get("stdMode"), row.get("shape"), row.get("imgIndex")) == (3, 3, 402):
            return {"classification": "declared_runtime_extension", "path": path.relative_to(root).as_posix(),
                    "sha256": load("resource_sources").sha256(path),
                    "scope": "Source declaration and current database fields agree; prior execution and active version identity are not established."}
    return {"classification": "unknown", "scope": "Additional runtime row absent from the generated SQL; origin not established."}


def candidate_coverage(directory: Path, catalog: dict[str, Any], root: Path) -> list[dict[str, Any]]:
    sources = load("resource_sources")
    crystal = load("crystal_lib")
    locked = json.loads((root / "content/classic-176/asset-sources.json").read_text(encoding="utf-8"))
    locks = [value for values in locked.values() if isinstance(values, list) for value in values if isinstance(value, dict) and "file" in value]
    results = []
    for filename in ("Items.Lib", "dnitems.Lib", "Stateitem.Lib"):
        paths = [path for path in directory.glob("*") if path.name.casefold() == filename.casefold() and path.is_file()]
        if len(paths) != 1:
            results.append({"file": filename, "missingReason": "source_missing" if not paths else "ambiguous_source", "selected": False})
            continue
        path = paths[0]
        digest = sources.sha256(path)
        matches = [value for value in locks if value["file"].casefold() == filename.casefold() and value.get("sha256") == digest and value.get("bytes") == path.stat().st_size]
        entry = {"file": filename, "path": str(path), "bytes": path.stat().st_size, "sha256": digest,
                 "sourceRole": "reference_candidate" if matches else "unknown", "selected": False,
                 "versionConsistency": "unconfirmed", "lockMatched": bool(matches),
                 "scope": "Decoded source frames only; no namespace export, native/browser comparison or extension mapping selection."}
        library = crystal.CrystalLibrary(path.read_bytes())
        entry.update(sourceFrameCount=library.count, format=f"crystal-lib-v{library.version}")
        if filename == "Items.Lib":
            rows = [row for row in catalog["items"] if not row["iconUrl"]]
            indices = sorted({row["iconIndex"] for row in rows})
            frames = []
            for index in indices:
                frame_info: dict[str, Any] = {"index": index}
                try:
                    frame = library.frame(index)
                    frame_info["status"] = "empty" if frame is None else "placeholder" if frame["width"] <= 4 or frame["height"] <= 1 else "transparent" if not any(frame["pixels"][3::4]) else "usable"
                    if frame:
                        frame_info.update({key: frame[key] for key in ("width", "height", "offsetX", "offsetY")})
                except IndexError:
                    frame_info["status"] = "out_of_range"
                except (ValueError, OSError, EOFError):
                    frame_info["status"] = "decode_error"
                frames.append(frame_info)
            usable = {value["index"] for value in frames if value["status"] == "usable"}
            entry.update(requestedMissingItems=len(rows), requestedUniqueIndices=len(indices),
                         decodableCandidateItems=sum(row["iconIndex"] in usable for row in rows),
                         activeCoverageContribution=0, frames=frames)
        results.append(entry)
    return results


def audit(catalog: dict[str, Any], items: list[dict[str, Any]], skills: list[dict[str, Any]], root: Path = ROOT) -> dict[str, Any]:
    module = load("resource_catalog")
    item_compare = compare_rows(catalog["items"], items, "id", ("name", "stdMode", "shape", "imgIndex"))
    for row in item_compare["additional"]:
        row["originEvidence"] = runtime_origin(row, root)
    skill_compare = compare_rows(catalog["skills"], skills, "idx", ("magicId", "name", "effectType", "effect"))
    conflicts, aliases = load("resource_sources").magic_identity(skills)
    return {"schemaVersion": 1, "recordedAt": datetime.now(timezone.utc).isoformat(),
            "scope": "Read-only local MySQL table identities compared with generated SQL and active icon source resolution. No credentials, accounts, imports or runtime changes.",
            "generatedSql": {"path": catalog["source"]["sql"], "sha256": catalog["source"]["sqlSha256"],
                             "items": len(catalog["items"]), "skills": len(catalog["skills"]), "magicIdentityConflicts": catalog["diagnostics"]["magicIdentityConflicts"]},
            "database": {"items": len(items), "skills": len(skills), "itemIdentityComparison": item_compare,
                         "skillIdentityComparison": skill_compare, "magicIdentityConflicts": conflicts, "effectAliases": aliases},
            "activeResources": {"summary": catalog["summary"], "missingIconReasons": catalog["diagnostics"]["missingIconReasons"],
                                "unusableOverrides": catalog["diagnostics"]["unusableOverrides"], "complete": not module.validate(catalog), "errors": module.validate(catalog)},
            "fingerprints": [{"path": str(path.relative_to(root)), "sha256": load("resource_sources").sha256(path)}
                             for relative in ("tools/resource_catalog.py", "tools/resource_sources.py", "tools/resource_identity_audit.py", "tests/test_resource_catalog.py", "tests/test_resource_sources.py", "content/classic-176/active-asset-sources.json")
                             if (path := root / relative).is_file()]}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mysql", type=Path, required=True)
    parser.add_argument("--defaults-extra-file", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--candidate-dir", type=Path)
    args = parser.parse_args()
    catalog = load("resource_catalog").build()
    items, skills = read_database(args.mysql, args.defaults_extra_file)
    report = audit(catalog, items, skills)
    if args.candidate_dir:
        report["referenceCandidates"] = candidate_coverage(args.candidate_dir, catalog, ROOT)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"complete": report["activeResources"]["complete"], "sqlItems": len(catalog["items"]), "databaseItems": len(items), "sqlSkills": len(catalog["skills"]), "databaseSkills": len(skills), "errors": report["activeResources"]["errors"], "report": str(args.report)}, ensure_ascii=False))
    return 0 if report["activeResources"]["complete"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
