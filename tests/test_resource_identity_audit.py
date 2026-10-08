import gzip
import importlib.util
import json
import struct
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]


def load():
    spec = importlib.util.spec_from_file_location("resource_identity_audit", ROOT / "tools/resource_identity_audit.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ResourceIdentityAuditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.module = load()

    def test_database_query_is_select_only_and_defaults_option_is_first(self):
        replies = [SimpleNamespace(returncode=0, stdout="Id\tName\tStdMode\tShape\tImgIndex\n1001\t回城石\t3\t3\t402\n"),
                   SimpleNamespace(returncode=0, stdout="Idx\tMagID\tMagName\tEffectType\tEffect\n38\t48\t群体施毒术\t2\t27\n48\t48\t气功波\t7\t36\n")]
        with patch.object(self.module.subprocess, "run", side_effect=replies) as run:
            items, skills = self.module.read_database(Path("mysql.exe"), Path("options.ini"))
        self.assertEqual(items[0]["id"], 1001)
        self.assertEqual([row["magicId"] for row in skills], [48, 48])
        for call in run.call_args_list:
            command = call.args[0]
            self.assertTrue(command[1].startswith("--defaults-extra-file="))
            self.assertEqual(command[-2], "-e")
            self.assertTrue(command[-1].startswith("SELECT "))
            self.assertFalse(any("password" in value for value in command))

    def test_database_failure_never_relays_sensitive_stderr(self):
        with patch.object(self.module.subprocess, "run", return_value=SimpleNamespace(returncode=1, stdout="", stderr="auth-secret-do-not-print")):
            with self.assertRaises(RuntimeError) as error:
                self.module.read_database(Path("mysql.exe"), Path("options.ini"))
        self.assertNotIn("auth-secret", str(error.exception))

    def test_row_comparison_preserves_missing_extra_and_changed_identities(self):
        expected = [{"idx": 38, "name": "群体施毒术", "magicId": 48}, {"idx": 48, "name": "气功波", "magicId": 48}]
        actual = [{"idx": 38, "name": "群体施毒术", "magicId": 104}, {"idx": 109, "name": "新增", "magicId": 48}]
        result = self.module.compare_rows(expected, actual, "idx", ("name", "magicId"))
        self.assertEqual(result["missing"][0]["idx"], 48)
        self.assertEqual(result["additional"][0]["idx"], 109)
        self.assertEqual(result["different"][0]["sql"]["magicId"], 48)
        self.assertEqual(result["different"][0]["database"]["magicId"], 104)
        self.assertEqual(expected[0]["magicId"], 48)

    def test_runtime_origin_requires_declaration_and_exact_fields(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "scripts").mkdir()
            (root / "scripts/install-playtest-home-stone.py").write_text('STONE_ID=1001\nSTONE_NAME="回城石"\n', encoding="utf-8")
            row = {"id": 1001, "name": "回城石", "stdMode": 3, "shape": 3, "imgIndex": 402}
            self.assertEqual(self.module.runtime_origin(row, root)["classification"], "declared_runtime_extension")
            self.assertEqual(self.module.runtime_origin(dict(row, imgIndex=0), root)["classification"], "unknown")
            self.assertEqual(self.module.runtime_origin(dict(row, id=1002), root)["classification"], "unknown")

    def test_actual_crystal_candidate_decode_never_contributes_active_coverage(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            directory = root / "candidate"
            directory.mkdir()
            # Actual Crystal v2 frame encoding, decoded by production CrystalLibrary.
            pixels = gzip.compress(bytes([0, 0, 0, 255]) * 8 * 8)
            frame = struct.pack("<hhhhhhBi", 8, 8, 0, 0, 0, 0, 0, len(pixels)) + pixels
            payload = struct.pack("<iiii", 2, 2, 16, 0) + frame
            path = directory / "Items.Lib"
            path.write_bytes(payload)
            (root / "content/classic-176").mkdir(parents=True)
            sources = self.module.load("resource_sources")
            (root / "content/classic-176/asset-sources.json").write_text(json.dumps({"itemFiles": [{"file": "Items.Lib", "bytes": len(payload), "sha256": sources.sha256(path)}]}), encoding="utf-8")
            catalog = {"items": [{"iconUrl": None, "iconIndex": index} for index in (0, 1, 2)]}
            result = self.module.candidate_coverage(directory, catalog, root)[0]
            self.assertTrue(result["lockMatched"])
            self.assertEqual(result["sourceRole"], "reference_candidate")
            self.assertEqual([value["status"] for value in result["frames"]], ["usable", "empty", "out_of_range"])
            self.assertEqual(result["decodableCandidateItems"], 1)
            self.assertEqual(result["activeCoverageContribution"], 0)
            self.assertFalse(result["selected"])
            self.assertFalse((root / "assets").exists())


if __name__ == "__main__":
    unittest.main()
