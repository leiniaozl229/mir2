"""MAP btArea selects a hash-locked native Objects library, never a guessed frame."""
import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "national_map_object_banks", ROOT / "scripts/import-national-map-object-banks.py"
)
importer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(importer)


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding="utf-8")


def source_fixture(directory, name):
    header = bytearray(56)
    header[:36] = b"#ILIB v1.0-WEMADE Entertainment inc."
    struct.pack_into("<i", header, 44, 3)
    struct.pack_into("<i", header, 48, 256)
    struct.pack_into("<i", header, 52, 1024)
    palette = bytearray(1024)
    palette[4:8] = bytes((0, 0, 128, 0))
    first = struct.pack("<hhhh", 2, 2, -3, 4) + bytes((1, 1, 0, 0))
    second = struct.pack("<hhhh", 1, 1, 6, -7) + bytes((1,))
    data = header + palette + first + second
    offsets = [1080, 0, 1080 + len(first)]
    source, index = directory / f"{name}.wil", directory / f"{name}.wix"
    source.write_bytes(data)
    index.write_bytes(bytes(48) + struct.pack(f"<{len(offsets)}i", *offsets))
    return {"sourceSha256": hashlib.sha256(data).hexdigest(),
            "indexSha256": hashlib.sha256(index.read_bytes()).hexdigest()}


class NationalMapObjectBankTests(unittest.TestCase):
    def prepare(self, root):
        data, output, maps = root / "Data", root / "libraries", root / "maps"
        data.mkdir()
        locks = {name: source_fixture(data, name) for name in importer.LIBRARIES}
        cells = []
        for front, area, animation in [(1, 1, 2), (3, 2, 0), (1, 14, 0), (3, 255, 0)]:
            cells.append(struct.pack("<HHHBBBBBB", 0, 0, front, 4, 5, animation, 0, area, 0))
        payload = b"".join(cells)
        chunk_path = maps / "0" / "0-0.hash.bin"
        chunk_path.parent.mkdir(parents=True)
        chunk_path.write_bytes(payload)
        write_json(chunk_path.parent / "map.json", {
            "id": "0", "format": "classic-12", "sourceSha256": "a" * 64,
            "dependencies": {"Tiles": [], "SmTiles": [], "Objects": [0, 1, 2]},
            "chunks": [{"x": 0, "y": 0, "width": 4, "height": 1,
                        "file": chunk_path.name, "sha256": hashlib.sha256(payload).hexdigest()}],
        })
        profile = root / "profile.json"
        write_json(profile, {"id": "fixture", "p0Baseline": {"maps": ["0"]}})
        return data, profile, maps, output, locks

    def test_area_selects_separate_libraries_and_reports_absent_later_bank(self):
        with tempfile.TemporaryDirectory() as temporary:
            prepared = self.prepare(Path(temporary))
            data, profile, maps, output, locks = prepared
            report = importer.run_import(data, profile, maps, output, source_locks=locks)
            banks = {item["name"]: item for item in report["families"]}
            self.assertEqual(banks["Objects2"]["requestedIndices"], [0, 1])
            self.assertEqual(banks["Objects3"]["requestedIndices"], [2])
            self.assertEqual(report["unavailableObjectBanks"], [{
                "area": 14, "expectedLibrary": "Objects15", "references": 1, "maps": ["0"]
            }])
            self.assertEqual(report["status"], "unresolved")
            self.assertFalse(output.exists(), "planning must not write assets")

    def test_apply_exports_per_bank_with_source_identity_and_keeps_partial_status(self):
        with tempfile.TemporaryDirectory() as temporary:
            prepared = self.prepare(Path(temporary))
            data, profile, maps, output, locks = prepared
            report = importer.run_import(data, profile, maps, output, apply=True, source_locks=locks)
            bank2 = importer.read_json(output / "Objects2/library.json")
            bank3 = importer.read_json(output / "Objects3/library.json")
            self.assertEqual(set(bank2["frames"]), {"0"})
            self.assertEqual(set(bank3["frames"]), {"2"})
            self.assertEqual(bank2["nationalMapObjectBankImport"]["areaByteOffset"], 10)
            self.assertEqual(bank2["nationalMapObjectBankImport"]["libraryIndex"], 1)
            self.assertEqual(bank3["nationalMapObjectBankImport"]["libraryIndex"], 2)
            self.assertEqual(report["totals"]["exported"], 2)
            self.assertFalse(report["complete"], "missing Objects15 must stay visible")

    def test_changed_chunk_hash_is_rejected_before_output(self):
        with tempfile.TemporaryDirectory() as temporary:
            prepared = self.prepare(Path(temporary))
            data, profile, maps, output, locks = prepared
            chunk = maps / "0/0-0.hash.bin"
            chunk.write_bytes(chunk.read_bytes() + b"changed")
            report = importer.run_import(data, profile, maps, output, apply=True, source_locks=locks)
            self.assertEqual(report["unresolvedMaps"], [{
                "map": "0", "reason": "map_chunk_identity_or_size_mismatch"
            }])
            self.assertFalse(output.exists())

    def test_wrong_source_hash_refuses_to_touch_asset_output(self):
        with tempfile.TemporaryDirectory() as temporary:
            prepared = self.prepare(Path(temporary))
            data, profile, maps, output, locks = prepared
            locks["Objects4"]["sourceSha256"] = "0" * 64
            with self.assertRaisesRegex(ValueError, "source version mismatch: Objects4"):
                importer.run_import(data, profile, maps, output, apply=True, source_locks=locks)
            self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
