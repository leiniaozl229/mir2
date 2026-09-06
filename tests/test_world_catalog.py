import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def load_world_catalog():
    spec = importlib.util.spec_from_file_location("world_catalog_audit", ROOT / "tools/world_catalog_audit.py")
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class WorldCatalogTests(unittest.TestCase):
    def test_classic_spawn_catalog_is_trackable(self):
        module = load_world_catalog()
        report = module.audit()
        self.assertTrue(report["ok"], {"unexpectedSql": report["unexpectedSql"], "missingBaseline": report["missingBaseline"]})
        self.assertGreaterEqual(report["uniqueMonsters"], 200)
        self.assertGreaterEqual(report["spawnRows"], 2000)
        self.assertEqual(report["unexpectedSql"], [])
        self.assertEqual(report["missingBaseline"], [])
        self.assertEqual(set(report["missingSql"]), {"神鹰", "飞火流星", "骷髅王"})
        self.assertGreater(report["dropFiles"], 150)
        names = {item["name"] for item in report["monsters"]}
        for required in ("鸡", "鹿", "骷髅", "沃玛战士"):
            self.assertIn(required, names)


if __name__ == "__main__":
    unittest.main()
