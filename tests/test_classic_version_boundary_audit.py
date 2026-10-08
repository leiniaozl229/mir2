"""Version claims require positive identity/source evidence, never name guesses."""
from collections import Counter
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("classic_version_boundary_audit", ROOT / "tools/classic_version_boundary_audit.py")
AUDIT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(AUDIT)


def skill(magic_id, name, **values):
    return {"magid": magic_id, "magname": name, "effecttype": 1, "effect": 1,
            "spell": 4, "power": 8, "maxpower": 8, "defspell": 1,
            "defpower": 2, "defmaxpower": 2, "job": 1, "delay": 60, "descr": "",
            "needl1": 7, "needl2": 11, "needl3": 16,
            "l1train": 200, "l2train": 300, "l3train": 500, **values}


class SqlEvidenceTests(unittest.TestCase):
    def test_sql_quoted_identity_and_escapes_survive(self):
        self.assertEqual(AUDIT.sql_values(r"1, 'NULL', NULL, '123', 'a,b', 'a\'b', '双''引', 'a\nb', -2"),
                         [1, "NULL", None, "123", "a,b", "a'b", "双'引", "a\nb", -2])

    def test_ddl_drives_column_order_and_source_line(self):
        text = "CREATE TABLE `t` (\n `Idx` int,\n `Name` text,\n `Mode` int\n) ENGINE=x;\nINSERT INTO `t` VALUES (7, '未知英雄', 4);\n"
        rows = AUDIT.parse_sql(text, ("t",))["t"]
        self.assertEqual(rows, [{"idx": 7, "name": "未知英雄", "mode": 4, "sourceLine": 6}])

    def test_malformed_and_duplicate_rows_fail_without_silent_filtering(self):
        prefix = "CREATE TABLE `t` (\n `Idx` int,\n `Name` text\n) ENGINE=x;\n"
        for tail in ("INSERT INTO `t` VALUES (1);", "INSERT INTO `t` VALUES (1, 'a');\nINSERT INTO `t` VALUES (1, 'b');",
                     "INSERT INTO `t` VALUES (2, 'truncated);", "INSERT INTO `t` VALUES (1, 2, 3);"):
            with self.subTest(tail=tail), self.assertRaises(ValueError):
                AUDIT.parse_sql(prefix + tail, ("t",))


class ClassificationEvidenceTests(unittest.TestCase):
    def test_classical_contract_is_separate_from_parameter_lock_and_history(self):
        result = AUDIT.classify_skill(skill(33, "冰咆哮"), {"33": {"name": "冰咆哮"}}, {}, [], [])
        self.assertEqual(result["classification"], "classical_supported")
        self.assertFalse(result["rulePinned"])
        self.assertEqual(result["versionStatus"], "unknown")

    def test_outside_input_and_hero_name_do_not_prove_extension(self):
        for ident, name in ((88, "四级英雄剑术"), (500, "破血狂杀"), (34, "解毒术")):
            with self.subTest(ident=ident):
                result = AUDIT.classify_skill(skill(ident, name), {}, {}, [], [])
                self.assertEqual(result["classification"], "unclassified_evidence")
                self.assertEqual(result["contractStatus"], "contract_outside_scope")
                self.assertEqual(result["versionStatus"], "unknown")

    def test_explicit_extension_needs_declaration_and_exact_join(self):
        reference = AUDIT.magic_constants("//以下1.8版以后技能\nSKILL_45 = 45; //FlameDisruptor\n", True)
        native = AUDIT.magic_constants("/// <summary>\n/// 灭天火\n/// </summary>\npublic const byte SKILL_45 = 45;\n")
        result = AUDIT.classify_skill(skill(45, "灭天火"), {}, {}, native, reference)
        self.assertEqual(result["classification"], "explicit_extension")
        self.assertEqual(result["extensionProof"]["extensionDeclarationLine"], 1)
        self.assertEqual(result["versionStatus"], "unknown")
        self.assertEqual(native[0]["comment"], "灭天火")

    def test_same_id_with_wrong_name_or_symbol_stays_unknown(self):
        reference = AUDIT.magic_constants("//以下1.8版以后技能\nSKILL_CROSSMOON = 34; //双龙斩\n", True)
        native = AUDIT.magic_constants("/// 双龙斩\npublic const byte SKILL_CROSSMOON = 34;")
        result = AUDIT.classify_skill(skill(34, "解毒术"), {}, {}, native, reference)
        self.assertEqual(result["classification"], "unclassified_evidence")
        self.assertTrue(result["identityMismatch"])
        native = AUDIT.magic_constants("/// 解毒术\npublic const byte SKILL_UNRELATED = 34;")
        self.assertEqual(AUDIT.classify_skill(skill(34, "解毒术"), {}, {}, native, reference)["classification"], "unclassified_evidence")

    def test_reference_occurrence_without_extension_declaration_is_unknown(self):
        reference = AUDIT.magic_constants("SKILL_45 = 45; //灭天火\n", True)
        result = AUDIT.classify_skill(skill(45, "灭天火"), {}, {}, [], reference)
        self.assertEqual(result["classification"], "unclassified_evidence")

    def test_rule_lock_parameter_difference_is_reported_not_erased(self):
        result = AUDIT.classify_skill(skill(1, "火球术"), {"1": {"name": "火球术"}},
            {"火球术": {"magicId": 1, "spell": 99, "needLevels": [7, 11, 99]}}, [], [])
        self.assertTrue(result["rulePinned"])
        self.assertEqual(result["ruleParameterDifferences"], ["spell", "needLevels"])
        self.assertEqual(result["classification"], "classical_supported")

    def test_parser_only_extracts_public_skill_constants(self):
        declarations = AUDIT.magic_constants("Secret = 'private';\nSKILL_FIREBALL = 1; //火球术\n//以下1.8版以后技能\nSKILL_45 = 45;\nPrivateToken = 'not-reportable';", True)
        self.assertEqual([d["magicId"] for d in declarations], [1, 45])
        self.assertIsNone(declarations[0]["extensionDeclarationLine"])
        self.assertEqual(declarations[1]["extensionDeclarationLine"], 3)
        self.assertNotIn("private", json.dumps(declarations))


class EntranceEvidenceTests(unittest.TestCase):
    def test_npc_conditions_speech_and_shop_stock_have_distinct_scope(self):
        text = "[goods]\n未知衣服 3 5\n; 假技能 1\n[@main]\n#SAY\nGIVE 伪奖励 1\n#IF\nCHECKITEM 任务物 1\n#ACT\nGIVE 真奖励 1\nADDSKILL 冰咆哮 0\n#ELSESAY\nADDSKILL 伪技能 0\n"
        entries = AUDIT.parse_script(text)
        self.assertEqual([e["name"] for e in entries], ["未知衣服", "真奖励", "冰咆哮"])
        self.assertEqual(entries[0]["kind"], "shop_stock")
        self.assertEqual(entries[1]["conditionLine"], 7)
        self.assertFalse(entries[1]["conditionsEvaluated"])

    def test_hero_actions_are_retained_without_claiming_current_player_reward(self):
        entries = AUDIT.parse_script("[@hero]\n#ACT\nH.GIVE 英雄木剑 1\nH.ADDSKILL 英雄灭天火 1\n")
        self.assertEqual([e["recipient"] for e in entries], ["hero", "hero"])
        self.assertEqual(entries[1]["command"], "H.ADDSKILL")

    def test_drop_parser_keeps_probability_and_ignores_mentions(self):
        entries = AUDIT.parse_drops(";1/1 假书\n10/3000 烈火剑法\n10/10 金币 1000\n说明: 灭天火\n")
        self.assertEqual([(e["name"], e["numerator"], e["denominator"], e["quantity"]) for e in entries],
                         [("烈火剑法", 10, 3000, None), ("金币", 10, 10, 1000)])

    def test_mounts_and_spawns_use_real_map_fields_and_exact_monster_names(self):
        mounts = AUDIT.parse_mounts("商店/书 0 325 250 书店老板 0 2 0\n")
        self.assertEqual((mounts[0]["script"], mounts[0]["mapId"], mounts[0]["npcName"]), ("商店/书", "0", "书店老板"))
        fixed = AUDIT.parse_mounts("比奇国王 1 0122 29 32 0 8\n", True)
        self.assertEqual(fixed[0]["mapId"], "0122")
        spawns = AUDIT.parse_spawns("D024 22 54 沃玛教主9 3 1 30\nUNKNOWN 1 2 英雄怪 1 1 1\n", {"d024"})
        self.assertEqual(spawns[0]["monster"], "沃玛教主9")
        self.assertTrue(spawns[0]["mapInProfile"])
        self.assertFalse(spawns[1]["mapInProfile"])

    def test_generated_binding_uses_nearest_literal_assignment_not_fstring_prefix(self):
        text = '''guide = SERVER / "Mir200/Envir/Market_Def/测试/古墓向导-D001.txt"
guide.write_text(read_text(ROOT / "content/classic-176/p0/cave-guide.txt"))
guide = SERVER / f"Mir200/Envir/Market_Def/测试/世界向导-{map_id}.txt"
guide.write_text(text)
'''
        self.assertEqual(AUDIT.generated_assignments(text), {
            "Mir200/Envir/Market_Def/测试/古墓向导-D001.txt": "content/classic-176/p0/cave-guide.txt"})

    def test_actual_city_filter_preserves_quest_reward_but_removes_old_shop_stock(self):
        city = AUDIT.load_city(ROOT)
        text = "(@buy)\n[goods]\n灭天火 5 1\n[@main]\n#SAY\n<买/@buy>\n[@quest]\n#ACT\nGIVE 八卦宝石 1\n"
        entries = AUDIT.parse_script(city.quest_only_script(text))
        self.assertEqual([e["name"] for e in entries], ["八卦宝石"])
        self.assertIsNone(city.normalize_merchant("白日门/书店 11 1 2 后期书商 0 2 0"))
        self.assertIn("书店任务人", city.normalize_merchant("比奇城/书店 0 325 250 书店老板 0 2 0"))


class FullCatalogueTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Portable: reference source is optional. Absence increases unknowns.
        cls.report = AUDIT.build_audit(ROOT)

    def test_every_sql_row_retained_and_all_unknown_history_preserved(self):
        report = self.report
        self.assertEqual((len(report["items"]), len(report["skills"])), (1000, 108))
        self.assertEqual(len({i["id"] for i in report["items"]}), 1000)
        self.assertEqual(len({s["idx"] for s in report["skills"]}), 108)
        self.assertTrue(all(r["versionStatus"] == "unknown" for r in report["items"] + report["skills"]))
        self.assertEqual(report["summary"]["inputSkills"], 33)
        self.assertEqual(report["summary"]["pinnedSkillRules"], 15)
        self.assertEqual(report["summary"]["ruleParameterDifferences"], 0)

    def test_missing_icon_is_never_used_as_version_classifier(self):
        report = self.report
        self.assertEqual(report["summary"]["items"]["iconsMissing"], 599)
        self.assertEqual(report["summary"]["skills"]["iconsMissing"], 63)
        self.assertEqual(report["summary"]["items"]["classification"]["classical_supported"], 69)
        self.assertEqual(report["summary"]["skills"]["classification"]["classical_supported"], 33)
        self.assertEqual(report["summary"]["items"]["classification"]["explicit_extension"], 0)
        self.assertEqual(report["summary"]["skills"]["classification"]["explicit_extension"], 0)
        self.assertTrue(all(i["iconDoesNotProveVersion"] for i in report["items"] + report["skills"]))

    def test_duplicate_magic_id_conflict_is_retained(self):
        pair = next(d for d in self.report["duplicateMagicIds"] if d["magicId"] == 48)
        self.assertEqual({s["name"] for s in pair["rows"]}, {"群体施毒术", "气功波"})
        self.assertTrue(pair["effectConflict"])
        for row in self.report["skills"]:
            if row["magicId"] == 48:
                self.assertTrue(row["duplicateEffectConflict"])

    def test_books_require_real_stdmode_and_exact_native_name_not_hero_prefix(self):
        items = {i["name"]: i for i in self.report["items"]}
        self.assertEqual(items["火球术"]["classification"], "classical_supported")
        self.assertEqual(items["火球术"]["stdMode"], 4)
        self.assertEqual(items["白日门火球术"]["classification"], "unclassified_evidence")
        self.assertTrue(items["白日门火球术"]["unresolvedBookName"])

    def test_static_entrances_retain_retired_and_unresolved_proof_without_live_claim(self):
        entries = self.report["entrances"]
        self.assertTrue(all(e["liveVerified"] is False for e in entries))
        self.assertTrue(any(e["scope"] == "source_unresolved_mount" for e in entries))
        old_stock = [e for e in entries if e["kind"] == "shop_stock" and e.get("mount", {}).get("script") == "比奇城/书店"]
        self.assertTrue(old_stock)
        self.assertTrue(all(not e["classicRoutePotential"] for e in old_stock))
        merchant = [e for e in entries if e["scope"] == "generated_classic_route" and e["name"] == "木剑" and e["kind"] == "shop_stock"]
        self.assertTrue(merchant)
        self.assertTrue(all(e["classicRoutePotential"] for e in merchant))

    def test_generated_drop_replaces_source_tables_and_keeps_provenance(self):
        old = [e for e in self.report["entrances"] if e.get("monster") == "骷髅" and e["scope"] == "tracked_source"]
        self.assertTrue(old)
        self.assertTrue(all(e["routeTransform"] == "replaced_by_p0_drop" and not e["classicRoutePotential"] for e in old))
        new = [e for e in self.report["entrances"] if e["scope"] == "generated_classic_drop" and "骷髅" in e["monsters"]]
        self.assertTrue(new)
        self.assertTrue(all(e["path"].startswith("content/classic-176/p0/") for e in new))

    def test_report_sources_exist_and_no_runtime_account_or_database_read(self):
        self.assertGreater(len(self.report["sources"]), 200)
        for source in self.report["sources"]:
            self.assertTrue((ROOT / source["path"]).is_file(), source["path"])
            self.assertEqual(len(source["sha256"]), 64)
            self.assertFalse(source["path"].startswith(".runtime/"))
        self.assertEqual(self.report["mode"], "tracked_sources_read_only")


if __name__ == "__main__":
    unittest.main()
