from pathlib import Path
import unittest

from tools.quest_catalog_audit import audit


ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "content/classic-176/p0"


class P0QuestContentTests(unittest.TestCase):
    def test_source_map_quest_has_script_and_runtime_route_import_path(self):
        report = audit()
        self.assertTrue(report["ok"], report)
        self.assertEqual(report["sourceEntries"], 1)
        self.assertEqual(report["runtimeMode"], "p0")
        self.assertEqual(report["expectedRuntimeEntries"], 0)
        self.assertEqual(report["skippedRuntimeEntries"], ["Q001"])
        self.assertEqual(report["missingRuntimeEntries"], [])
        self.assertEqual(report["entries"][0]["map"], "Q001")
        self.assertEqual(report["entries"][0]["npc"], "Q002")
        self.assertEqual(report["sourceTriggerScripts"]["Q001"], ["任务NPC/老人-1.txt"])

    def test_classic_route_reports_source_quest_missing_from_runtime(self):
        report = audit(runtime_mode="classic-route")
        self.assertFalse(report["ok"], report)
        self.assertEqual(report["expectedRuntimeEntries"], 1)
        self.assertEqual(report["missingRuntimeEntries"], ["Q001"])

    def test_quest_scripts_keep_persistent_accept_and_complete_flags(self):
        specs = {
            "potion-quest.txt": (1005, 1006, "金创药(小量)", "金创药(中量)"),
            "weapon-quest.txt": (1007, 1008, "木剑", "金币"),
        }
        for filename, (accepted, complete, required_item, reward) in specs.items():
            with self.subTest(filename=filename):
                text = (CONTENT / filename).read_text(encoding="utf-8")
                self.assertIn(f"CHECK [{accepted}] 0", text)
                self.assertIn(f"SET [{accepted}] 1", text)
                self.assertIn(f"CHECK [{complete}] 1", text)
                self.assertIn(f"SET [{complete}] 1", text)
                self.assertIn(f"CHECKITEM {required_item}", text)
                self.assertIn(f"TAKE {required_item}", text)
                self.assertIn(f"GIVE {reward}", text)
                self.assertIn("CHANGEXP", text)
                self.assertIn("QMARK|", text)

    def test_taoist_skill_kit_includes_summon_reagents(self):
        text = (CONTENT / "skill-trainer.txt").read_text(encoding="utf-8")
        self.assertIn("ADDSKILL 召唤骷髅 3", text)
        self.assertIn("GIVE 护身符 1", text)
        self.assertIn("GIVE 灰色药粉(少量) 1", text)
        self.assertIn("CHANGELEVEL = 35", text)
        self.assertIn("CHANGELEVEL = 31", text)
        self.assertIn("CHANGELEVEL = 22", text)
        self.assertIn("ADDSKILL 基本剑术 3", text)
        self.assertIn("ADDSKILL 火球术 3", text)
        self.assertIn("ADDSKILL 治愈术 3", text)
        self.assertIn("MAPMOVE 0 292 623", text)

    def test_runtime_preparation_registers_each_task_at_all_spawn_zones(self):
        text = (ROOT / "scripts/prepare-runtime.py").read_text(encoding="utf-8")
        for script, display in [("药剂筹备", "药师学徒"), ("铁匠试炼", "铁匠学徒")]:
            with self.subTest(script=script):
                self.assertGreaterEqual(text.count(f'测试/{script} 0 '), 3)
                self.assertIn(display, text)

    def test_classic_route_preserves_map_quest_binding(self):
        text = (ROOT / "scripts/prepare-runtime.py").read_text(encoding="utf-8")
        self.assertIn("[D401 废矿入口] MINE CHECKQUEST(Q001)", text)

    def test_map_quest_kill_trigger_is_wired_through_map_resolver(self):
        play_object = (ROOT / "vendor/openmir2/src/M2Server/Player/PlayObject.cs").read_text(encoding="utf-8-sig")
        environment = (ROOT / "vendor/openmir2/src/M2Server/Maps/Envirnoment.cs").read_text(encoding="utf-8-sig")
        quest_manager = (ROOT / "vendor/openmir2/src/GameSrv/Maps/MapQuestManager.cs").read_text(encoding="utf-8-sig")
        local_db = (ROOT / "vendor/openmir2/src/GameSrv/DB/LocalDB.cs").read_text(encoding="utf-8-sig")

        self.assertIn("map.TryTriggerQuest(this, killObject.ChrName, \"\", false)", play_object)
        self.assertIn("public bool TryTriggerQuest(", environment)
        self.assertIn("map.AddQuestResolver(", quest_manager)
        self.assertIn("CreateQuest(sMap, n38, n3C, sMonName, sItem, sQuest, boGrouped)", local_db)
        self.assertTrue((ROOT / "patches/openmir2/0018-enable-map-quest-kill-triggers.patch").exists())

    def test_native_input_dialogue_keeps_text_in_script_string_slot(self):
        merchant = (ROOT / "vendor/openmir2/src/GameSrv/Npc/Merchant.cs").read_text(encoding="utf-8-sig")
        self.assertIn('sLabel.StartsWith("@@InPutString", StringComparison.OrdinalIgnoreCase)', merchant)
        self.assertIn("playObject.MSString[stringIndex] = sMsg", merchant)
        gateway = (ROOT / "services/web-gateway/GatewaySession.cs").read_text(encoding="utf-8")
        self.assertIn('value.StartsWith("@@InPutString", StringComparison.OrdinalIgnoreCase)', gateway)
        self.assertIn("value += '\\r' + input", gateway)


if __name__ == "__main__":
    unittest.main()
