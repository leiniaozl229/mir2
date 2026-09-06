import json
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class PersonalProfileTests(unittest.TestCase):
    def test_apply_profile_scales_exp_drops_spawn_and_gm(self):
        with tempfile.TemporaryDirectory() as raw:
            runtime = Path(raw)
            mir = runtime / "server/Mir200"
            (mir / "Envir/MonItems").mkdir(parents=True)
            (mir / "exps.conf").write_text("\ufeff[Exp]\nKillMonExpMultiple=1\n", encoding="utf-8")
            (mir / "server.conf").write_text("\ufeff[Server]\nRegenMonstersTime=200\n", encoding="utf-8")
            (mir / "Envir/MonItems/鸡.txt").write_bytes("1/10 鸡肉\n".encode("gb18030"))
            profile = runtime / "profile.json"
            profile.write_text(json.dumps({
                "id": "test",
                "experienceMultiplier": 2,
                "dropMultiplier": 2,
                "spawnDelayMultiplier": 0.5,
                "gm": {"enabled": True, "character": "SoloGM", "ip": "127.0.0.1"},
            }, ensure_ascii=False), encoding="utf-8")
            subprocess.run([
                "python3", str(ROOT / "scripts/apply-personal-profile.py"),
                "--profile", str(profile), "--runtime", str(runtime), "--apply",
            ], check=True, cwd=ROOT, capture_output=True, text=True)
            self.assertIn("KillMonExpMultiple=2", (mir / "exps.conf").read_text(encoding="utf-8-sig"))
            self.assertIn("RegenMonstersTime=100", (mir / "server.conf").read_text(encoding="utf-8-sig"))
            self.assertEqual((mir / "Envir/MonItems/鸡.txt").read_bytes().decode("gb18030").split()[0], "2/10")
            self.assertEqual((mir / "Envir/AdminList.txt").read_text(encoding="utf-8").strip(), "*SoloGM 127.0.0.1")
            self.assertTrue((runtime / "personal-profile.json").exists())


if __name__ == "__main__":
    unittest.main()
