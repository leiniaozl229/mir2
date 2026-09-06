import importlib.util
import json
from pathlib import Path
import struct
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("map_tool", Path(__file__).parents[1] / "tools/map_tool.py")
maps = importlib.util.module_from_spec(spec)
spec.loader.exec_module(maps)


class ClassicMapsTest(unittest.TestCase):
    def fixture(self):
        header = struct.pack("<HH", 3, 2) + bytes(48)
        cells = [(0x8001, 2, 3, 0, 0, 0, 0, 0, 0),
                 (4, 0, 0x8005, 0x81, 6, 7, 8, 9, 10),
                 (6, 7, 8, 0, 0, 0, 0, 0, 0),
                 (0, 0, 0, 0, 0, 0, 0, 0, 0),
                 (9, 10, 11, 0, 0, 0, 0, 0, 0),
                 (12, 13, 14, 0, 0, 0, 0, 0, 0)]
        return header + b"".join(maps.CELL.pack(*cell) for cell in cells)

    def test_column_major_and_independent_collision(self):
        world = maps.ClassicMap(self.fixture())
        self.assertTrue(world.blocked(0, 0))
        self.assertTrue(world.blocked(0, 1))
        self.assertFalse(world.blocked(1, 0))
        self.assertEqual(world.cell(2, 1)[:3], (12, 13, 14))
        self.assertEqual(world.cell(0, 1)[3:], (0x81, 6, 7, 8, 9, 10))
        with self.assertRaises(IndexError):
            world.cell(-1, 0)

    def test_reject_truncated_or_unknown_variant(self):
        for raw in (b"", self.fixture()[:-1], self.fixture() + b"\0"):
            with self.assertRaises(maps.UnsupportedMap):
                maps.ClassicMap(raw)

    def test_accepts_server_ignored_legacy_tail(self):
        world = maps.ClassicMap(self.fixture() + bytes(12))
        self.assertEqual(world.trailing_bytes, 12)
        refs, blocked = world.dependencies()
        self.assertEqual(blocked, 2)
        self.assertIn(0, refs[0])

    def test_historical_tail_maps_match_server_cell_boundary(self):
        root = Path(__file__).parents[1] / 'vendor/mirserver-data/Mir200/Map'
        expected = {'EM100': (30, 35, 8040), 'T118': (30, 35, 8040),
                    'T218': (30, 30, 9840), 'T318': (30, 30, 9840)}
        for map_id, dimensions in expected.items():
            world = maps.ClassicMap((root / f'{map_id}.map').read_bytes())
            self.assertEqual((world.width, world.height, world.trailing_bytes), dimensions)

    def test_animated_front_dependencies_include_all_frames(self):
        raw = bytearray(self.fixture())
        raw[52:64] = maps.CELL.pack(0, 0, 100, 0, 0, 0x83, 1, 0, 0)
        refs, _ = maps.ClassicMap(raw).dependencies()
        self.assertTrue({99, 100, 101}.issubset(refs[2]))
        self.assertNotIn(102, refs[2])

    def test_chunks_roundtrip_including_edge_chunk(self):
        with tempfile.TemporaryDirectory() as temp:
            source, output = Path(temp) / "sample.map", Path(temp) / "web"
            source.write_bytes(self.fixture())
            manifest = maps.export(source, output, size=2)
            self.assertEqual(len(manifest["chunks"]), 2)
            reconstructed = bytearray(self.fixture()[:52] + bytes(3 * 2 * 12))
            for chunk in manifest["chunks"]:
                data = (output / chunk["file"]).read_bytes()
                for dx in range(chunk["width"]):
                    for dy in range(chunk["height"]):
                        src = (dx * chunk["height"] + dy) * 12
                        dst = 52 + ((chunk["x"] + dx) * 2 + chunk["y"] + dy) * 12
                        reconstructed[dst:dst+12] = data[src:src+12]
            self.assertEqual(bytes(reconstructed), self.fixture())
            self.assertEqual(manifest["blockedCells"], 2)
            self.assertIn(0, manifest["dependencies"]["Tiles"])
            first = (output / "map.json").read_bytes()
            maps.export(source, output, size=2)
            self.assertEqual(first, (output / "map.json").read_bytes())


if __name__ == "__main__":
    unittest.main()
