from pathlib import Path
import json
import unittest


ROOT = Path(__file__).resolve().parents[1]


class UiCalibrationTests(unittest.TestCase):
    def test_calibration_page_is_in_production_build_inputs(self):
        page = ROOT / "apps/web/ui-calibration.html"
        config = (ROOT / "apps/web/vite.config.ts").read_text()
        self.assertTrue(page.is_file())
        self.assertIn("apps/web/ui-calibration.html", config)
        self.assertIn('/src/ui-calibration.ts', page.read_text())

    def test_calibration_uses_locked_800_by_600_layout(self):
        layout = json.loads((ROOT / "content/classic-176/ui-layout.json").read_text())
        source = (ROOT / "apps/web/src/ui-calibration.ts").read_text()
        stage = (ROOT / "apps/web/src/classic-stage.ts").read_text()
        self.assertEqual(layout["canvas"], {"width": 800, "height": 600})
        self.assertIn("new ClassicStage(frame,content)", source)
        self.assertIn("CLASSIC_STAGE={width:800,height:600}", stage)
        for scene in ("login", "select", "create", "hud", "character", "inventory", "npc", "shop", "repair", "storage", "quest", "attack", "targets", "ground", "group", "guild", "system", "chat", "trade"):
            self.assertIn(f'data-scene="{scene}"', (ROOT / "apps/web/ui-calibration.html").read_text())
        self.assertEqual(layout["nationalWindowContracts"]["chat"]["content"], "channel-log-and-input")
        self.assertEqual(layout["nationalWindowContracts"]["trade"]["content"], "two-party-items-and-confirmation")
        self.assertEqual(layout["nationalWindowContracts"]["quest"]["content"], "quest-progress-list")
        self.assertEqual(layout["nationalWindowContracts"]["attack"]["content"], "attack-mode-select")
        self.assertEqual(layout["nationalWindowContracts"]["system"]["content"], "modal-confirmation")
        for kind in ("targets", "ground", "group", "guild"):
            self.assertEqual(layout["nationalWindowContracts"][kind]["frame"], "prguse#402")

    def test_calibration_can_load_reference_without_writing_workspace_files(self):
        source = (ROOT / "apps/web/src/ui-calibration.ts").read_text()
        markup = (ROOT / "apps/web/ui-calibration.html").read_text()
        self.assertIn("FileReader", source)
        self.assertIn("readAsDataURL", source)
        self.assertIn("reference-opacity", markup)
        self.assertEqual(markup.count('id="calibration-status-message"'), 1)
        self.assertNotIn("writeFile", source)

    def test_calibration_mounts_the_same_production_component_ids(self):
        source = (ROOT / "apps/web/src/ui-calibration.ts").read_text()
        markup = (ROOT / "apps/web/ui-calibration.html").read_text()
        for element_id in ("paperdoll-actor", "equipment-items", "character-panel", "character-state", "skills", "inventory-items", "inventory-item-tooltip", "npc-dialog", "shop-panel", "repair-panel", "storage-panel", "calibration-quest-panel", "calibration-attack-panel", "calibration-targets-panel", "calibration-ground-panel", "calibration-group-panel", "calibration-guild-panel", "calibration-system-panel", "calibration-chat-panel", "calibration-trade-panel"):
            self.assertIn(f'id="{element_id}"', markup)
            if element_id not in ("skills", "inventory-item-tooltip"):
                self.assertIn(f"#{element_id}", source)
        self.assertNotIn("nationalScenes", source)
        self.assertNotIn("npc-window", markup)

    def test_calibration_exposes_service_window_fixtures(self):
        source = (ROOT / "apps/web/src/ui-calibration.ts").read_text()
        markup = (ROOT / "apps/web/ui-calibration.html").read_text()
        for component in ("ShopView", "RepairView", "StorageView"):
            self.assertIn(component, source)
        for scene in ("shop", "repair", "storage", "quest", "attack", "targets", "ground", "group", "guild", "system", "chat", "trade"):
            self.assertIn(f'data-scene="{scene}"', markup)
        for panel in ("shop-panel", "repair-panel", "storage-panel", "calibration-quest-panel", "calibration-attack-panel", "calibration-targets-panel", "calibration-ground-panel", "calibration-group-panel", "calibration-guild-panel", "calibration-system-panel", "calibration-chat-panel", "calibration-trade-panel"):
            self.assertIn(f'id="{panel}"', markup)

    def test_calibration_wires_production_navigation_and_state_controls(self):
        source = (ROOT / "apps/web/src/ui-calibration.ts").read_text()
        markup = (ROOT / "apps/web/ui-calibration.html").read_text()
        interactions = json.loads((ROOT / "content/classic-176/ui-interactions.json").read_text())
        self.assertIn("setCharacterPage", source)
        self.assertIn("new SkillBar", source)
        self.assertIn("makeClassicWindowDraggable", source)
        self.assertIn("[data-window-open]", source)
        self.assertIn("#login", source)
        self.assertIn("#create-character", source)
        self.assertIn("#npc-options button", source)
        self.assertIn("#calibration-attack-mode", source)
        self.assertIn("event.ctrlKey&&event.key.toLowerCase()==='h'", source)
        for target in ("character", "inventory", "skills", "quest", "attack"):
            self.assertIn(f'data-window-open="{target}"', markup)
        for control in ("service.close", "shop.goods.buy", "repair.item.action", "storage.item.action", "hud.window.quest", "hud.window.attack", "quest.entry", "attack.mode", "targets.entry", "ground.pickup", "group.action", "guild.action", "system.action", "chat.channel", "trade.confirm", "trade.cancel"):
            self.assertIn(control, interactions["controls"])


if __name__ == "__main__":
    unittest.main()
