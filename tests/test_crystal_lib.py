import gzip
from pathlib import Path
import struct
import sys
import unittest
import zlib
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from crystal_lib import CrystalLibrary, IMAGE_HEADER, ACTION_RECORD, png_rgba


class LibraryTests(unittest.TestCase):
    def library(self, pixels=b'\x01\x02\x03\xff'):
        compressed = gzip.compress(pixels)
        return (struct.pack('<iiii', 2, 2, 16, 0)
                + IMAGE_HEADER.pack(1, 1, -7, 12, -3, 4, 0, len(compressed)) + compressed)

    def test_original_index_signed_offsets_and_empty_frame(self):
        library = CrystalLibrary(self.library())
        frame = library.frame(0)
        self.assertEqual((frame['offsetX'], frame['offsetY']), (-7, 12))
        self.assertEqual(frame['pixels'], b'\x01\x02\x03\xff')
        self.assertIsNone(library.frame(1))
        with self.assertRaises(IndexError):
            library.frame(2)

    def test_corruption_rejected(self):
        with self.assertRaises(ValueError):
            CrystalLibrary(struct.pack('<iii', 2, 1, 900))
        with self.assertRaises(ValueError):
            CrystalLibrary(self.library(b'x' * 10)).frame(0)
        with self.assertRaises(ValueError):
            CrystalLibrary(self.library()[:-2]).frame(0)

    def test_png_channel_order(self):
        png = png_rgba(1, 1, b'\x01\x02\x03\xff')
        offset, compressed = 8, b''
        while offset < len(png):
            length = struct.unpack_from('>I', png, offset)[0]
            if png[offset+4:offset+8] == b'IDAT':
                compressed += png[offset+8:offset+8+length]
            offset += length + 12
        self.assertEqual(zlib.decompress(compressed), b'\x00\x03\x02\x01\xff')

    def test_v3_actions_and_mask_have_independent_dimensions(self):
        base = gzip.compress(bytes([1, 2, 3, 255]))
        mask = gzip.compress(bytes([4, 5, 6, 128]) * 2)
        record = (IMAGE_HEADER.pack(1, 1, -7, 12, 0, 0, 128, len(base)) + base
                  + struct.pack('<hhhhi', 2, 1, -20, 30, len(mask)) + mask)
        data = (struct.pack('<iiii', 3, 1, 16 + len(record), 16) + record
                + struct.pack('<i', 1) + ACTION_RECORD.pack(9, 80, 6, 2, 100, 0, 0, 0, 0, 1, 0))
        library = CrystalLibrary(data)
        self.assertEqual(library.actions[9]['skip'], 2)
        self.assertEqual(library.actions[9]['reverse'], 1)
        frame = library.frame(0)
        self.assertEqual(frame['mask']['width'], 2)
        self.assertEqual(frame['mask']['offsetX'], -20)
        self.assertEqual(len(frame['mask']['pixels']), 8)
        with self.assertRaises(ValueError):
            CrystalLibrary(data[:-1])
