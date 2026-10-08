"""Exercise the real candidate exporter, keeping production selection unbound."""
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("ga0_export", ROOT / "tools/export_ga0_tiles_candidate.py")
exporter = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(exporter)


class Ga0CandidateExportTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        pixels = bytes((0, 0, 0, 0, 0, 0, 128, 255))
        compressed = gzip.compress(pixels, mtime=0)
        frame = struct.pack("<hhhhhhBi", 2, 1, -3, 4, 0, 0, 0, len(compressed)) + compressed
        data = struct.pack("<iiii", 2, 2, 16, 0) + frame
        self.source = self.root / "Tiles.Lib"; self.source.write_bytes(data)
        self.lock = dict(file="Tiles.Lib", url="https://example.invalid/Tiles.Lib", bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
        self.context = dict(candidateLock=self.lock, map=dict(id="GA0", sha256=exporter.GA0_SHA256, missingIndices=[0]),
            candidate=dict(sourceIdentityVerified=True, indexCoverageComplete=True, frames=[dict(sourceIndex=0)],
                sharedComparisonSummary=dict(exact=123, different=2), sharedIndexComparison=[dict(sourceIndex=9, status="different"), dict(sourceIndex=14, status="different")]))

    def plan(self):
        return exporter.plan_export(self.source, self.context, self.root)

    def test_default_plan_creates_no_asset_or_registration(self):
        plan = self.plan()
        self.assertEqual(len(plan["writes"]), 3)
        self.assertFalse((self.root / "assets").exists())
        self.assertFalse((self.root / "content").exists())
        self.assertFalse(plan["registry"]["mapBindingActive"])
        self.assertFalse(plan["registry"]["mapVersionPairingVerified"])

    def test_apply_preserves_pixels_alpha_index_offsets_and_separate_namespace(self):
        plan = self.plan()
        self.assertEqual(len(exporter.apply_plan(plan)), 3)
        proof = exporter.verify_exports(plan, self.source)
        self.assertEqual(proof, [dict(index=0, pixelExact=True, alphaExact=True, geometryExact=True)])
        frame = plan["manifest"]["frames"]["0"]
        self.assertEqual((frame["sourceIndex"], frame["offsetX"], frame["offsetY"]), (0, -3, 4))
        self.assertFalse((self.root / "assets/web/libraries/Tiles").exists())
        self.assertEqual(plan["manifest"]["provenance"], "reference_source")
        self.assertEqual(plan["registry"]["namespace"], "/libraries/reference-ga0/Tiles")
        self.assertFalse(plan["manifest"]["mapBindingActive"])

    def test_repeat_plan_and_apply_write_nothing(self):
        first = self.plan(); exporter.apply_plan(first)
        again = self.plan()
        self.assertEqual(again["writes"], [])
        self.assertEqual(len(again["unchanged"]), 3)
        self.assertEqual(exporter.apply_plan(again), [])

    def test_conflicting_existing_file_is_preserved_without_partial_output(self):
        plan = self.plan()
        frame_path = next(path for path in plan["files"] if path.suffix == ".png")
        frame_path.parent.mkdir(parents=True); frame_path.write_bytes(b"existing unknown pixel")
        with self.assertRaises(ValueError): self.plan()
        self.assertEqual(frame_path.read_bytes(), b"existing unknown pixel")
        self.assertFalse((frame_path.parent / "library.json").exists())

    def test_plan_apply_race_is_detected_before_writes(self):
        plan = self.plan()
        frame_path = next(path for path in plan["files"] if path.suffix == ".png")
        frame_path.parent.mkdir(parents=True); frame_path.write_bytes(b"changed after plan")
        with self.assertRaises(ValueError): exporter.apply_plan(plan)
        self.assertFalse((frame_path.parent / "library.json").exists())

    def test_native_source_lock_and_exact_missing_indices_are_mandatory(self):
        self.lock["sha256"] = "b" * 64
        with self.assertRaises(ValueError): self.plan()
        self.lock["sha256"] = hashlib.sha256(self.source.read_bytes()).hexdigest()
        self.context["map"]["sha256"] = "c" * 64
        with self.assertRaises(ValueError): self.plan()
        self.context["map"]["sha256"] = exporter.GA0_SHA256
        self.context["map"]["missingIndices"] = [0, 1]
        with self.assertRaises(ValueError): self.plan()
        self.assertFalse((self.root / "assets").exists())

    def test_empty_index_cannot_be_exported_by_a_false_coverage_claim(self):
        self.context["map"]["missingIndices"] = [1]
        self.context["candidate"]["frames"] = [dict(sourceIndex=1)]
        with self.assertRaises(ValueError): self.plan()
        self.assertFalse((self.root / "assets").exists())

    def test_source_mutation_invalidates_verification(self):
        plan = self.plan(); exporter.apply_plan(plan)
        raw = self.source.read_bytes(); self.source.write_bytes(raw[:-1] + bytes([raw[-1] ^ 1]))
        with self.assertRaises(ValueError): exporter.verify_exports(plan, self.source)

    def test_png_crc_and_metadata_tampering_are_detected(self):
        plan = self.plan(); exporter.apply_plan(plan)
        frame = plan["manifest"]["frames"]["0"]
        path = self.root / "assets/web/libraries/reference-ga0/Tiles" / frame["file"]
        raw = path.read_bytes(); path.write_bytes(raw[:-1] + bytes([raw[-1] ^ 1]))
        with self.assertRaises(ValueError): exporter.verify_exports(plan, self.source)
        path.write_bytes(raw)
        frame["offsetX"] = 3
        with self.assertRaises(ValueError): exporter.verify_exports(plan, self.source)


if __name__ == "__main__":
    unittest.main()
