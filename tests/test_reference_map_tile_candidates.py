"""Map-version-specific Tiles.Lib data never replaces healthy national frames."""
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
    "reference_map_tile_candidates",
    ROOT / "scripts/import-reference-map-tile-candidates.py",
)
candidate = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(candidate)


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding="utf-8")


def crystal_library(path, frames):
    count = len(frames)
    payload = bytearray(struct.pack("<ii", 2, count) + bytes(count * 4))
    offsets = []
    for value in frames:
        if value is None:
            offsets.append(0)
            continue
        if isinstance(value, tuple):
            width, height, pixels = value
        else:
            width, height, pixels = 1, 1, value
        compressed = gzip.compress(pixels)
        header = struct.pack("<hhhhhhBi", width, height, 0, 0, 0, 0, 0, len(compressed))
        offsets.append(len(payload))
        payload.extend(header)
        payload.extend(compressed)
    for index, offset in enumerate(offsets):
        struct.pack_into("<i", payload, 8 + index * 4, offset)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)
    return payload


def map_cell(background=0):
    return candidate.CELL.pack(background, 0, 0, 0, 0, 0, 0, 0, 0)


class ReferenceMapTileCandidateTests(unittest.TestCase):
    def test_only_rendered_native_placeholders_with_real_candidate_tiles_bind(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            maps = root / "maps"
            cells = [map_cell(1), map_cell(1), map_cell(2), map_cell(0), map_cell(3)]
            payload = b"".join(cells)
            chunk = maps / "63" / "0-0.bin"
            chunk.parent.mkdir(parents=True)
            chunk.write_bytes(payload)
            write_json(chunk.parent / "map.json", {
                "id": "63", "format": "classic-12", "sourceSha256": "a" * 64,
                "chunks": [{"x": 0, "y": 0, "width": 5, "height": 1,
                            "file": chunk.name,
                            "sha256": hashlib.sha256(payload).hexdigest()}],
            })
            native = {
                "sourceSha256": "b" * 64, "indexSha256": "c" * 64,
                "sourceFrameCount": 4, "format": "wil-classic",
                "frames": {"0": {"width": 1, "height": 1},
                           "1": {"width": 96, "height": 64},
                           "2": {"width": 1, "height": 1}},
                "empty": [], "missing": [],
            }
            candidate_path = root / "Tiles.Lib"
            pixels = bytes((20, 30, 40, 255)) * (96 * 64)
            data = crystal_library(candidate_path, [(96, 64, pixels),
                                                    (96, 64, pixels), None,
                                                    (96, 64, pixels)])
            library = candidate.CrystalLibrary(data)
            identity = {"sourceSha256": "b" * 64, "indexSha256": "c" * 64,
                        "sourceFrameCount": 4, "format": "wil-classic"}
            references, union, bindings, unresolved_maps, unresolved_refs = candidate.collect_bindings(
                maps, native, identity, library)
            self.assertEqual(references, {"63": {0}})
            self.assertEqual(union, [0])
            self.assertEqual([binding["indices"] for binding in bindings], [[0]])
            self.assertEqual(unresolved_maps, [])
            self.assertEqual(unresolved_refs, [{"map": "63", "library": "Tiles", "index": 2,
                                                "reason": "candidate_frame_empty_or_placeholder"}])

    def test_candidate_export_preserves_offsets_and_separate_reference_provenance(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "Tiles.Lib"
            pixels = bytes((3, 5, 7, 255)) * (96 * 64)
            data = crystal_library(source, [(96, 64, pixels)])
            library = candidate.CrystalLibrary(data)
            digest = hashlib.sha256(data).hexdigest()
            manifest, stats = candidate.export_candidate(
                source, data, library, {0}, root / "out", apply=True
            )
            self.assertEqual(stats["exported"], 1)
            self.assertEqual(manifest["candidateId"], candidate.SOURCE_ID)
            self.assertEqual(manifest["role"], "reference_candidate")
            self.assertEqual(manifest["provenance"], "reference_source")
            self.assertEqual(manifest["sourceSha256"], candidate.SOURCE_SHA256)
            self.assertEqual(manifest["frames"]["0"]["sourceIndex"], 0)
            self.assertEqual(manifest["frames"]["0"]["offsetX"], 0)
            self.assertTrue((root / "out" / manifest["frames"]["0"]["file"]).is_file())
            self.assertEqual(len(digest), 64)


if __name__ == "__main__":
    unittest.main()
