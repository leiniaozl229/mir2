#!/usr/bin/env python3
"""Audit the classic-1.76 skill allow-list against the runtime SQL catalog."""
from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROFILE = ROOT / "content/classic-176/version-profile.json"
SQL = ROOT / ".runtime/sql/02-mir2_data.sql"
INSERT = re.compile(r"INSERT INTO `magics` VALUES \(([^;]+)\);")


def parse_records(sql: str) -> list[dict]:
    records = []
    for match in INSERT.finditer(sql):
        values = next(csv.reader([match.group(1)], skipinitialspace=True))
        if len(values) != 20:
            continue
        values = [value.strip().strip("'") for value in values]
        numbers = [int(value) for value in values[:2] + values[3:19]]
        records.append({
            "idx": numbers[0],
            "magicId": numbers[1],
            "name": values[2],
            "effectType": numbers[2],
            "effect": numbers[3],
            "spell": numbers[4],
            "power": numbers[5],
            "maxPower": numbers[6],
            "defSpell": numbers[7],
            "defPower": numbers[8],
            "defMaxPower": numbers[9],
            "job": numbers[10],
            "needLevels": [numbers[11], numbers[13], numbers[15]],
            "trainLevels": [numbers[12], numbers[14], numbers[16]],
            "delay": numbers[17],
            "description": values[19],
        })
    return records


def audit(profile_path: Path = PROFILE, sql_path: Path = SQL) -> dict:
    profile = json.loads(profile_path.read_text(encoding="utf-8"))
    expected = list(profile["p0Baseline"]["skills"])
    records = parse_records(sql_path.read_text(encoding="utf-8"))
    by_name: dict[str, list[int]] = {}
    for record in records:
        by_name.setdefault(record["name"], []).append(record["magicId"])
    missing = [name for name in expected if name not in by_name]
    duplicate_names = {name: ids for name, ids in by_name.items() if name in expected and len(ids) != 1}
    ids = [by_name[name][0] for name in expected if name in by_name and len(by_name[name]) == 1]
    duplicate_ids = sorted(index for index in ids if ids.count(index) > 1)
    by_skill = {record["name"]: record for record in records if record["name"] in expected}
    rules_file = profile.get("skillRulesFile")
    expected_rules = {}
    if rules_file:
        expected_rules = json.loads((profile_path.parent / rules_file).read_text(encoding="utf-8")).get("skills", {})
    rule_fields = (
        "magicId", "effectType", "effect", "spell", "power", "maxPower", "defSpell", "defPower",
        "defMaxPower", "job", "needLevels", "trainLevels", "delay", "description"
    )
    rule_mismatches = {}
    for name in expected:
        actual = by_skill.get(name)
        expected_rule = expected_rules.get(name)
        if actual is None or expected_rule is None:
            continue
        mismatch = {
            field: {"expected": expected_rule.get(field), "actual": actual.get(field)}
            for field in rule_fields
            if expected_rule.get(field) != actual.get(field)
        }
        if mismatch:
            rule_mismatches[name] = mismatch
    return {
        "ok": not missing and not duplicate_names and not duplicate_ids and not rule_mismatches,
        "expected": len(expected),
        "records": len(records),
        "missing": missing,
        "duplicateNames": duplicate_names,
        "duplicateIds": duplicate_ids,
        "ruleFile": rules_file,
        "ruleMismatches": rule_mismatches,
        "skills": [
            {"name": name, "magicId": by_name[name][0], **({field: by_skill[name][field] for field in rule_fields} if name in by_skill else {})}
            for name in expected if name in by_name
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", type=Path, default=PROFILE)
    parser.add_argument("--sql", type=Path, default=SQL)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = audit(args.profile, args.sql)
    payload = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload, encoding="utf-8")
    print(payload, end="")
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
