import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    'server_extension_export', ROOT / 'scripts/export-server-extension-maps.py')
EXPORT = importlib.util.module_from_spec(spec)
spec.loader.exec_module(EXPORT)


class ServerExtensionMapsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.contract = json.loads((ROOT / EXPORT.CONTRACT).read_text(encoding='utf-8'))
        with tempfile.TemporaryDirectory() as directory:
            cls.plan, cls.operations, cls.baseline = EXPORT.make_plan(ROOT, Path(directory))

    def test_plan_is_source_locked_and_does_not_write_assets(self):
        self.assertEqual(self.plan['profileMaps'], 572)
        self.assertEqual(len(self.baseline), 570)
        self.assertEqual({m['id'] for m in self.plan['maps']}, {'D718', 'D719'})
        self.assertEqual(self.plan['sourceCommit'], 'f38deae64c521a28f8e0d86f2bf24d4ba7c9ea5c')
        for target, _ in self.operations:
            self.assertFalse(target.exists())
        for row in self.plan['maps']:
            self.assertEqual((row['width'], row['height'], row['chunks']), (100, 100, 4))
            self.assertEqual(row['chunkBytes'], 120000)
            self.assertTrue(row['cellBytesVerified'])
            self.assertEqual({name: value['references'] for name, value in row['dependencies'].items()},
                             {'Tiles': 37, 'SmTiles': 0, 'Objects': 1183})
            self.assertIsNone(row['sourceMapInfoEntry'])
            self.assertEqual(row['sourceMonGenEntries'], 0)
            self.assertEqual(row['generatedRoute']['start'], [50, 50])
            self.assertFalse(row['generatedRoute']['historicalConfigurationVerified'])

    def test_every_exported_cell_is_original_column_major_bytes(self):
        for (_, files), entry in zip(self.operations, self.contract['maps']):
            raw = (ROOT / entry['source']['path']).read_bytes()
            manifest = json.loads(files['map.json'])
            rebuilt = bytearray(120000)
            covered = set()
            for chunk in manifest['chunks']:
                payload = files[chunk['file']]
                self.assertEqual(hashlib.sha256(payload).hexdigest(), chunk['sha256'])
                self.assertEqual(len(payload), chunk['width'] * chunk['height'] * 12)
                for dx in range(chunk['width']):
                    for dy in range(chunk['height']):
                        x, y = chunk['x'] + dx, chunk['y'] + dy
                        self.assertNotIn((x, y), covered)
                        covered.add((x, y))
                        a = (x * 100 + y) * 12
                        b = (dx * chunk['height'] + dy) * 12
                        rebuilt[a:a + 12] = payload[b:b + 12]
                        self.assertEqual(payload[b:b + 12], raw[52 + a:64 + a])
            self.assertEqual(len(covered), 10000)
            self.assertEqual(bytes(rebuilt), raw[52:])
            self.assertEqual(manifest['provenance']['classification'], 'server-extension')
            self.assertFalse(manifest['provenance']['originalClientMapPresent'])

    def test_apply_is_idempotent_and_keeps_existing_maps_and_extra_files(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            old = output / self.baseline[0]
            old.mkdir()
            (old / 'map.json').write_bytes(b'old map manifest remains byte identical')
            (old / '0-0.original.bin').write_bytes(b'old source and palette bytes')
            first = EXPORT.execute(ROOT, output, apply=True)
            self.assertEqual(first['writtenFiles'], 10)
            self.assertEqual(first['existingMapManifestsObserved'], 1)
            extra = output / 'D718' / 'unrelated.txt'
            extra.write_bytes(b'preserve unrelated local file')
            before = {str(p.relative_to(output)): (p.read_bytes(), p.stat().st_mtime_ns)
                      for p in output.rglob('*') if p.is_file()}
            second = EXPORT.execute(ROOT, output, apply=True)
            after = {str(p.relative_to(output)): (p.read_bytes(), p.stat().st_mtime_ns)
                     for p in output.rglob('*') if p.is_file()}
            self.assertEqual(second['writtenFiles'], 0)
            self.assertEqual(before, after)
            self.assertTrue(second['existingMapManifestsPreserved'])

    def test_apply_repairs_only_a_changed_extension_chunk(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            EXPORT.execute(ROOT, output, apply=True)
            target = output / 'D718'
            manifest_path = target / 'map.json'
            manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
            chunk = target / manifest['chunks'][0]['file']
            expected = chunk.read_bytes()
            untouched = manifest_path.stat().st_mtime_ns
            chunk.write_bytes(b'corrupt')
            repaired = EXPORT.execute(ROOT, output, apply=True)
            self.assertEqual(repaired['writtenFiles'], 1)
            self.assertEqual(chunk.read_bytes(), expected)
            self.assertEqual(manifest_path.stat().st_mtime_ns, untouched)

    def _library_fixture(self, directory):
        fixture = Path(directory)
        for name in ('Tiles', 'SmTiles', 'Objects'):
            target = fixture / 'assets/web/libraries' / name
            target.mkdir(parents=True)
            original = ROOT / 'assets/web/libraries' / name
            library = json.loads((original / 'library.json').read_text(encoding='utf-8'))
            if name == 'Tiles':
                frame = library['frames']['37']
                (target / frame['file']).write_bytes((original / frame['file']).read_bytes())
            (target / 'library.json').write_text(json.dumps(library), encoding='utf-8')
        return fixture

    def test_existing_png_bytes_and_geometry_must_match(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = self._library_fixture(directory)
            checked = EXPORT.verify_dependencies(fixture, [{37}, set(), set()], self.contract['libraryLocks'])
            self.assertEqual(checked['Tiles']['verified'], 1)
            folder = fixture / 'assets/web/libraries/Tiles'
            library = json.loads((folder / 'library.json').read_text())
            (folder / library['frames']['37']['file']).write_bytes(b'changed original PNG')
            with self.assertRaisesRegex(ValueError, 'Changed Tiles:37 PNG bytes'):
                EXPORT.verify_dependencies(fixture, [{37}, set(), set()], self.contract['libraryLocks'])

    def test_missing_frame_is_unresolved_and_no_guessed_library_is_used(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = self._library_fixture(directory)
            path = fixture / 'assets/web/libraries/Tiles/library.json'
            library = json.loads(path.read_text())
            del library['frames']['37']
            path.write_text(json.dumps(library))
            with self.assertRaisesRegex(ValueError, 'Unresolved Tiles:37'):
                EXPORT.verify_dependencies(fixture, [{37}, set(), set()], self.contract['libraryLocks'])
            library['empty'] = [37]
            path.write_text(json.dumps(library))
            self.assertEqual(EXPORT.verify_dependencies(
                fixture, [{37}, set(), set()], self.contract['libraryLocks'])['Tiles']['verified'], 1)
            library['empty'] = [library['sourceFrameCount']]
            path.write_text(json.dumps(library))
            with self.assertRaisesRegex(ValueError, 'Out-of-range empty'):
                EXPORT.verify_dependencies(fixture, [set(library['empty']), set(), set()], self.contract['libraryLocks'])

    def test_library_locks_and_source_index_are_checked(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = self._library_fixture(directory)
            path = fixture / 'assets/web/libraries/Tiles/library.json'
            library = json.loads(path.read_text())
            library['sourceSha256'] = '0' * 64
            path.write_text(json.dumps(library))
            with self.assertRaisesRegex(ValueError, 'original library lock mismatch'):
                EXPORT.verify_dependencies(fixture, [{37}, set(), set()], self.contract['libraryLocks'])
            library['sourceSha256'] = self.contract['libraryLocks']['Tiles']['sourceSha256']
            library['frames']['37']['sourceIndex'] = 38
            path.write_text(json.dumps(library))
            with self.assertRaisesRegex(ValueError, 'source index mismatch'):
                EXPORT.verify_dependencies(fixture, [{37}, set(), set()], self.contract['libraryLocks'])

    def test_changed_submodule_commit_is_rejected_before_assets_write(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            with patch.object(EXPORT, '_git', return_value='0' * 40):
                with self.assertRaisesRegex(ValueError, 'source commit changed'):
                    EXPORT.execute(ROOT, output, apply=True)
            self.assertEqual(list(output.iterdir()), [])

    def test_unsafe_source_paths_are_rejected(self):
        with self.assertRaisesRegex(ValueError, 'Unsafe relative source'):
            EXPORT.relative_file(ROOT, '../other/source.map')
        with self.assertRaisesRegex(ValueError, 'Unsafe relative source'):
            EXPORT.relative_file(ROOT, str(ROOT / 'vendor/source.map'))

    def test_report_is_immutable_and_duplicate_same_bytes_is_safe(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'report.json'
            original = {'mode': 'plan', 'ok': True}
            EXPORT.write_report(path, original)
            before = path.stat().st_mtime_ns
            EXPORT.write_report(path, original)
            self.assertEqual(path.stat().st_mtime_ns, before)
            with self.assertRaisesRegex(ValueError, 'Refusing to replace archived report'):
                EXPORT.write_report(path, {'mode': 'apply', 'ok': True})
            self.assertEqual(json.loads(path.read_text()), original)


if __name__ == '__main__':
    unittest.main(verbosity=2)
