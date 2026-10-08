"""Candidate decode coverage never authorizes production map source changes."""
import gzip
import hashlib
import importlib.util
import io
from pathlib import Path
import struct
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("ga0_candidate", ROOT / "tools/ga0_tiles_candidate_audit.py")
candidate = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(candidate)


def crystal_fixture(directory, pixels=None, corrupt=False):
    pixels = pixels or bytes((0, 0, 0, 0, 0, 0, 128, 255))
    compressed = gzip.compress(pixels, mtime=0)
    if corrupt:
        compressed = b"not-gzip"
    frame = struct.pack("<hhhhhhBi", 2, 1, -3, 4, 0, 0, 0, len(compressed)) + compressed
    data = struct.pack("<iiii", 2, 2, 16, 0) + frame
    path = directory / "Tiles.Lib"; path.write_bytes(data)
    return path, dict(file="Tiles.Lib", url="https://example.invalid/locked/Tiles.Lib", bytes=len(data),
                      sha256=hashlib.sha256(data).hexdigest())


class CandidateAuditTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)

    def test_count_and_successful_decode_never_prove_map_pairing(self):
        path, lock = crystal_fixture(self.root)
        report = candidate.inspect_candidate(path, lock, [0])
        self.assertTrue(report["sourceIdentityVerified"])
        self.assertTrue(report["indexCoverageComplete"])
        self.assertEqual(report["coverage"], {"usable": 1})
        self.assertEqual(report["frames"][0]["offsetX"], -3)
        self.assertFalse(report["mapVersionPairingVerified"])
        self.assertFalse(report["activationRecommended"])

    def test_original_index_empty_and_out_of_range_are_distinct(self):
        path, lock = crystal_fixture(self.root)
        report = candidate.inspect_candidate(path, lock, [0, 1, 10320, 10320])
        self.assertEqual(report["coverage"], {"usable": 1, "empty": 1, "out_of_source_range": 1})
        self.assertEqual([row["sourceIndex"] for row in report["frames"]], [0, 1, 10320])
        self.assertFalse(report["indexCoverageComplete"])

    def test_identity_mismatch_prevents_decoding(self):
        path, lock = crystal_fixture(self.root)
        lock["sha256"] = "a" * 64
        report = candidate.inspect_candidate(path, lock, [0])
        self.assertFalse(report["sourceIdentityVerified"])
        self.assertEqual(report["frames"], [])
        self.assertEqual(report["error"], "candidate_source_lock_mismatch")

    def test_corrupt_gzip_is_not_reclassified_empty(self):
        path, lock = crystal_fixture(self.root, corrupt=True)
        report = candidate.inspect_candidate(path, lock, [0])
        self.assertEqual(report["coverage"], {"decode_error": 1})
        self.assertFalse(report["indexCoverageComplete"])

    def test_transparent_only_frame_does_not_close_missing_coverage(self):
        path, lock = crystal_fixture(self.root, pixels=bytes(8))
        report = candidate.inspect_candidate(path, lock, [0])
        self.assertEqual(report["coverage"], {"transparent_only": 1})
        self.assertFalse(report["indexCoverageComplete"])

    def test_shared_native_geometry_and_pixels_are_compared_independently(self):
        path, lock = crystal_fixture(self.root)
        class Native:
            def frame(self, index):
                return dict(width=2, height=1, offsetX=-3, offsetY=4, pixels=bytes(8))
        report = candidate.inspect_candidate(path, lock, [0], Native(), [0])
        row = report["sharedIndexComparison"][0]
        self.assertTrue(row["geometryMatch"])
        self.assertFalse(row["pixelsMatch"])
        self.assertEqual(row["status"], "different")
        self.assertFalse(report["mapVersionPairingVerified"])

    def test_download_bytes_and_hash_lock_before_publishing_staged_file(self):
        path, lock = crystal_fixture(self.root)
        source_bytes = path.read_bytes()
        staging = self.root / "staging"
        recorded = []
        def opener(request, timeout):
            recorded.append((request.full_url, request.get_header("User-agent"), timeout))
            return io.BytesIO(source_bytes)
        exported, evidence = candidate.fetch_locked(lock, staging, opener)
        self.assertEqual(exported.read_bytes(), source_bytes)
        self.assertFalse(evidence["reused"])
        self.assertEqual(recorded[0], (lock["url"], "Mir2AssetAudit/1.0", 60))
        same, reused = candidate.fetch_locked(lock, staging, opener)
        self.assertTrue(reused["reused"])
        self.assertEqual(same, exported)
        self.assertEqual(len(recorded), 1)

    def test_bad_download_is_isolated_and_never_overwrites_existing_candidate(self):
        _, lock = crystal_fixture(self.root)
        staging = self.root / "staging"
        with self.assertRaises(ValueError):
            candidate.fetch_locked(lock, staging, lambda request, timeout: io.BytesIO(b"wrong"))
        self.assertFalse((staging / "Tiles.Lib").exists())
        self.assertEqual(len(list(staging.glob("*.unverified"))), 1)
        (staging / "Tiles.Lib").write_bytes(b"existing unknown resource")
        with self.assertRaises(ValueError):
            candidate.fetch_locked(lock, staging, lambda request, timeout: io.BytesIO(b"wrong"))
        self.assertEqual((staging / "Tiles.Lib").read_bytes(), b"existing unknown resource")

    def test_download_cannot_use_another_source_or_escape_candidate_directory(self):
        _, lock = crystal_fixture(self.root)
        lock["file"] = "../Tiles.Lib"
        with self.assertRaises(ValueError):
            candidate.fetch_locked(lock, self.root / "staging")
        self.assertFalse((self.root / "staging").exists())

    def test_scan_lists_real_files_without_changing_them(self):
        path, _ = crystal_fixture(self.root)
        before = path.read_bytes()
        report = candidate.scan_local([self.root])
        self.assertEqual(len(report[0]["matches"]), 1)
        self.assertEqual(path.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
