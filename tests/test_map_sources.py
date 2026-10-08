import importlib.util
import json
from pathlib import Path
import struct
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from map_sources import (CONTRACT, PROFILE, digest, import_native_maps, load_contract,
                         map_provenance, refresh_runtime_maps, resolve_maps)
from map_tool import CELL, ClassicMap, export as export_map


def map_bytes(blocked=False):
    header = bytearray(52)
    struct.pack_into('<HH', header, 0, 3, 3)
    cells = [CELL.pack(index + 1, 0, 0, 0, 0, 0, 0, 0, 0) for index in range(9)]
    if blocked:
        cells[4] = CELL.pack(0x8005, 0, 0, 0, 0, 0, 0, 0, 0)
    return bytes(header) + b''.join(cells)


class MapSourceTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.original = map_bytes(True)
        self.previous = map_bytes()
        ids = ['0', 'D718']
        baseline = []
        for map_id, filename in [('0', '0.map'), ('D718', 'd718.MAP')]:
            path = self.root / 'vendor/maps' / filename
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(self.previous)
            baseline.append({'id': map_id, 'path': path.relative_to(self.root).as_posix(),
                             'sha256': digest(self.previous), 'bytes': len(self.previous),
                             'width': 3, 'height': 3, 'originalClientMapPresent': map_id == '0'})
        self.contract = {'schemaVersion': 1, 'domain': 'map-cells',
                         'baseline': {'maps': baseline, 'orderedMapIdsSha256': digest(b'0\nD718')},
                         'overrides': [{'id': '0', 'path': 'assets/raw/native-maps/0.map',
                                        'installedFile': '0.map', 'sha256': digest(self.original),
                                        'previousServerSha256': digest(self.previous),
                                        'bytes': len(self.original), 'width': 3, 'height': 3}],
                         'serverRoutesAbsentFromInstalledClient': ['D718']}
        (self.root / PROFILE).parent.mkdir(parents=True)
        (self.root / PROFILE).write_text(json.dumps({'p0Baseline': {'maps': ids}}))
        self.write_contract()
        self.client = self.root / 'client/Map'
        self.client.mkdir(parents=True)
        (self.client / '0.MAP').write_bytes(self.original)

    def write_contract(self):
        (self.root / CONTRACT).write_text(json.dumps(self.contract))

    def test_missing_original_never_falls_back_to_vendor_map(self):
        with self.assertRaisesRegex(FileNotFoundError, 'Missing locked map 0'):
            resolve_maps(self.root)
        self.assertEqual(resolve_maps(self.root, ['D718'])['D718'].name, 'd718.MAP')

    def test_import_resolver_and_export_keep_graphics_and_collision_bytes(self):
        import_native_maps(self.root, self.client)
        sources = resolve_maps(self.root)
        self.assertEqual(list(sources), ['0', 'D718'])
        original_world = ClassicMap(sources['0'].read_bytes())
        self.assertTrue(original_world.blocked(1, 1))
        self.assertFalse(ClassicMap(sources['D718'].read_bytes()).blocked(1, 1))
        output = self.root / 'web/maps/0'
        manifest = export_map(sources['0'], output, size=2)
        rebuilt = bytearray(9 * 12)
        for chunk in manifest['chunks']:
            payload = (output / chunk['file']).read_bytes()
            self.assertEqual(digest(payload), chunk['sha256'])
            for dx in range(chunk['width']):
                for dy in range(chunk['height']):
                    a = ((chunk['x'] + dx) * 3 + chunk['y'] + dy) * 12
                    b = (dx * chunk['height'] + dy) * 12
                    rebuilt[a:a + 12] = payload[b:b + 12]
        self.assertEqual(bytes(rebuilt), self.original[52:])
        self.assertEqual(manifest['sourceSha256'], digest(self.original))

    def test_changed_original_is_rejected_even_with_valid_vendor_source(self):
        import_native_maps(self.root, self.client)
        (self.root / self.contract['overrides'][0]['path']).write_bytes(self.previous)
        with self.assertRaisesRegex(ValueError, 'hash mismatch: 0'):
            resolve_maps(self.root)

    def test_native_import_preflights_all_sources_before_writing(self):
        other = dict(self.contract['overrides'][0], id='D718', path='assets/raw/native-maps/D718.map', installedFile='D718.map')
        self.contract['baseline']['maps'][1]['originalClientMapPresent'] = True
        self.contract['serverRoutesAbsentFromInstalledClient'] = []
        self.contract['overrides'].append(other)
        self.write_contract()
        with self.assertRaises(FileNotFoundError):
            import_native_maps(self.root, self.client)
        self.assertFalse((self.root / 'assets/raw/native-maps/0.map').exists())

    def test_browser_export_rebuilds_missing_or_changed_chunks_and_preserves_libraries(self):
        spec = importlib.util.spec_from_file_location('source_map_importer', ROOT / 'scripts/import-map-assets.py')
        importer = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(importer)
        import_native_maps(self.root, self.client)
        library = self.root / 'assets/web/libraries/Tiles/library.json'
        library.parent.mkdir(parents=True)
        library.write_bytes(b'keep original graphics library')
        output = self.root / 'assets/web/maps'
        first = importer.export_browser_maps(self.root, output)
        self.assertTrue(all(row['rebuilt'] for row in first))
        self.assertEqual(importer.export_browser_maps(self.root, output)[0]['rebuilt'], False)
        manifest_path = output / '0/map.json'
        manifest = json.loads(manifest_path.read_text())
        (output / '0' / manifest['chunks'][0]['file']).write_bytes(b'broken chunk')
        self.assertTrue(importer.export_browser_maps(self.root, output)[0]['rebuilt'])
        manifest = json.loads(manifest_path.read_text())
        self.assertEqual(manifest['sourceSha256'], digest(self.original))
        self.assertEqual(manifest['provenance']['sharedSource']['originalClientOverride'], True)
        self.assertEqual(library.read_bytes(), b'keep original graphics library')

    def test_runtime_preflight_failure_in_later_map_keeps_earlier_map(self):
        self.contract['baseline']['maps'][1]['originalClientMapPresent'] = True
        self.contract['serverRoutesAbsentFromInstalledClient'] = []
        self.contract['overrides'].append(dict(self.contract['overrides'][0], id='D718', path='assets/raw/native-maps/D718.map', installedFile='D718.map'))
        self.write_contract()
        (self.client / 'D718.MAP').write_bytes(self.original)
        import_native_maps(self.root, self.client)
        runtime = self.root / 'runtime/maps'
        runtime.mkdir(parents=True)
        (runtime / '0.map').write_bytes(self.previous)
        (runtime / 'D718.map').write_bytes(b'keep custom data')
        with self.assertRaisesRegex(ValueError, 'Unrecognized runtime map'):
            refresh_runtime_maps(self.root, runtime)
        self.assertEqual((runtime / '0.map').read_bytes(), self.previous)

    def test_prepare_runtime_consumer_uses_exact_same_original_paths(self):
        spec = importlib.util.spec_from_file_location('map_source_prepare', ROOT / 'scripts/prepare-runtime.py')
        prepare = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(prepare)
        self.assertEqual(prepare._source_map_paths(), resolve_maps(ROOT))

    def test_runtime_refresh_is_narrow_idempotent_and_preserves_world_data(self):
        import_native_maps(self.root, self.client)
        runtime = self.root / 'runtime/Mir200/Map'
        runtime.mkdir(parents=True)
        (runtime / '0.map').write_bytes(self.previous)
        (runtime / 'D718.map').write_bytes(b'keep server extension bytes')
        unrelated = self.root / 'runtime/Mir200/Envir/MapInfo.txt'
        unrelated.parent.mkdir()
        unrelated.write_bytes(b'keep all world definitions')
        first = refresh_runtime_maps(self.root, runtime)
        self.assertTrue(first[0]['changed'])
        self.assertEqual((runtime / '0.map').read_bytes(), self.original)
        self.assertFalse(refresh_runtime_maps(self.root, runtime)[0]['changed'])
        self.assertEqual((runtime / 'D718.map').read_bytes(), b'keep server extension bytes')
        self.assertEqual(unrelated.read_bytes(), b'keep all world definitions')

    def test_unrecognized_runtime_map_refuses_all_overwrites(self):
        import_native_maps(self.root, self.client)
        runtime = self.root / 'runtime/maps'
        runtime.mkdir(parents=True)
        (runtime / '0.map').write_bytes(b'user custom map')
        with self.assertRaisesRegex(ValueError, 'Unrecognized runtime map'):
            refresh_runtime_maps(self.root, runtime)
        self.assertEqual((runtime / '0.map').read_bytes(), b'user custom map')

    def test_changed_baseline_and_unknown_ids_are_rejected(self):
        import_native_maps(self.root, self.client)
        for ids in (['0', '0'], ['d718'], ['unknown']):
            with self.subTest(ids=ids), self.assertRaises(ValueError):
                resolve_maps(self.root, ids)
        (self.root / self.contract['baseline']['maps'][1]['path']).write_bytes(self.original)
        with self.assertRaisesRegex(ValueError, 'hash mismatch: D718'):
            resolve_maps(self.root)

    def test_source_contract_rejects_order_drift_duplicates_and_traversal(self):
        self.contract['baseline']['maps'].reverse()
        self.write_contract()
        with self.assertRaisesRegex(ValueError, 'ordered route catalog'):
            load_contract(self.root)
        self.contract['baseline']['maps'].reverse()
        self.contract['overrides'].append(dict(self.contract['overrides'][0]))
        self.write_contract()
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            load_contract(self.root)
        self.contract['overrides'].pop()
        self.contract['overrides'][0]['path'] = '../escape.map'
        self.write_contract()
        with self.assertRaisesRegex(ValueError, 'Unsafe map source'):
            load_contract(self.root)

    def test_source_presence_is_not_native_runtime_acceptance(self):
        original = map_provenance(self.root, '0')
        self.assertTrue(original['originalClientMapPresent'])
        self.assertTrue(original['originalClientOverride'])
        self.assertEqual(original['nativeRuntimeAcceptance'], 'pending')
        extension = map_provenance(self.root, 'D718')
        self.assertFalse(extension['originalClientMapPresent'])
        self.assertEqual(extension['classification'], 'server-route')

    def test_real_catalog_locks_572_routes_and_six_original_overrides(self):
        contract = load_contract(ROOT)
        self.assertEqual(len(contract['baseline']['maps']), 572)
        self.assertEqual({entry['id'] for entry in contract['overrides']}, {'0', '2', '3', '11', '4', '5'})
        self.assertEqual(len(contract['serverRoutesAbsentFromInstalledClient']), 44)
        sources = resolve_maps(ROOT)
        for entry in contract['overrides']:
            self.assertEqual(digest(sources[entry['id']].read_bytes()), entry['sha256'])
        self.assertEqual(sources['0'].relative_to(ROOT).as_posix(), 'assets/raw/native-maps/0.map')
        self.assertIn('vendor/mirserver-data', sources['D718'].as_posix())


if __name__ == '__main__':
    unittest.main()
