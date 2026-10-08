import hashlib
import json
import struct
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / 'content/classic-176/selection-actions.json'
LOCKED = {
    '68': (44, 21, 385, 456, 'c300116f81247dbd4312258d1ab8639471c739186cbe67c254b4272bb977ded7'),
    '69': (120, 21, 348, 486, '8bd4b86ae420333579b3db1a7a3401a1d8df666b43864f8c0345223b14d6c0a3'),
    '70': (120, 21, 347, 506, '108b0a0f8c3adf2c60504fdde9167e4cf711cc7b9fcaecc6546616c48b738a3f'),
    '72': (56, 20, 379, 547, 'dc088189b0b22f31694135c5113f4774028b1a4dddbbcc25ec5015ab6493be93'),
}


class SelectionActionsTests(unittest.TestCase):
    def setUp(self):
        self.data = json.loads(CONTRACT.read_text(encoding='utf-8'))

    def test_exact_native_source_identity(self):
        self.assertEqual(self.data['sourceSha256'], '88a12492138bc85ba0429dce3cbd857efcea5b7659cdd8d85a4f2f4db68d5ef2')
        self.assertEqual(self.data['indexSha256'], 'e3c60272e6493fb8c409a8bc90834f01b61f37647152865c9125827e82514531')
        library = ROOT / 'assets/web/ui-national/prguse/library.json'
        if not library.exists():
            self.skipTest('National UI export unavailable; no pixel verification')
        meta = json.loads(library.read_text(encoding='utf-8'))
        for field in ['sourceSha256', 'indexSha256']:
            self.assertEqual(meta[field], self.data[field])

    def test_all_four_real_png_bytes_geometry_and_offsets(self):
        folder = ROOT / 'assets/web/ui-national/prguse'
        if not folder.exists():
            self.skipTest('National UI export unavailable; no pixel verification')
        for index, (width, height, _, _, digest) in LOCKED.items():
            frame = self.data['frames'][index]
            self.assertEqual((frame['width'], frame['height'], frame['offsetX'], frame['offsetY']), (width, height, 7, -44))
            raw = (folder / frame['file']).read_bytes()
            self.assertEqual(hashlib.sha256(raw).hexdigest(), digest)
            self.assertEqual(frame['sha256'], digest)
            self.assertEqual(raw[:8], b'\x89PNG\r\n\x1a\n')
            self.assertEqual(struct.unpack('>II', raw[16:24]), (width, height))

    def test_runtime_painted_rectangles_match_original_labels_inside_canvas(self):
        boxes = []
        for name in ['start', 'create', 'delete', 'exit']:
            spec = self.data['buttons'][name]
            width, height, left, top, _ = LOCKED[str(spec['frame'])]
            self.assertEqual((spec['left'], spec['top']), (left, top))
            self.assertTrue(0 <= left < left + width <= 800 and 0 <= top < top + height <= 600)
            boxes.append((left, top, left + width, top + height))
        for i, a in enumerate(boxes):
            for b in boxes[i + 1:]:
                # The source create/delete label rasters share one edge row.
                # Paint geometry is evidence here; their native click boundary remains unverified.
                overlap_x = max(0,min(a[2],b[2])-max(a[0],b[0]))
                overlap_y = max(0,min(a[3],b[3])-max(a[1],b[1]))
                self.assertLessEqual(overlap_y if overlap_x else 0,1)

    def test_wire_ids_and_refresh_success_criterion(self):
        spec = self.data['delete']
        self.assertEqual([spec[k] for k in ['nativeCommand', 'nativeSuccess', 'nativeFailure', 'refreshCommand', 'refreshResponse']], [102, 523, 524, 100, 520])
        self.assertEqual(spec['buttons'], ['yes', 'no', 'cancel'])
        self.assertIn('{name}', spec['confirmText'])
        self.assertIn('SM520', spec['successEvidence'])
        self.assertIn('never replay', spec['unknownPolicy'])

    def test_credits_frame_does_not_invent_working_credits_scene(self):
        self.assertFalse(self.data['credits']['enabled'])
        self.assertIn('callback empty', self.data['credits']['evidence'])
        self.assertNotIn('credits', self.data['buttons'])

    def test_calibration_has_the_same_delete_control_and_explicit_fixture(self):
        for name in ['play.html', 'ui-calibration.html']:
            self.assertIn('data-auth-delete', (ROOT / 'apps/web' / name).read_text(encoding='utf-8'))
        calibration = (ROOT / 'apps/web/ui-calibration.html').read_text(encoding='utf-8')
        for outcome in ['deleted', 'rejected', 'not-deleted', 'unknown']:
            self.assertIn(f'value="{outcome}"', calibration)
        self.assertIn('不连接账号', calibration)

    def test_recorded_reference_files_are_unchanged_when_available(self):
        for name, digest in self.data['referenceSha256'].items():
            path = Path(name)
            if not path.exists():
                self.skipTest('Reference source unavailable; no reference identity verification')
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), digest)


if __name__ == '__main__':
    unittest.main()
