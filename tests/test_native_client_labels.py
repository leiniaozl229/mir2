"""Regression checks for names drawn inside the 2003 client's game canvas."""

import importlib.util
from pathlib import Path
import unittest


SCRIPT = Path(__file__).parents[1] / "tools" / "native-window-fix" / "cursor-draw-fix.py"
SPEC = importlib.util.spec_from_file_location("native_cursor_draw_fix", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class NativeClientLabelsTest(unittest.TestCase):
    def test_ground_name_keeps_world_tile_for_per_frame_camera_position(self):
        state = {"actorId": 123, "x": 236, "y": 307, "items": [
            {"id": 1, "x": 237, "y": 308, "name": "金创药(中量)"},
            {"id": 2, "x": 237, "y": 308, "name": "乌木剑"},
        ], "monsters": [{"id": 99, "x": 239, "y": 311, "name": "半兽人", "hp": 14, "maxHp": 28}]}
        labels = MODULE.build_native_label_state(state, {})
        self.assertEqual(labels["player"], {"id": 123, "x": 236, "y": 307})
        self.assertEqual([(item["x"], item["y"], item["stack"]) for item in labels["items"]],
                         [(237, 308, 0), (237, 308, 1)])
        self.assertEqual(bytes.fromhex(labels["items"][0]["hex"]).decode("gbk"), "金创药(中量)")
        self.assertEqual((labels["monsters"][0]["id"], labels["monsters"][0]["x"],
                          labels["monsters"][0]["y"]), (99, 239, 311))
        self.assertEqual((labels["monsters"][0]["hp"], labels["monsters"][0]["maxHp"]),
                         (14, 28))
        state["x"] = 237  # Outbound movement target can arrive before animation.
        self.assertEqual(MODULE.build_native_label_state(state, {})["items"], labels["items"])

    def test_switches_hide_names_independently_of_health(self):
        state = {"x": 236, "y": 307,
                 "items": [{"x": 236, "y": 307, "name": "药水"}],
                 "monsters": [{"x": 237, "y": 308, "name": "半兽人", "hp": 7, "maxHp": 20}]}
        labels = MODULE.build_native_label_state(state, {
            "ShowGroundItemNames": False, "ShowMonsterNames": False,
            "ShowMonsterHealth": True})
        self.assertEqual(labels["items"], [])
        self.assertEqual(labels["monsters"][0]["hex"], "")
        self.assertEqual(labels["monsters"][0]["hp"], 7)
        labels = MODULE.build_native_label_state(state, {
            "ShowGroundItemNames": True, "ShowMonsterNames": False,
            "ShowMonsterHealth": False})
        self.assertEqual(labels["monsters"], [])


if __name__ == "__main__":
    unittest.main()
