import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def load_audit():
    spec = importlib.util.spec_from_file_location("content_audit", ROOT / "tools/content_audit.py")
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class ContentAuditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.module = load_audit()
        cls.report = cls.module.audit()

    def test_current_audit_preserves_real_unresolved_coverage(self):
        report = self.report
        profile = json.loads((ROOT / "content/classic-176/version-profile.json").read_text(encoding="utf-8"))
        self.assertEqual(report["maps"]["expected"], len(profile["p0Baseline"]["maps"]))
        self.assertEqual(report["maps"]["expected"], 572)
        self.assertEqual(report["maps"]["exported"], 572)
        extensions = json.loads((ROOT / "content/classic-176/map-server-extensions.json").read_text(encoding="utf-8"))
        for identifier in ("D718", "D719"):
            data = json.loads((ROOT / "assets/web/maps" / identifier / "map.json").read_text(encoding="utf-8"))
            self.assertEqual(data["provenance"]["classification"], "server-extension")
            self.assertFalse(data["provenance"]["originalClientMapPresent"])
            self.assertFalse(data["provenance"]["generatedRoute"]["historicalConfigurationVerified"])
            source = next(row for row in extensions["maps"] if row["id"] == identifier)
            self.assertEqual(data["sourceSha256"], source["source"]["sha256"])
        # This is a diagnostic integration check, not a declaration that the
        # resource set is closed. The CLI remains nonzero for actual gaps.
        self.assertFalse(report["complete"], report["failures"])
        self.assertFalse(report["ok"])
        self.assertTrue(report["failures"]["mapDependencies"])
        self.assertTrue(report["failures"]["resourceCoverage"])
        self.assertEqual(len(report["maps"]["dependencyMissing"]["GA0"]["Tiles"]), 408)
        self.assertGreater(len(report["resourceCoverage"]["missingItemIcons"]), 0)
        self.assertGreater(len(report["resourceCoverage"]["missingSkillIcons"]), 0)
        self.assertIn(48, report["resourceCoverage"]["duplicateMagicIds"])
        self.assertEqual(report["failures"]["sourceLocks"], [])
        self.assertEqual(report["activeSources"]["contractErrors"], [])
        self.assertEqual(len(report["referenceCandidates"]), 68)
        active = json.loads((ROOT / "content/classic-176/active-asset-sources.json").read_text(encoding="utf-8"))
        map_assets = [row for row in active["assets"] if row["role"] == "active_required" and row["category"] == "map"]
        self.assertEqual({Path(row["sourceFiles"][0]["path"]).stem for row in map_assets},
                         {"Tiles", "SmTiles", "Objects", *{f"Objects{i}" for i in range(2, 8)}})
        expected_sources = sum(len(row["sourceFiles"]) for row in map_assets)
        self.assertEqual(report["sourceLocks"]["map"]["expected"], expected_sources)
        self.assertEqual(report["sourceLocks"]["map"]["locked"], expected_sources)
        self.assertTrue(all(row["lockOk"] for row in report["sourceLocks"]["map"]["entries"]))
        cursors = [row for row in report["activeSources"]["entries"] if row["category"] == "cursor"]
        self.assertEqual(len(cursors), 7)
        self.assertTrue(all(row["ok"] and row["provenance"] == "reference_source" for row in cursors))
        self.assertEqual(report["routes"]["missingDestinations"], [])
        self.assertEqual(report["routes"]["unknownDestinations"], [])
        self.assertTrue(report["sabuk"]["ok"], report["sabuk"])
        self.assertGreaterEqual(report["quests"]["sourceEntries"], 1)
        self.assertEqual(report["catalog"]["monsters"]["missing"], [])
        self.assertEqual(report["catalog"]["items"]["missing"], [])
        self.assertTrue(report["worldCatalog"]["ok"], report["worldCatalog"])
        self.assertGreaterEqual(report["worldCatalog"]["uniqueMonsters"], 200)
        self.assertGreaterEqual(report["worldCatalog"]["spawnRows"], 2000)
        self.assertEqual(report["worldCatalog"]["unexpectedSql"], [])
        self.assertEqual(report["worldCatalog"]["missingBaseline"], [])
        self.assertEqual(set(report["worldCatalog"]["knownSqlGaps"]), {"神鹰", "飞火流星", "骷髅王"})

    def test_markdown_report_mentions_declared_uncertainty(self):
        report = self.report
        rendered = self.module.markdown(report)
        self.assertIn("内容审计", rendered)
        self.assertIn("已声明待校准项", rendered)
        self.assertIn("参考客户端", rendered)
        self.assertIn("世界刷怪", rendered)
        self.assertIn("参考候选", rendered)
        self.assertIn("技能身份冲突", rendered)
        json.dumps(report, ensure_ascii=False)


if __name__ == "__main__":
    unittest.main()
