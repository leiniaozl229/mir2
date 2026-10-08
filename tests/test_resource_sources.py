import copy
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "tools" / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ResourceSourceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.module = load("resource_sources")
        cls.catalog = load("resource_catalog")

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.web = self.root / "assets/web"
        self.data = self.root / "native"
        self.data.mkdir()
        (self.data / "Items.wil").write_bytes(b"national source")
        (self.data / "Items.wix").write_bytes(b"national index")
        self.entry = {"id": "national:Items", "role": "active_required", "version": "national-test", "provenance": "native_pixels",
                      "namespace": "/ui-national/items", "category": "item", "kind": "library",
                      "sourceFiles": [{"root": "national", "path": name, "purpose": purpose, "bytes": (self.data / name).stat().st_size,
                                       "sha256": self.module.sha256(self.data / name)} for name, purpose in (("Items.wil", "data"), ("Items.wix", "index"))],
                      "library": {"manifests": ["assets/web/ui-national/items/library.json"], "sourceFrameCount": 2}}
        self.contract = {"schemaVersion": 1, "roots": {"national": str(self.data)}, "assets": [self.entry]}
        self.manifest = {"source": "Items.wil", "sourceSha256": self.entry["sourceFiles"][0]["sha256"], "indexSha256": self.entry["sourceFiles"][1]["sha256"],
                         "sourceFrameCount": 2, "frames": {"0": {"file": "0.png", "width": 32, "height": 24}, "1": {"file": "1.png", "width": 1, "height": 1}}}
        self.write_manifest("ui-national/items", self.manifest)

    def write_manifest(self, namespace, manifest):
        directory = self.web / namespace
        directory.mkdir(parents=True, exist_ok=True)
        for frame in manifest["frames"].values():
            path = directory / frame["file"]
            if path.parent == directory:
                path.write_bytes(b"export fixture; pixel fidelity outside this helper")
        (directory / "library.json").write_text(json.dumps(manifest), encoding="utf-8")

    def resolver(self):
        return self.module.ResourceSources(self.root, self.web, self.contract)

    def test_source_lock_and_manifest_identity_both_required(self):
        value = self.resolver().resolve("ui-national/items", 0)
        self.assertTrue(value["available"])
        self.assertEqual(value["sourceId"], "national:Items")
        self.assertEqual(value["url"], "/ui-national/items/0.png")
        self.manifest["indexSha256"] = "wrong index"
        self.write_manifest("ui-national/items", self.manifest)
        self.assertEqual(self.resolver().resolve("ui-national/items", 0)["missingReason"], "source_hash_mismatch")

    def test_existing_same_named_unregistered_library_stays_unknown(self):
        self.write_manifest("items/Items", self.manifest)
        value = self.resolver().resolve("items/Items", 0)
        self.assertFalse(value["available"])
        self.assertEqual(value["sourceRole"], "unknown")
        self.assertEqual(value["missingReason"], "unknown_source")

    def test_missing_and_changed_original_file_cannot_satisfy_active(self):
        (self.data / "Items.wil").unlink()
        self.assertEqual(self.resolver().resolve("ui-national/items", 0)["missingReason"], "source_missing")
        (self.data / "Items.wil").write_bytes(b"different bytes")
        self.assertEqual(self.resolver().resolve("ui-national/items", 0)["missingReason"], "source_hash_mismatch")

    def test_range_placeholder_and_missing_export_are_distinct(self):
        resolver = self.resolver()
        self.assertEqual(resolver.resolve("ui-national/items", 2)["missingReason"], "frame_out_of_range")
        self.assertEqual(resolver.resolve("ui-national/items", -1)["missingReason"], "frame_out_of_range")
        self.assertEqual(resolver.resolve("ui-national/items", 1)["missingReason"], "frame_empty_placeholder")
        (self.web / "ui-national/items/0.png").unlink()
        self.assertEqual(resolver.resolve("ui-national/items", 0)["missingReason"], "asset_missing")

    def test_source_frame_count_is_not_inferred_from_exports(self):
        self.manifest["sourceFrameCount"] = 3
        self.write_manifest("ui-national/items", self.manifest)
        self.assertEqual(self.resolver().resolve("ui-national/items", 0)["missingReason"], "source_frame_count_mismatch")

    def test_registered_same_source_alias_remains_active_not_extension(self):
        alias = copy.deepcopy(self.entry)
        alias.update(id="national:alias", namespace="/items/Items")
        alias["library"]["manifests"] = ["assets/web/items/Items/library.json"]
        self.contract["assets"].append(alias)
        self.write_manifest("items/Items", self.manifest)
        value = self.resolver().resolve("items/Items", 0)
        self.assertEqual(value["sourceRole"], "active_required")
        self.assertEqual(value["sourceVersion"], "national-test")

    def test_candidate_usable_frame_never_closes_active_coverage(self):
        candidate = copy.deepcopy(self.entry)
        candidate.update(id="candidate:Items", role="reference_candidate", version="candidate-version", namespace="/items/Items")
        candidate["library"]["manifests"] = ["assets/web/items/Items/library.json"]
        self.contract["assets"].append(candidate)
        self.write_manifest("items/Items", self.manifest)
        # Active national pixel is now unusable, but the candidate pixel exists.
        self.manifest["frames"]["0"]["width"] = 1
        self.write_manifest("ui-national/items", self.manifest)
        value = self.catalog.resolve_icon(self.resolver(), ("ui-national/items", "items/Items"), 0, "item")
        self.assertIsNone(value["url"])
        self.assertEqual(value["missingReason"], "frame_empty_placeholder")
        self.assertTrue(value["attempts"][1]["available"])
        self.assertEqual(value["attempts"][1]["sourceRole"], "reference_candidate")
        self.assertFalse(value["candidates"][0]["selected"])

    def test_path_escape_and_ambiguous_identity_fail_closed(self):
        self.manifest["frames"]["0"]["file"] = "../outside.png"
        self.write_manifest("ui-national/items", self.manifest)
        self.assertEqual(self.resolver().resolve("ui-national/items", 0)["missingReason"], "asset_missing")
        duplicate = copy.deepcopy(self.entry)
        duplicate["id"] = "another-version"
        self.contract["assets"].append(duplicate)
        self.assertEqual(self.resolver().resolve("ui-national/items", 0)["missingReason"], "ambiguous_source")

    def test_skill_identity_is_not_icon_identity(self):
        skills = [{"idx": 38, "magicId": 48, "name": "群体施毒术", "effectType": 2, "effect": 27, "iconIndex": 38},
                  {"idx": 48, "magicId": 48, "name": "气功波", "effectType": 7, "effect": 36, "iconIndex": 48}]
        conflicts, aliases = self.module.magic_identity(skills)
        self.assertEqual([value["magicId"] for value in conflicts], [48])
        self.assertFalse(aliases)
        skills[1].update(effectType=2, effect=27)
        conflicts, aliases = self.module.magic_identity(skills)
        self.assertFalse(conflicts)
        self.assertEqual(aliases[0]["scope"], "same_effect_type_and_effect_only")


if __name__ == "__main__":
    unittest.main()
