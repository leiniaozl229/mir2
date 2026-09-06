import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
PROFILE = ROOT / "content/classic-176/national-ui-profile.json"
CHECKER = ROOT / "tools/validate-national-ui.py"


class NationalUiProfileTests(unittest.TestCase):
    def test_profile_locks_the_2003_national_ui_contract(self):
        profile = json.loads(PROFILE.read_text())
        self.assertEqual(profile["id"], "shanda-2003-1.76-cn")
        self.assertEqual(profile["canvas"], {"width": 800, "height": 600, "coordinateOrigin": "top-left", "scalePolicy": "integer-preferred"})
        self.assertEqual(profile["keyboard"]["inventory"], "F9")
        self.assertEqual(profile["keyboard"]["character"], "F10")
        self.assertEqual(profile["keyboard"]["skills"], "F11")
        self.assertEqual(profile["sourceContract"]["acceptedFormats"], ["WIL/WIX", "WZL/WZX", "PAK"])
        self.assertGreaterEqual(len(profile["sourceContract"]["families"]), 12)

    def test_checker_reports_missing_reference_assets_without_claiming_ready(self):
        result = subprocess.run([sys.executable, str(CHECKER)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 2)
        report = json.loads(result.stdout)
        self.assertFalse(report["ok"])
        self.assertNotIn("status", report)
        self.assertEqual(report["error"], "missing --data-dir")
        self.assertIn("prguse", report["missingFamilies"])

    def test_checker_accepts_one_complete_variant_per_family(self):
        profile = json.loads(PROFILE.read_text())
        with tempfile.TemporaryDirectory() as temporary:
            data_dir = Path(temporary)
            for family in profile["sourceContract"]["families"]:
                for name in family["variants"][0]:
                    (data_dir / name).write_bytes(b"fixture")
            result = subprocess.run([sys.executable, str(CHECKER), "--data-dir", str(data_dir)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout)
            report = json.loads(result.stdout)
            self.assertTrue(report["ok"])
            self.assertEqual(report["status"], "ready-for-decoder")
            self.assertEqual(report["missingFamilies"], [])


if __name__ == "__main__":
    unittest.main()
