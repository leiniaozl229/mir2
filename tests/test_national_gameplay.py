import importlib.util
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from test_wil_lib import original_wil_fixture

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("national_game_import", ROOT / "scripts/import-national-game-assets.py")
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)
PROFILE = json.loads((ROOT / "content/classic-176/national-gameplay.json").read_text(encoding="utf-8"))


class NationalGameplayTests(unittest.TestCase):
    def test_source_preflight_rejects_another_client_version(self):
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary) / 'Hum.wil'
            index = Path(temporary) / 'Hum.wix'
            source.write_bytes(b'original')
            index.write_bytes(b'index')
            expected = {'sourceSha256': hashlib.sha256(b'original').hexdigest(),
                        'indexSha256': hashlib.sha256(b'index').hexdigest()}
            importer.validate_source_pair(source, index, expected)
            source.write_bytes(b'another client')
            with self.assertRaisesRegex(ValueError, 'source version mismatch'):
                importer.validate_source_pair(source, index, expected)

    def test_game_import_preserves_source_indices_offsets_and_hashes(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = original_wil_fixture(root)
            source.rename(root / "Hum.wil")
            (root / "Original.wix").rename(root / "Hum.wix")
            result = importer.import_family(root / "Hum.wil", root / "out", "actors", PROFILE)
            manifest = json.loads((root / "out/library.json").read_text(encoding="utf-8"))
            self.assertEqual(result["frames"], 1)
            self.assertEqual(manifest["profile"], "national-2003-gameplay")
            self.assertEqual(manifest["actions"]["walking"]["start"], 64)
            self.assertEqual((manifest["frames"]["0"]["offsetX"], manifest["frames"]["0"]["offsetY"]), (-3, 4))
            self.assertEqual(len(manifest["sourceSha256"]), 64)
            self.assertEqual(len(manifest["indexSha256"]), 64)
            self.assertTrue((root / "out" / manifest["frames"]["0"]["file"]).is_file())

    def test_source_contract_covers_all_national_gameplay_families(self):
        sources = importer.sources()
        self.assertEqual(len(sources), 28)
        self.assertEqual(len({(category, target) for _, category, target in sources}), 28)
        self.assertEqual([name for name, _, _ in sources if name.startswith("Mon")], [f"Mon{i}" for i in range(1, 19)])

    def test_action_tables_stay_inside_gender_blocks_and_hold_death_pose(self):
        for name, action in PROFILE["player"]["actions"].items():
            self.assertGreater(action["interval"], 0)
            last = action["start"] + 7 * (action["count"] + action["skip"]) + action["count"] - 1
            self.assertLess(last, 600, name)
        for actions in PROFILE["monster"]["actions"].values():
            if "dying" not in actions:
                continue
            dying, dead = actions["dying"], actions["dead"]
            for direction in range(8):
                last = dying["start"] + direction * (dying["count"] + dying["skip"]) + dying["count"] - 1
                corpse = dead["start"] + direction * (dead["count"] + dead["skip"])
                self.assertEqual(last, corpse)
        self.assertEqual([len(row) for row in PROFILE["player"]["weaponOrder"]], [600, 600])


if __name__ == "__main__":
    unittest.main()
