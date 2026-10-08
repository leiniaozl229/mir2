"""National MAP imports preserve source identity and report incomplete coverage."""
import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "national_map_import", ROOT / "scripts/import-national-map-assets.py"
)
importer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(importer)


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding="utf-8")


def source_fixture(directory, name, malformed=False):
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
    offsets = [1080, 0, -1 if malformed else 1080 + len(first)]
    if not malformed:
        offsets.append(len(data) + 8)  # Real-client terminal WIX offset.
    source, index = directory / f"{name}.wil", directory / f"{name}.wix"
    source.write_bytes(data)
    index.write_bytes(bytes(48) + struct.pack(f"<{len(offsets)}i", *offsets))
    return {"sourceSha256": hashlib.sha256(data).hexdigest(),
            "indexSha256": hashlib.sha256(index.read_bytes()).hexdigest()}


class NationalMapImportTests(unittest.TestCase):
    def prepare(self, root, dependencies=None, maps=("0", "D001"), malformed=False):
        data, output = root / "Data", root / "libraries"
        data.mkdir()
        locks = {name: source_fixture(data, name, malformed) for name in importer.FAMILIES}
        profile, maps_dir = root / "profile.json", root / "maps"
        write_json(profile, {"id": "classic-test", "p0Baseline": {"maps": list(maps)}})
        dependencies = dependencies or {"Tiles": [0, 1, 2, 8], "SmTiles": [2], "Objects": [0, 2]}
        for map_id in maps:
            write_json(maps_dir / map_id / "map.json",
                       {"id": map_id, "format": "classic-12",
                        "sourceSha256": "a" * 64, "dependencies": dependencies})
        return data, profile, maps_dir, output, locks

    def run_fixture(self, prepared, *, apply=False, map_ids=None):
        data, profile, maps_dir, output, locks = prepared
        return importer.run_import(data, profile, maps_dir, output, apply=apply,
                                   map_ids=map_ids, source_locks=locks)

    def test_dependency_plan_deduplicates_maps_and_keeps_source_outliers(self):
        with tempfile.TemporaryDirectory() as temporary:
            prepared = self.prepare(Path(temporary))
            report = self.run_fixture(prepared)
            tiles = report["families"][0]
            self.assertEqual(tiles["requestedIndices"], [0, 1, 2, 8])
            self.assertEqual(tiles["exportableIndices"], [0, 2])
            self.assertEqual(tiles["emptyIndices"], [1])
            self.assertEqual(tiles["unresolved"],
                             [{"index": 8, "reason": "out_of_source_range",
                               "sourceFrameCount": 3, "maps": ["0", "D001"]}])
            self.assertEqual(report["totals"]["requestedUnique"], 7)
            self.assertEqual(report["totals"]["unresolved"], 1)
            self.assertEqual(report["status"], "unresolved")
            self.assertFalse(report["complete"])
            self.assertFalse(prepared[3].exists(), "plan must not create assets")

    def test_apply_preserves_original_offsets_pixels_hashes_and_terminal_diagnostic(self):
        with tempfile.TemporaryDirectory() as temporary:
            prepared = self.prepare(Path(temporary))
            report = self.run_fixture(prepared, apply=True)
            manifest = importer.read_json(prepared[3] / "Tiles/library.json")
            frame = manifest["frames"]["0"]
            self.assertEqual(frame["index"], 0)
            self.assertEqual(frame["sourceIndex"], 0)
            self.assertEqual((frame["offsetX"], frame["offsetY"]), (-3, 4))
            self.assertEqual(frame["sourceSha256"], prepared[4]["Tiles"]["sourceSha256"])
            self.assertEqual(frame["indexSha256"], prepared[4]["Tiles"]["indexSha256"])
            png = (prepared[3] / "Tiles" / frame["file"]).read_bytes()
            self.assertEqual(frame["sha256"], hashlib.sha256(png).hexdigest())
            self.assertEqual(manifest["sourceFrameCount"], 3)
            self.assertEqual(manifest["rawIndexEntries"], 4)
            self.assertEqual(len(manifest["discardedTrailingOffsets"]), 1)
            self.assertEqual(manifest["empty"], [1])
            self.assertEqual(manifest["missing"], [8])
            self.assertEqual(report["totals"]["exported"], 5)
            self.assertFalse(report["complete"])

    def test_incremental_merge_retains_old_frames_files_and_unrelated_metadata(self):
        with tempfile.TemporaryDirectory() as temporary:
            prepared = self.prepare(Path(temporary))
            write_json(prepared[2] / "0/map.json",
                       {"id": "0", "format": "classic-12",
                        "dependencies": {"Tiles": [0], "SmTiles": [], "Objects": []}})
            self.run_fixture(prepared, apply=True, map_ids=["0"])
            manifest_path = prepared[3] / "Tiles/library.json"
            previous = importer.read_json(manifest_path)
            previous["localAnnotation"] = "retained"
            write_json(manifest_path, previous)
            old_bytes = {
                frame["file"]: (prepared[3] / "Tiles" / frame["file"]).read_bytes()
                for frame in previous["frames"].values()
            }
            # The new profile no longer references the previously exported 0.
            write_json(prepared[2] / "0/map.json",
                       {"id": "0", "format": "classic-12",
                        "dependencies": {"Tiles": [2], "SmTiles": [], "Objects": []}})
            report = self.run_fixture(prepared, apply=True, map_ids=["0"])
            merged = importer.read_json(manifest_path)
            self.assertEqual(merged["frames"]["0"], previous["frames"]["0"])
            self.assertIn("2", merged["frames"])
            self.assertEqual(merged["localAnnotation"], "retained")
            self.assertEqual(report["totals"]["exported"], 1)
            self.assertFalse(report["complete"], "a subset cannot claim whole-profile completion")
            for filename, raw in old_bytes.items():
                self.assertEqual((prepared[3] / "Tiles" / filename).read_bytes(), raw)

    def test_source_mismatch_preflights_every_family_before_writing(self):
        with tempfile.TemporaryDirectory() as temporary:
            prepared = self.prepare(Path(temporary))
            source = prepared[0] / "Objects.wil"
            source.write_bytes(source.read_bytes() + b"another-version")
            with self.assertRaisesRegex(ValueError, "source version mismatch: Objects"):
                self.run_fixture(prepared, apply=True)
            self.assertFalse(prepared[3].exists())

    def test_existing_other_source_is_retained_and_rejected_before_output(self):
        with tempfile.TemporaryDirectory() as temporary:
            prepared = self.prepare(Path(temporary))
            target = prepared[3] / "Objects/library.json"
            write_json(target, {"format": "wil-classic", "sourceSha256": "b" * 64,
                                "indexSha256": prepared[4]["Objects"]["indexSha256"],
                                "frames": {}, "empty": [], "missing": []})
            before = target.read_bytes()
            with self.assertRaisesRegex(ValueError, "another source"):
                self.run_fixture(prepared, apply=True)
            self.assertEqual(target.read_bytes(), before)
            self.assertFalse((prepared[3] / "Tiles").exists())

    def test_missing_map_is_unresolved_instead_of_silently_reducing_profile(self):
        with tempfile.TemporaryDirectory() as temporary:
            prepared = self.prepare(Path(temporary))
            (prepared[2] / "D001/map.json").unlink()
            report = self.run_fixture(prepared, apply=True)
            self.assertEqual(report["requestedMapCount"], 2)
            self.assertEqual(len(report["maps"]), 1)
            self.assertEqual(report["unresolvedMaps"],
                             [{"map": "D001", "reason": "map_manifest_missing"}])
            self.assertFalse(report["complete"])

    def test_corrupted_or_missing_png_is_repaired_without_deleting_old_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            prepared = self.prepare(Path(temporary))
            self.run_fixture(prepared, apply=True)
            manifest = importer.read_json(prepared[3] / "Tiles/library.json")
            frame = manifest["frames"]["2"]
            path = prepared[3] / "Tiles" / frame["file"]
            path.write_bytes(b"corrupted png")
            orphan = prepared[3] / "Tiles/unreferenced-old.png"
            orphan.write_bytes(b"retained orphan")
            report = self.run_fixture(prepared, apply=True)
            self.assertEqual(report["families"][0]["repairIndices"], [2])
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), frame["sha256"])
            self.assertEqual(orphan.read_bytes(), b"retained orphan")

    def test_malformed_source_frame_remains_unresolved_and_other_frames_export(self):
        with tempfile.TemporaryDirectory() as temporary:
            prepared = self.prepare(Path(temporary), malformed=True)
            report = self.run_fixture(prepared, apply=True)
            tiles = report["families"][0]
            self.assertEqual(tiles["exportedIndices"], [0])
            problems = {entry["index"]: entry["reason"] for entry in tiles["unresolved"]}
            self.assertEqual(problems, {2: "source_frame_decode_error", 8: "out_of_source_range"})
            self.assertEqual(importer.read_json(prepared[3] / "Tiles/library.json")["missing"], [2, 8])
            self.assertFalse(report["complete"])

    def test_existing_empty_conflict_is_diagnosed_without_removing_its_index(self):
        with tempfile.TemporaryDirectory() as temporary:
            prepared = self.prepare(Path(temporary))
            self.run_fixture(prepared, apply=True)
            path = prepared[3] / "Tiles/library.json"
            manifest = importer.read_json(path)
            stale = {"index": 1, "file": "old-missing.png", "sha256": "0" * 64}
            manifest["frames"]["1"] = stale
            write_json(path, manifest)
            report = self.run_fixture(prepared, apply=True)
            self.assertEqual(importer.read_json(path)["frames"]["1"], stale)
            problems = {entry["index"]: entry["reason"]
                        for entry in report["families"][0]["unresolved"]}
            self.assertEqual(problems[1], "existing_frame_conflicts_with_source_empty")
            self.assertFalse(report["complete"])

    def test_full_profile_can_complete_only_when_all_dependencies_are_proven(self):
        with tempfile.TemporaryDirectory() as temporary:
            prepared = self.prepare(Path(temporary),
                                    dependencies={"Tiles": [0, 1, 2], "SmTiles": [2], "Objects": [0]})
            planned = self.run_fixture(prepared)
            self.assertEqual(planned["status"], "planned")
            self.assertFalse(planned["complete"])
            applied = self.run_fixture(prepared, apply=True)
            self.assertEqual(applied["status"], "imported")
            self.assertTrue(applied["complete"])
            repeated = self.run_fixture(prepared, apply=True)
            self.assertEqual(repeated["totals"]["exported"], 0)
            self.assertTrue(repeated["complete"])

    def test_invalid_map_dependencies_and_outside_profile_requests_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            prepared = self.prepare(Path(temporary))
            with self.assertRaisesRegex(ValueError, "subset"):
                self.run_fixture(prepared, map_ids=["D999"])
            write_json(prepared[2] / "0/map.json",
                       {"id": "0", "format": "classic-12",
                        "dependencies": {"Tiles": [-1], "SmTiles": [], "Objects": []}})
            with self.assertRaisesRegex(ValueError, "invalid Tiles dependencies"):
                self.run_fixture(prepared, apply=True)
            self.assertFalse(prepared[3].exists())


if __name__ == "__main__":
    unittest.main()
