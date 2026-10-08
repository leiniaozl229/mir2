import importlib.util
import json
import copy
import hashlib
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
        profile = json.loads(self.module.PROFILE.read_text(encoding="utf-8"))
        self.assertEqual({value["id"] for value in self.catalog["maps"]}, {str(value) for value in profile["p0Baseline"]["maps"]})
        self.assertGreaterEqual(summary["maps"], 570)
        self.assertGreater(summary["spawns"], 2800)
        self.assertGreater(summary["dropRows"], 7000)
        # Icon coverage is a measured subset of the full SQL target.  A change
        # in installed source is not permission to shrink that target.
        for section, icon_key, missing_key in (("items", "itemIcons", "itemsMissingIcons"), ("skills", "skillIcons", "skillsMissingIcons")):
            self.assertEqual(summary[icon_key] + self.catalog["diagnostics"][missing_key], summary[section])
            self.assertEqual(summary[icon_key], sum(bool(value["iconUrl"]) for value in self.catalog[section]))
            for value in self.catalog[section]:
                if value["iconUrl"]:
                    self.assertEqual(value["iconResolution"]["sourceRole"], "active_required")
                    self.assertTrue(value["iconResolution"]["sourceVerified"])
                else:
                    self.assertTrue(value["missingReason"])

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

    def test_extended_sources_remain_unmapped_and_overrides_are_explicit(self):
        extended_fallback = next(value for value in self.catalog["items"] if value["name"] == "雷霆战甲(男)")
        named_variant = next(value for value in self.catalog["items"] if value["name"] == "祖玛井中月")
        decoder_artifact = next(value for value in self.catalog["items"] if value["name"] == "狂雷战甲(男)")
        extended_book = next(value for value in self.catalog["items"] if value["name"] == "白日门雷电术")
        extended_potion = next(value for value in self.catalog["items"] if value["name"] == "金创药(特量)")
        self.assertIsNone(extended_fallback["iconUrl"])
        self.assertEqual(extended_fallback["missingReason"], "frame_out_of_range")
        self.assertEqual(extended_fallback["iconMapping"]["extensionStatus"], "unresolved")
        self.assertTrue(extended_fallback["iconResolution"]["candidates"])
        self.assertTrue(all(not value["selected"] for value in extended_fallback["iconResolution"]["candidates"]))
        self.assertEqual(named_variant["iconIndex"], 5123)
        self.assertIsNone(named_variant["iconUrl"])
        self.assertEqual(named_variant["iconMapping"]["proposedIndex"], 48)
        self.assertEqual(extended_book["iconIndex"], 1144)
        self.assertIsNone(extended_book["iconUrl"])
        self.assertEqual(extended_book["iconMapping"]["kind"], "server_looks")
        self.assertEqual(extended_book["iconMapping"]["proposedIndex"], 0)
        self.assertEqual(extended_book["contentVersion"], "unknown")
        self.assertEqual(extended_potion["iconIndex"], 5022)
        self.assertEqual(extended_potion["iconMapping"]["proposedIndex"], 813)
        self.assertIsNone(extended_potion["iconUrl"])
        self.assertEqual(extended_potion["missingReason"], "frame_out_of_range")
        self.assertIsNone(decoder_artifact["iconUrl"])
        self.assertEqual(decoder_artifact["missingReason"], "frame_out_of_range")
        placeholder = next(value for value in self.catalog["items"] if value["name"] == "开天")
        self.assertIsNone(placeholder["iconUrl"])
        self.assertEqual(placeholder["missingReason"], "frame_empty_placeholder")
        proposals = self.catalog["diagnostics"]["proposedMappings"]
        self.assertEqual(len(proposals), 42)
        self.assertTrue(all(not value["selected"] and value["status"] == "proposed_unselected" for value in proposals))
        self.assertEqual({value["sourceIndex"]:value["affectedRows"] for value in proposals if value["kind"] == "legacy_source_index"}, {1144:102, 1582:42})

    def test_skill_identity_conflict_is_independent_of_icon_mapping(self):
        group_poison = next(value for value in self.catalog["skills"] if value["name"] == "群体施毒术")
        push = next(value for value in self.catalog["skills"] if value["name"] == "气功波")
        self.assertEqual(group_poison["magicId"], 48)
        self.assertEqual(push["magicId"], 48)
        self.assertEqual(group_poison["iconIndex"], 54)
        self.assertEqual(group_poison["pressedIconIndex"], 55)
        self.assertEqual(group_poison["iconMapping"]["proposedIndex"], 38)
        self.assertFalse(group_poison["iconMapping"]["proposedSelected"])
        self.assertEqual(push["iconIndex"], 72)
        self.assertEqual(push["missingReason"], "frame_out_of_range")
        self.assertEqual(group_poison["identityStatus"], "conflict")
        self.assertEqual(self.catalog["diagnostics"]["duplicateMagicIds"], [48])
        conflict = self.catalog["diagnostics"]["magicIdentityConflicts"][0]
        self.assertEqual({(value["name"], value["effectType"], value["effect"]) for value in conflict["rows"]}, {("群体施毒术", 2, 27), ("气功波", 7, 36)})
        self.assertEqual(len(self.catalog["diagnostics"]["magicIdAliases"]), 12)
        self.assertTrue(all(value["scope"] == "same_effect_type_and_effect_only" for value in self.catalog["diagnostics"]["magicIdAliases"]))

    def test_catalog_validation_and_templates(self):
        errors = self.module.validate(self.catalog)
        self.assertTrue(any("items missing active-source icons" in value for value in errors))
        self.assertTrue(any("skills missing active-source icons" in value for value in errors))
        self.assertTrue(any("conflicting skill magicId 48" in value for value in errors))
        self.assertFalse(any("proposed mapping policy mismatch" in value for value in errors))
        next_item_id = max(value["id"] for value in self.catalog["items"]) + 1
        next_skill_idx = max(value["idx"] for value in self.catalog["skills"]) + 1
        next_magic_id = max(value["magicId"] for value in self.catalog["skills"]) + 1
        self.assertIn(f"INSERT INTO `stditems` VALUES ({next_item_id}, '新武器'", self.module.sql_template("item", "新武器"))
        self.assertIn(f"INSERT INTO `magics` VALUES ({next_skill_idx}, {next_magic_id}, '新技能'", self.module.sql_template("skill", "新技能"))

    def test_original_lookup_fields_and_pressed_pairs_preserve_authoritative_rows(self):
        # Original reference uses the wire Looks field, not a name, Shape or +/-1.
        wood = next(value for value in self.catalog["items"] if value["id"] == 207)
        fireball = next(value for value in self.catalog["skills"] if value["name"] == "火球术")
        healing = next(value for value in self.catalog["skills"] if value["name"] == "治愈术")
        self.assertEqual((wood["imgIndex"], wood["iconIndex"]), (30, 30))
        self.assertEqual((fireball["effect"], fireball["iconIndex"], fireball["pressedIconIndex"]), (1, 2, 3))
        self.assertEqual((healing["effect"], healing["iconIndex"], healing["pressedIconIndex"]), (2, 4, 5))
        self.assertTrue(all(value["iconIndex"] == value["imgIndex"] for value in self.catalog["items"]))
        self.assertTrue(all(value["iconIndex"] == value["effect"] * 2 and value["pressedIconIndex"] == value["iconIndex"] + 1 for value in self.catalog["skills"]))
        zero = [value for value in self.catalog["skills"] if value["effect"] == 0]
        self.assertTrue(zero)
        self.assertTrue(all(value["iconIndex"] == 0 for value in zero))
        usage = json.loads(self.module.ICON_USAGE.read_text(encoding="utf-8"))
        self.assertEqual(self.catalog["iconUsage"]["sha256"], hashlib.sha256(self.module.ICON_USAGE.read_bytes()).hexdigest())
        self.assertFalse(usage["nativeRuntimeCompared"])
        self.assertFalse(usage["browserRuntimeCompared"])

    def test_validation_rejects_silent_remapping_and_pressed_index_drift(self):
        changed = copy.deepcopy(self.catalog)
        next(value for value in changed["items"] if value["name"] == "白日门雷电术")["iconIndex"] = 0
        next(value for value in changed["skills"] if value["name"] == "火球术")["pressedIconIndex"] = 2
        errors = self.module.validate(changed)
        self.assertTrue(any("items icon violates original source rule: 白日门雷电术" in value for value in errors))
        self.assertTrue(any("skill pressed icon violates original source rule: 火球术" in value for value in errors))

    def test_current_map_selection_is_distinct_from_export_snapshot_and_national_coverage(self):
        candidate = next(value for value in self.catalog["assets"] if value["id"] == "libraries/reference-ga0/Tiles")
        self.assertEqual(candidate["sourceRole"], "reference_candidate")
        self.assertTrue(candidate["mapBindingActive"])
        self.assertFalse(candidate["exportSnapshotMapBindingActive"])
        self.assertEqual(len(candidate["mapSourceSelections"]), 1)
        selected = candidate["mapSourceSelections"][0]
        self.assertEqual((selected["mapId"], selected["layer"], selected["indexCount"]), ("GA0", "background", 408))
        self.assertTrue(selected["selected"])
        self.assertTrue(selected["manifestLocksMatch"])
        self.assertFalse(selected["historicalPairingVerified"])
        active = json.loads((ROOT / "content/classic-176/active-asset-sources.json").read_text(encoding="utf-8"))
        expected_libraries = {Path(manifest).parent.relative_to("assets/web").as_posix()
                              for asset in active["assets"] if asset["role"] == "active_required" and asset["kind"] == "library"
                              for manifest in asset["library"]["manifests"]}
        self.assertEqual({value["id"] for value in self.catalog["assets"] if value["sourceRole"] == "active_required"}, expected_libraries)
        self.assertTrue({f"libraries/Objects{i}" for i in range(2, 8)}.issubset(expected_libraries))
        self.assertEqual(next(value for value in self.catalog["maps"] if value["id"] == "GA0")["mapSourceSelections"], candidate["mapSourceSelections"])
        self.assertTrue(all(not value["mapSourceSelections"] for value in self.catalog["maps"] if value["id"] != "GA0"))
        self.assertIn("reference map historical pairing unverified: GA0/background", self.module.validate(self.catalog))

    def test_map_selection_does_not_trust_pending_or_mismatched_manifest_contracts(self):
        contract = json.loads(self.module.MAP_BINDINGS.read_text(encoding="utf-8"))
        binding = contract["bindings"][0]
        data = json.loads((ROOT / binding["candidateManifest"]["path"]).read_text(encoding="utf-8"))
        def records(value, manifest=data):
            return self.module.map_selection_records("libraries/reference-ga0/Tiles", manifest, value)
        self.assertTrue(records(contract)[0]["selected"])
        for field, value in (("status", "pending"), ("mapSourceSha256", "0" * 64),
                             ("sourceSha256", "0" * 64), ("sourceFrameCount", 31776),
                             ("mapId", "D001"), ("layer", "object"), ("indices", [10320]),
                             ("protectedNativeIndices", [10320])):
            with self.subTest(field=field):
                changed = copy.deepcopy(contract)
                changed["bindings"][0][field] = value
                self.assertFalse(records(changed)[0]["selected"])
        changed = copy.deepcopy(contract)
        changed["bindings"][0]["candidateManifest"]["sha256"] = "0" * 64
        self.assertFalse(records(changed)[0]["selected"])
        changed = copy.deepcopy(contract)
        changed["bindings"][0]["namespace"] = "/libraries/Tiles"
        self.assertEqual(records(changed), [])

    def test_invalid_enabled_binding_cannot_disappear_from_validation(self):
        contract = json.loads(self.module.MAP_BINDINGS.read_text(encoding="utf-8"))
        binding = contract["bindings"][0]
        manifest = json.loads((ROOT / binding["candidateManifest"]["path"]).read_text(encoding="utf-8"))
        contract["bindings"][0]["candidateManifest"]["sha256"] = "0" * 64
        records = self.module.map_selection_records("libraries/reference-ga0/Tiles", manifest, contract)
        self.assertFalse(records[0]["selected"])
        self.assertFalse(records[0]["manifestLocksMatch"])
        changed = copy.deepcopy(self.catalog)
        next(value for value in changed["assets"] if value["id"] == "libraries/reference-ga0/Tiles")["mapSourceSelections"] = records
        errors = self.module.validate(changed)
        self.assertIn("map selection has mismatched manifest locks: ga0-background-reference-tiles", errors)
        self.assertIn("reference map historical pairing unverified: GA0/background", errors)

    def test_pairing_boolean_cannot_upgrade_locked_reference_evidence(self):
        contract = json.loads(self.module.MAP_BINDINGS.read_text(encoding="utf-8"))
        binding = contract["bindings"][0]
        manifest = json.loads((ROOT / binding["candidateManifest"]["path"]).read_text(encoding="utf-8"))
        binding["mapVersionPairingVerified"] = True
        record = self.module.map_selection_records("libraries/reference-ga0/Tiles", manifest, contract)[0]
        self.assertTrue(record["historicalPairingDeclared"])
        self.assertFalse(record["historicalPairingVerified"])
        self.assertFalse(record["selected"])
        self.assertFalse(record["manifestLocksMatch"])


if __name__ == "__main__":
    unittest.main()
