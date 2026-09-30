import json
import importlib.util
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class PersonalProfileTests(unittest.TestCase):
    def test_high_level_drop_balance_trims_common_loot_and_promotes_rare_gear(self):
        spec = importlib.util.spec_from_file_location(
            "drop_balance", ROOT / "scripts/drop_balance.py")
        balance = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(balance)
        catalog = json.loads(balance.CATALOG.read_text(encoding="utf-8"))
        for monster in ("祖玛教主", "牛魔王", "赤月恶魔", "牛魔战士"):
            source = (balance.SOURCE / f"{monster}.txt").read_bytes().decode("gb18030")
            rendered = balance.render_table(
                source, multiplier=20, balanced=True,
                monster=catalog["monsters"][monster], items=catalog["items"])
            names = re.findall(r"^\d+/\d+\s+(\S+)", rendered, re.M)
            self.assertTrue(set(names) <= set(catalog["items"]) | {"金币"}, monster)
            self.assertNotIn("凌风", names, monster)
            self.assertLessEqual(names.count("强效金创药"), 2, monster)
            self.assertLessEqual(names.count("强效魔法药"), 2, monster)
        boss = balance.render_table(
            (balance.SOURCE / "祖玛教主.txt").read_bytes().decode("gb18030"),
            multiplier=20, balanced=True,
            monster=catalog["monsters"]["祖玛教主"], items=catalog["items"])
        self.assertRegex(boss, r"(?m)^\d+/1000\s+裁决之杖$")
        self.assertIn("修罗", balance.render_table(
            (balance.SOURCE / "月魔蜘蛛.txt").read_bytes().decode("gb18030"),
            multiplier=20, balanced=True,
            monster=catalog["monsters"]["剧毒蜘蛛"], items=catalog["items"]))

    def test_high_level_drop_tables_are_reversible_and_repeatable(self):
        spec = importlib.util.spec_from_file_location(
            "drop_balance", ROOT / "scripts/drop_balance.py")
        balance = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(balance)
        with tempfile.TemporaryDirectory() as raw:
            directory = Path(raw)
            first = balance.reconcile_tables(directory, 20, True, True)
            self.assertEqual(first["filesChanged"], first["monsters"])
            self.assertEqual(balance.reconcile_tables(directory, 20, True, False)["filesChanged"], 0)
            self.assertTrue((directory / "剧毒蜘蛛.txt").is_file())
            restored = balance.reconcile_tables(directory, 1, False, True)
            self.assertEqual(restored["filesChanged"], first["monsters"])
            self.assertEqual(balance.reconcile_tables(directory, 1, False, False)["filesChanged"], 0)

    def test_apply_profile_scales_exp_drops_spawn_and_gm(self):
        with tempfile.TemporaryDirectory() as raw:
            runtime = Path(raw)
            mir = runtime / "server/Mir200"
            (mir / "Envir/MonItems").mkdir(parents=True)
            (mir / "exps.conf").write_text("\ufeff[Exp]\nKillMonExpMultiple=1\n", encoding="utf-8")
            (mir / "server.conf").write_text("\ufeff[Server]\nRegenMonstersTime=200\n", encoding="utf-8")
            (mir / "Envir/MonItems/鸡.txt").write_bytes("1/10 鸡肉\n".encode("gb18030"))
            (mir / "Envir/MonGen.txt").write_bytes("0 10 10 鸡 2 1 1\n".encode("gb18030"))
            profile = runtime / "profile.json"
            profile.write_text(json.dumps({
                "id": "test",
                "experienceMultiplier": 2,
                "dropMultiplier": 2,
                "spawnDelayMultiplier": 0.5,
                "monsterSpawns": ["0 20 20 鹿 2 1 1"],
                "gm": {"enabled": True, "character": "SoloGM", "ip": "127.0.0.1"},
            }, ensure_ascii=False), encoding="utf-8")
            subprocess.run([
                sys.executable, str(ROOT / "scripts/apply-personal-profile.py"),
                "--profile", str(profile), "--runtime", str(runtime), "--apply",
            ], check=True, cwd=ROOT, capture_output=True, text=True)
            self.assertIn("KillMonExpMultiple=2", (mir / "exps.conf").read_text(encoding="utf-8-sig"))
            self.assertIn("RegenMonstersTime=100", (mir / "server.conf").read_text(encoding="utf-8-sig"))
            self.assertEqual((mir / "Envir/MonItems/鸡.txt").read_bytes().decode("gb18030").split()[0], "2/10")
            mon_gen = (mir / "Envir/MonGen.txt").read_bytes().decode("gb18030")
            self.assertEqual(mon_gen.count("0 20 20 鹿 2 1 1"), 1)
            self.assertEqual(mon_gen.splitlines()[0], "0 20 20 鹿 2 1 1")
            self.assertEqual((mir / "Envir/AdminList.txt").read_text(encoding="utf-8").strip(), "*SoloGM 127.0.0.1")
            self.assertTrue((runtime / "personal-profile.json").exists())
            subprocess.run([
                sys.executable, str(ROOT / "scripts/apply-personal-profile.py"),
                "--profile", str(profile), "--runtime", str(runtime), "--apply",
            ], check=True, cwd=ROOT, capture_output=True, text=True)
            self.assertEqual((mir / "Envir/MonItems/鸡.txt").read_bytes().decode("gb18030").split()[0], "2/10")
            self.assertEqual((mir / "Envir/MonGen.txt").read_bytes().decode("gb18030").count("0 20 20 鹿 2 1 1"), 1)

            classic = runtime / "classic.json"
            classic.write_text(json.dumps({
                "id": "classic",
                "experienceMultiplier": 1,
                "dropMultiplier": 1,
                "spawnDelayMultiplier": 1,
            }), encoding="utf-8")
            subprocess.run([
                sys.executable, str(ROOT / "scripts/apply-personal-profile.py"),
                "--profile", str(classic), "--runtime", str(runtime), "--apply",
            ], check=True, cwd=ROOT, capture_output=True, text=True)
            self.assertEqual((mir / "Envir/MonItems/鸡.txt").read_bytes().decode("gb18030").split()[0], "1/10")
            self.assertNotIn("0 20 20 鹿 2 1 1", (mir / "Envir/MonGen.txt").read_bytes().decode("gb18030"))


if __name__ == "__main__":
    unittest.main()
