import json
import unittest
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from skill_catalog_audit import audit
from skill_visual_audit import audit as audit_visuals


class SkillCatalogTests(unittest.TestCase):
    def test_classic_skill_allow_list_has_unique_runtime_records(self):
        report = audit()
        self.assertTrue(report["ok"], report)
        self.assertEqual(report["expected"], 15)
        self.assertEqual([entry["name"] for entry in report["skills"]], json.loads(
            (ROOT / "content/classic-176/version-profile.json").read_text(encoding="utf-8")
        )["p0Baseline"]["skills"])
        self.assertEqual(len({entry["magicId"] for entry in report["skills"]}), 15)
        self.assertEqual(report["ruleFile"], "skill-rules.json")
        self.assertEqual(report["ruleMismatches"], {})
        self.assertEqual(report["skills"][0]["needLevels"], [7, 11, 16])
        self.assertEqual(report["skills"][0]["trainLevels"], [200, 300, 500])

    def test_core_skill_ids_have_explicit_visual_routes(self):
        source = (ROOT / "apps/web/src/magic-effects.ts").read_text()
        rules = json.loads((ROOT / "content/classic-176/skill-rules.json").read_text(encoding="utf-8"))["skills"]
        for rule in rules.values():
            magic_id = rule["magicId"]
            self.assertIn(f"{magic_id}:", source, f"missing visual route for magic {magic_id}")
        for passive_id in (3, 7, 12, 25, 26):
            self.assertIn(f"{passive_id}:null", source.replace(" ", ""))

    def test_core_skill_visual_routes_match_effect_asset_ranges(self):
        report = audit_visuals()
        self.assertTrue(report["ok"], report)
        self.assertEqual(report["expected"], 15)
        self.assertEqual(report["passiveMagicIds"], [3, 7, 12, 25, 26])


if __name__ == "__main__":
    unittest.main()
