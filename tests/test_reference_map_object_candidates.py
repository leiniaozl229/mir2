"""Candidate map-bank selection remains separate from verified national art."""
import hashlib
import gzip
import importlib.util
import json
from pathlib import Path
import struct
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "reference_map_object_candidates",
    ROOT / "scripts/import-reference-map-object-candidates.py",
)
candidate = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(candidate)


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding="utf-8")


def crystal_library(path, images):
    """Write a tiny Crystal-v2 fixture: image values are BGRA bytes or None."""
    count = len(images)
    table_end = 8 + count * 4
    payload = bytearray(struct.pack("<ii", 2, count) + bytes(count * 4))
    offsets = []
    for pixels in images:
        if pixels is None:
            offsets.append(0)
            continue
        compressed = gzip.compress(pixels)
        header = struct.pack("<hhhhhhBi", 1, 1, 0, 0, 0, 0, 0, len(compressed))
        offsets.append(len(payload))
        payload.extend(header)
        payload.extend(compressed)
    for index, offset in enumerate(offsets):
        struct.pack_into("<i", payload, 8 + index * 4, offset)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)
    return {"sha256": hashlib.sha256(payload).hexdigest(),
            "bytes": len(payload), "count": count}


class ReferenceMapObjectCandidateTests(unittest.TestCase):
    def make_map(self, root):
        maps = root / "maps"
        cells = [
            candidate.CELL.pack(0, 0, 1, 0, 0, 0, 0, 7, 0),
            candidate.CELL.pack(0, 0, 2, 0, 0, 2, 0, 8, 0),
            candidate.CELL.pack(0, 0, 4, 0, 0, 0, 0, 13, 0),
            candidate.CELL.pack(0, 0, 0, 0, 0, 0, 0, 14, 0),
        ]
        payload = b"".join(cells)
        chunk = maps / "63" / "0-0.fixture.bin"
        chunk.parent.mkdir(parents=True)
        chunk.write_bytes(payload)
        write_json(chunk.parent / "map.json", {
            "id": "63", "format": "classic-12", "sourceSha256": "a" * 64,
            "chunks": [{"x": 0, "y": 0, "width": 4, "height": 1,
                        "file": chunk.name, "sha256": hashlib.sha256(payload).hexdigest()}],
        })
        return maps, chunk

    def test_map_and_animation_dependencies_are_hash_bound_by_exact_area(self):
        with tempfile.TemporaryDirectory() as temporary:
            maps, _ = self.make_map(Path(temporary))
            refs, bindings, unresolved, counts = candidate.collect_references(maps)
            self.assertEqual(unresolved, [])
            self.assertEqual(refs["Objects8"], {0: {"63"}})
            self.assertEqual(refs["Objects9"], {1: {"63"}, 2: {"63"}})
            self.assertEqual(refs["Objects14"], {3: {"63"}})
            self.assertEqual(len(bindings), 3)
            self.assertTrue(all(binding["mapSourceSha256"] == "a" * 64 for binding in bindings))
            self.assertTrue(all(binding["mapVersionPairingVerified"] is False for binding in bindings))
            self.assertEqual(counts, {7: 1, 8: 1, 13: 1})

    def test_source_locks_and_frame_counts_fail_closed(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data, locks = root / "sources", {}
            pixels = bytes((1, 2, 3, 255))
            for name in candidate.SOURCE_IDS:
                locks[name] = crystal_library(data / f"{name}.Lib", [pixels, None])
            loaded = candidate.load_candidate_sources(data, locks)
            self.assertEqual(set(loaded), set(candidate.SOURCE_IDS))
            broken = dict(locks)
            broken["Objects8"] = {**locks["Objects8"], "sha256": "0" * 64}
            with self.assertRaisesRegex(ValueError, "candidate source hash mismatch: Objects8"):
                candidate.load_candidate_sources(data, broken)

    def test_candidate_export_keeps_empty_frames_explicit_and_uses_separate_role(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "Objects8.Lib"
            lock = crystal_library(source, [bytes((10, 20, 30, 255)), None])
            data = source.read_bytes()
            library = candidate.CrystalLibrary(data)
            manifest, stats = candidate.export_library(
                "Objects8", source, lock["sha256"], library, {0, 1}, root / "out", apply=True
            )
            self.assertEqual(stats["exported"], 1)
            self.assertEqual(stats["empty"], [1])
            self.assertEqual(manifest["role"], "reference_candidate")
            self.assertEqual(manifest["provenance"], "reference_source")
            self.assertEqual(manifest["sourceSha256"], lock["sha256"])
            self.assertEqual(set(manifest["frames"]), {"0"})
            self.assertEqual(manifest["empty"], [1])

    def test_unavailable_area_and_changed_chunk_never_produce_bindings(self):
        with tempfile.TemporaryDirectory() as temporary:
            maps, chunk = self.make_map(Path(temporary))
            # The fourth fixture cell has area 14 but no source was selected for it.
            refs, bindings, unresolved, _ = candidate.collect_references(maps)
            self.assertEqual(unresolved, [])
            self.assertTrue(all(binding["area"] != 14 for binding in bindings))
            chunk.write_bytes(chunk.read_bytes() + b"tampered")
            refs, bindings, unresolved, _ = candidate.collect_references(maps)
            self.assertEqual(bindings, [])
            self.assertEqual(unresolved, [{"map": "63", "reason": "map_chunk_identity_or_size_mismatch"}])

    def test_apply_preflights_bad_map_chunks_before_writing_candidate_output(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source_dir = root / "sources"
            locks = {}
            pixels = bytes((1, 2, 3, 255))
            for name in candidate.SOURCE_IDS:
                locks[name] = crystal_library(source_dir / f"{name}.Lib", [pixels] * 4)
            maps, chunk = self.make_map(root)
            chunk.write_bytes(chunk.read_bytes() + b"tampered")
            output, contract_path = root / "out", root / "map-object-candidates.json"
            previous_locks = candidate.SOURCE_LOCKS
            candidate.SOURCE_LOCKS = locks
            try:
                report = candidate.run_import(source_dir, maps, output, contract_path, apply=True)
            finally:
                candidate.SOURCE_LOCKS = previous_locks
            self.assertEqual(report["status"], "unresolved")
            self.assertFalse(output.exists())
            self.assertFalse(contract_path.exists())


if __name__ == "__main__":
    unittest.main()
