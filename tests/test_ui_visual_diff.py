from pathlib import Path
import tempfile
import unittest

from tools.ui_visual_diff import compare_images, parse_rect, write_png


class UiVisualDiffTests(unittest.TestCase):
    def test_reports_changed_pixels_and_channel_error(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            reference = bytearray([0, 0, 0, 255] * (800 * 600))
            actual = bytearray(reference)
            actual[(34 * 800 + 12) * 4 : (34 * 800 + 12) * 4 + 4] = bytes((255, 0, 0, 255))
            reference_path, actual_path = root / "reference.png", root / "actual.png"
            reference_path.write_bytes(write_png(800, 600, bytes(reference)))
            actual_path.write_bytes(write_png(800, 600, bytes(actual)))
            report, diff = compare_images(reference_path, actual_path)
            self.assertEqual(report["changedPixels"], 1)
            self.assertEqual(report["maxChannelDelta"], 255)
            self.assertEqual(report["maskedPixels"], 0)
            self.assertEqual(diff[:8], b"\x89PNG\r\n\x1a\n")

    def test_masks_dynamic_region_and_accepts_threshold(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            reference = bytearray([10, 10, 10, 255] * (800 * 600))
            actual = bytearray(reference)
            actual[(5 * 800 + 4) * 4 : (5 * 800 + 4) * 4 + 4] = bytes((12, 12, 12, 255))
            actual[(25 * 800 + 20) * 4 : (25 * 800 + 20) * 4 + 4] = bytes((255, 0, 0, 255))
            reference_path, actual_path = root / "reference.png", root / "actual.png"
            reference_path.write_bytes(write_png(800, 600, bytes(reference)))
            actual_path.write_bytes(write_png(800, 600, bytes(actual)))
            report, _ = compare_images(reference_path, actual_path, threshold=3, masks=[(0, 0, 10, 10)])
            self.assertEqual(report["changedPixels"], 1)
            self.assertEqual(report["maskedPixels"], 100)
            self.assertEqual(parse_rect("1,2,3,4"), (1, 2, 3, 4))

    def test_rejects_non_design_dimensions(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            reference_path, actual_path = root / "reference.png", root / "actual.png"
            reference_path.write_bytes(write_png(32, 32, bytes([0, 0, 0, 255] * (32 * 32))))
            actual_path.write_bytes(write_png(800, 600, bytes([0, 0, 0, 255] * (800 * 600))))
            with self.assertRaisesRegex(ValueError, "expected 800x600"):
                compare_images(reference_path, actual_path)


if __name__ == "__main__":
    unittest.main()
