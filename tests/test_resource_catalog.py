import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def load_catalog_module():
    spec = importlib.util.spec_from_file_location("resource_catalog", ROOT / "tools/resource_catalog.py")
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class ResourceCatalogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.module = load_catalog_module()
        cls.catalog = cls.module.build()

    def test_catalog_covers_authoritative_resources(self):
        summary = self.catalog["summary"]
        self.assertEqual(summary["items"], 1000)
        self.assertEqual(summary["skills"], 108)
        self.assertEqual(summary["monsters"], 705)
        self.assertEqual(summary["maps"], 570)
        self.assertGreater(summary["spawns"], 2800)
        self.assertGreater(summary["dropRows"], 7000)
        self.assertEqual(summary["itemIcons"], 796)
        self.assertEqual(summary["skillIcons"], 106)

    def test_cross_links_include_spawn_drop_and_assets(self):
        skeleton = next(value for value in self.catalog["monsters"] if value["name"] == "骷髅")
        bronze_sword = next(value for value in self.catalog["items"] if value["name"] == "青铜剑")
        lightning = next(value for value in self.catalog["skills"] if value["name"] == "雷电术")
        grave = next(value for value in self.catalog["maps"] if value["id"] == "D001")
        self.assertTrue(skeleton["spawnIds"])
        self.assertTrue(any(value["item"] == "青铜剑" for value in skeleton["drops"]))
        self.assertIn("骷髅", bronze_sword["droppedBy"])
        self.assertEqual(lightning["use"], "hostile")
        self.assertEqual(grave["minimapFrame"], 0)

    def test_extended_asset_fallbacks_and_skill_id_health(self):
        extended_fallback = next(value for value in self.catalog["items"] if value["name"] == "雷霆战甲(男)")
        named_variant = next(value for value in self.catalog["items"] if value["name"] == "祖玛井中月")
        decoder_artifact = next(value for value in self.catalog["items"] if value["name"] == "狂雷战甲(男)")
        extended_book = next(value for value in self.catalog["items"] if value["name"] == "白日门雷电术")
        extended_potion = next(value for value in self.catalog["items"] if value["name"] == "金创药(特量)")
        group_poison = next(value for value in self.catalog["skills"] if value["name"] == "群体施毒术")
        self.assertIn("/items/Items/", extended_fallback["iconUrl"])
        self.assertEqual(named_variant["iconIndex"], 48)
        self.assertIn("/ui-national/items/", named_variant["iconUrl"])
        self.assertEqual(extended_book["iconIndex"], 0)
        self.assertEqual(extended_potion["iconIndex"], 813)
        self.assertIsNone(decoder_artifact["iconUrl"])
        self.assertEqual(group_poison["magicId"], 104)
        self.assertEqual(group_poison["iconIndex"], 38)
        self.assertEqual(self.catalog["diagnostics"]["duplicateMagicIds"], [])
        self.assertEqual(len(self.catalog["diagnostics"]["magicIdAliases"]), 12)

    def test_catalog_validation_and_templates(self):
        self.assertEqual(self.module.validate(self.catalog), [])
        next_item_id = max(value["id"] for value in self.catalog["items"]) + 1
        next_skill_idx = max(value["idx"] for value in self.catalog["skills"]) + 1
        next_magic_id = max(value["magicId"] for value in self.catalog["skills"]) + 1
        self.assertIn(f"INSERT INTO `stditems` VALUES ({next_item_id}, '新武器'", self.module.sql_template("item", "新武器"))
        self.assertIn(f"INSERT INTO `magics` VALUES ({next_skill_idx}, {next_magic_id}, '新技能'", self.module.sql_template("skill", "新技能"))


if __name__ == "__main__":
    unittest.main()
