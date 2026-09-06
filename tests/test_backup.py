import importlib.util
from pathlib import Path
import tempfile
import unittest


SPEC = importlib.util.spec_from_file_location(
    "mir2_backup", Path(__file__).parents[1] / "scripts/backup.py"
)
backup = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(backup)


class BackupTests(unittest.TestCase):
    def test_rejects_archive_traversal(self):
        for name in ("../database.sql", "/tmp/database.sql", "files/../../escape"):
            with self.subTest(name=name), self.assertRaises(ValueError):
                backup.validate_member_name(name)

    def test_hashes_complete_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "state.bin"
            path.write_bytes(b"mir2-save-state")
            self.assertEqual(
                backup.sha256(path),
                "47556c8b4c381a5c031a6bb587ccf92dfa56d0f9494bc30a9d1d821e212afdc8",
            )


if __name__ == "__main__":
    unittest.main()
