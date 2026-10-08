"""Regression for private probe cleanup boundaries; never starts MySQL or the engine."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("mining_cleanup", ROOT / "tools/cleanup_mining_probe.py")
cleanup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cleanup)


class MiningCleanupTests(unittest.TestCase):
    def fixture(self):
        return {"account": "m0123abcd", "character": "M0123abcd", "password": "private-test-value"}

    def test_foreign_accounts_characters_and_duplicates_are_rejected(self):
        cleanup.validate_fixtures({"fixtures": [self.fixture()]})
        for fixtures in (
            [{"account": "existing", "character": "Existing"}],
            [{"account": "m0123abcd", "character": "Existing"}],
            [self.fixture(), self.fixture()],
        ):
            with self.subTest(fixtures=fixtures), self.assertRaises(ValueError):
                cleanup.validate_fixtures({"fixtures": fixtures})

    def test_plan_never_accesses_database_or_discloses_private_manifest(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".runtime").mkdir()
            original = json.dumps({"fixtures": [self.fixture()]})
            (root / ".runtime/mining-fixtures.json").write_text(original, encoding="utf-8")
            output = io.StringIO()
            with patch.object(cleanup, "ROOT", root), patch.object(sys, "argv", ["cleanup"]), \
                 patch.object(cleanup.subprocess, "run") as run, contextlib.redirect_stdout(output):
                cleanup.main()
            run.assert_not_called()
            self.assertNotIn("private-test-value", output.getvalue())
            self.assertNotIn("m0123abcd", output.getvalue())
            self.assertEqual((root / ".runtime/mining-fixtures.json").read_text(encoding="utf-8"), original)

    def test_apply_requires_normal_shutdown_before_any_database_access(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".runtime").mkdir()
            (root / ".runtime/mining-fixtures.json").write_text(json.dumps({"fixtures": [self.fixture()]}), encoding="utf-8")
            (root / ".runtime/native-server.json").write_text('{"status":"running"}', encoding="utf-8")
            with patch.object(cleanup, "ROOT", root), patch.object(sys, "argv", ["cleanup", "--apply"]), \
                 patch.object(cleanup.subprocess, "run") as run, self.assertRaises(SystemExit):
                cleanup.main()
            run.assert_not_called()

    def test_all_account_ownership_is_checked_before_delete_transaction(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".runtime").mkdir()
            fixture2 = {"account": "m9999abcd", "character": "M9999abcd", "password": "private-test-value"}
            original = json.dumps({"fixtures": [self.fixture(), fixture2]})
            (root / ".runtime/mining-fixtures.json").write_text(original, encoding="utf-8")
            (root / ".runtime/native-server.json").write_text('{"status":"stopped"}', encoding="utf-8")
            sql = []

            def fake_run(*args, **kwargs):
                sql.append(kwargs["input"].decode("utf-8"))
                return type("Result", (), {"returncode": 0, "stdout": b"0" if len(sql) == 1 else b"1"})()

            with patch.object(cleanup, "ROOT", root), patch.object(sys, "argv", ["cleanup", "--apply"]), \
                 patch.object(cleanup.subprocess, "run", side_effect=fake_run), self.assertRaises(SystemExit):
                cleanup.main()
            self.assertEqual(len(sql), 2)
            self.assertTrue(all(statement.startswith("SELECT ") for statement in sql))
            self.assertEqual((root / ".runtime/mining-fixtures.json").read_text(encoding="utf-8"), original)


if __name__ == "__main__":
    unittest.main()
