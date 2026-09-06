import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest
import zlib


ROOT = Path(__file__).resolve().parents[1]
import sys
sys.path.insert(0, str(ROOT / "tools"))
from wil_lib import WeMadeLibrary, export


def classic_wil_fixture(directory):
    palette = bytearray(60)
    struct.pack_into("<i", palette, 48, 256)
    struct.pack_into("<i", palette, 56, 0)
    for number in range(1, 256):
        palette.extend(bytes((number, 20, 40, 0)))
    image_offset = len(palette)
    image = struct.pack("<hhhh", 2, 1, -3, 4) + bytes((0, 1))
    (directory / "Prguse.wil").write_bytes(palette + image)
    (directory / "Prguse.wix").write_bytes(bytes(48) + struct.pack("<i", image_offset))
    return directory / "Prguse.wil"


def original_wil_fixture(directory, trailing_offset=False):
    header = bytearray(56)
    header[:36] = b"#ILIB v1.0-WEMADE Entertainment inc."
    struct.pack_into("<i", header, 44, 1)
    struct.pack_into("<i", header, 48, 256)
    struct.pack_into("<i", header, 52, 1024)
    palette = bytearray(256 * 4)
    palette[4:8] = bytes((0, 0, 128, 0))
    image_offset = len(header) + len(palette)
    image = struct.pack("<hhhh", 2, 2, -3, 4) + bytes((1, 1, 0, 0))
    (directory / "Original.wil").write_bytes(header + palette + image)
    offsets = [image_offset]
    if trailing_offset:
        offsets.append(image_offset + len(image) + 8)
    index = bytearray(48)
    index[:36] = b"#INDX v1.0-WEMADE Entertainment inc."
    struct.pack_into("<i", index, 44, len(offsets))
    (directory / "Original.wix").write_bytes(index + struct.pack(f"<{len(offsets)}i", *offsets))
    return directory / "Original.wil"


def classic_wzl_fixture(directory):
    raw = bytes((1, 2, 0, 0))
    compressed = zlib.compress(raw)
    image = struct.pack("<B3xhhhhI", 0, 2, 1, 5, -6, len(compressed)) + compressed
    (directory / "Prguse.wzl").write_bytes(bytes(16) + image)
    (directory / "Prguse.wzx").write_bytes(bytes(52) + struct.pack("<i", 16))
    return directory / "Prguse.wzl"


class WeMadeLibraryTests(unittest.TestCase):
    def test_wil_preserves_offsets_and_transparent_palette_zero(self):
        with tempfile.TemporaryDirectory() as temporary:
            source = classic_wil_fixture(Path(temporary))
            library = WeMadeLibrary(source)
            frame = library.frame(0)
            self.assertEqual(library.count, 1)
            self.assertEqual((frame["width"], frame["height"], frame["offsetX"], frame["offsetY"]), (2, 1, -3, 4))
            self.assertEqual(frame["pixels"][:4], b"\x00\x00\x00\x00")
            self.assertEqual(frame["pixels"][4:8], b"\x01\x14\x28\xFF")

    def test_wzl_decodes_zlib_rows_with_padding(self):
        with tempfile.TemporaryDirectory() as temporary:
            source = classic_wzl_fixture(Path(temporary))
            frame = WeMadeLibrary(source).frame(0)
            self.assertEqual((frame["width"], frame["height"], frame["offsetX"], frame["offsetY"]), (2, 1, 5, -6))
            self.assertEqual(len(frame["pixels"]), 8)

    def test_original_wil_header_reads_palette_at_offset_56(self):
        with tempfile.TemporaryDirectory() as temporary:
            source = original_wil_fixture(Path(temporary))
            frame = WeMadeLibrary(source).frame(0)
            self.assertEqual((frame["width"], frame["height"], frame["offsetX"], frame["offsetY"]), (2, 2, -3, 4))
            self.assertEqual(frame["pixels"][:4], b"\x00\x00\x00\x00")
            self.assertEqual(frame["pixels"][4:8], b"\x00\x00\x00\x00")
            self.assertEqual(frame["pixels"][8:12], b"\x00\x00\x80\xFF")

    def test_original_wil_discards_trailing_terminal_offset(self):
        with tempfile.TemporaryDirectory() as temporary:
            source = original_wil_fixture(Path(temporary), trailing_offset=True)
            library = WeMadeLibrary(source)
            self.assertEqual(library.count, 1)
            self.assertIsNotNone(library.frame(0))

    def test_export_writes_browser_manifest(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = classic_wil_fixture(root)
            manifest = export(source, root / "out")
            self.assertEqual(manifest["format"], "wil-classic")
            self.assertIn("0", manifest["frames"])
            self.assertTrue((root / "out" / "library.json").is_file())
            self.assertEqual(json.loads((root / "out" / "library.json").read_text())["sourceFrameCount"], 1)

    def test_import_command_exports_to_isolated_directory(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            classic_wil_fixture(root)
            output = root / "ui-national"
            result = subprocess.run([
                sys.executable,
                str(ROOT / "tools/import-national-ui.py"),
                "--data-dir", str(root),
                "--output", str(output),
                "--family", "prguse",
            ], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn('"status": "imported"', result.stdout)
            self.assertTrue((output / "prguse" / "library.json").is_file())


if __name__ == "__main__":
    unittest.main()
