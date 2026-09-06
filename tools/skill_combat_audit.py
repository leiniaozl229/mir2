#!/usr/bin/env python3
"""Audit combat targeting metadata against the pinned classic skill catalogue."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PROFILE = ROOT / "content/classic-176/version-profile.json"
RULES = ROOT / "content/classic-176/skill-rules.json"
COMBAT = ROOT / "content/classic-176/skill-combat.json"
SKILLS_TS = ROOT / "apps/web/src/skills.ts"
TRAINER = ROOT / "content/classic-176/p0/skill-trainer.txt"

USES = {"hostile", "self", "toggle", "charge", "passive"}
JOBS = {"warrior": 0, "wizard": 1, "taoist": 2}


def parse_skill_use(source: str) -> dict[int, str]:
    match = re.search(r"export const skillUse:Record<number,SkillUse>=\{([^}]+)\}", source)
    if not match:
        return {}
    return {int(magic_id): use for magic_id, use in re.findall(r"(\d+):'([a-z]+)'", match.group(1))}


def trainer_level(text: str, section: str) -> int | None:
    block = re.search(rf"\[@{section}\](.*?)(?=\n\[@|\Z)", text, re.S)
    if not block:
        return None
    found = re.search(r"CHANGELEVEL\s*=\s*(\d+)", block.group(1))
    return int(found.group(1)) if found else None


def audit() -> dict[str, object]:
    profile = json.loads(PROFILE.read_text(encoding="utf-8"))
    rules = json.loads(RULES.read_text(encoding="utf-8"))["skills"]
    combat = json.loads(COMBAT.read_text(encoding="utf-8"))
    expected = list(profile["p0Baseline"]["skills"])
    skills = combat.get("skills", {})
    missing = [name for name in expected if name not in skills]
    extra = [name for name in skills if name not in expected]
    mismatches: dict[str, object] = {}
    routes = parse_skill_use(SKILLS_TS.read_text(encoding="utf-8"))
    route_missing: list[str] = []
    for name in expected:
        rule = rules.get(name, {})
        spec = skills.get(name, {})
        if spec.get("use") not in USES:
            mismatches.setdefault(name, {})["use"] = spec.get("use")
        job = spec.get("job")
        if JOBS.get(job) != rule.get("job"):
            mismatches.setdefault(name, {})["job"] = {"expected": rule.get("job"), "actual": job}
        magic_id = rule.get("magicId")
        if magic_id is None:
            continue
        if routes.get(magic_id) != spec.get("use"):
            route_missing.append(f"{name}({magic_id}) ts={routes.get(magic_id)} spec={spec.get('use')}")

    trainer = TRAINER.read_text(encoding="utf-8")
    kit_levels = {
        "warrior": trainer_level(trainer, "warriorset"),
        "wizard": trainer_level(trainer, "wizardset"),
        "taoist": trainer_level(trainer, "taoistset"),
    }
    level_short: list[str] = []
    for name, spec in skills.items():
        need = (rules.get(name) or {}).get("needLevels") or [0]
        required = need[0]
        actual = kit_levels.get(spec.get("job"))
        if actual is None or actual < required:
            level_short.append(f"{name} needs {required}, trainer {spec.get('job')}={actual}")

    summon = combat.get("summon") or {}
    reagents_ok = "GIVE 护身符 1" in trainer and "GIVE 灰色药粉(少量) 1" in trainer
    return {
        "ok": not missing and not extra and not mismatches and not route_missing and not level_short and reagents_ok
        and summon.get("name") == "变异骷髅" and summon.get("nameColor") == 254,
        "expected": len(expected),
        "missing": missing,
        "extra": extra,
        "mismatches": mismatches,
        "clientRoutes": route_missing,
        "trainerLevels": kit_levels,
        "trainerLevelShortfalls": level_short,
        "reagents": reagents_ok,
        "summon": summon,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", type=Path, help="write the report to this path")
    args = parser.parse_args()
    report = audit()
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
