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
        for scene in ("login", "select", "create", "hud", "character", "inventory", "npc"):
            self.assertIn(f'data-scene="{scene}"', (ROOT / "apps/web/ui-calibration.html").read_text())

    def test_calibration_can_load_reference_without_writing_workspace_files(self):
        source = (ROOT / "apps/web/src/ui-calibration.ts").read_text()
        markup = (ROOT / "apps/web/ui-calibration.html").read_text()
        self.assertIn("FileReader", source)
        self.assertIn("readAsDataURL", source)
        self.assertIn("reference-opacity", markup)
        self.assertEqual(markup.count('id="calibration-status-message"'), 1)
        self.assertNotIn("writeFile", source)


if __name__ == "__main__":
    unittest.main()
