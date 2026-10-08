"""Version-locked national actor palette reconstruction and failure boundaries."""
import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('actor_palette_export', ROOT / 'scripts/export-actor-status-palette.py')
exporter = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(exporter)


def wil_fixture(path, bad_header=False, bad_size=False):
    header = bytearray(56)
    header[:11] = b'bad-library' if bad_header else b'#ILIB v1.0-'
    struct.pack_into('<ii', header, 48, 255 if bad_size else 256, 1024)
    palette = bytes(value for index in range(256) for value in (index, 255-index, index//2, 17))
    data = bytes(header) + palette + b'source payload included in the hash'
    path.write_bytes(data)
    return hashlib.sha256(data).hexdigest(), palette


class ActorPaletteExportTests(unittest.TestCase):
    def test_default_source_root_is_the_configured_absolute_original_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = root / 'content/classic-176/active-asset-sources.json'
            config.parent.mkdir(parents=True)
            original = root / 'original-package'
            config.write_text(json.dumps({'roots': {'nationalData': str(original)}}), encoding='utf-8')
            with patch.object(exporter, 'ROOT', root):
                self.assertEqual(exporter.default_data_dir(), original.resolve())
                self.assertNotEqual(exporter.default_data_dir(), root / '.runtime/native-client/Data')

    def test_relative_source_root_is_resolved_against_repository(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = root / 'content/classic-176/active-asset-sources.json'
            config.parent.mkdir(parents=True)
            config.write_text(json.dumps({'roots': {'nationalData': 'fixtures/original-data'}}), encoding='utf-8')
            with patch.object(exporter, 'ROOT', root):
                self.assertEqual(exporter.default_data_dir(), (root / 'fixtures/original-data').resolve())

    def test_default_source_root_cannot_fall_back_to_mutable_runtime(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = root / 'content/classic-176/active-asset-sources.json'
            config.parent.mkdir(parents=True)
            for value in ({}, {'roots': None}, {'roots': {'nationalData': ''}}, {'roots': {'nationalData': 3}}):
                with self.subTest(value=value), patch.object(exporter, 'ROOT', root):
                    config.write_text(json.dumps(value), encoding='utf-8')
                    with self.assertRaisesRegex(ValueError, 'roots.nationalData'):
                        exporter.default_data_dir()

    def test_cli_default_reads_configured_source_in_check_mode(self):
        resource = {'source': {}, 'compatibleSources': [], 'lookup': {}}
        expected = json.dumps(resource, ensure_ascii=False, indent=2) + '\n'
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'resource.json'
            source = Path(directory) / 'configured-original'
            output.write_text(expected, encoding='utf-8')
            with patch.object(exporter, 'default_data_dir', return_value=source) as resolve, patch.object(exporter, 'build_resource', return_value=resource) as rebuild:
                self.assertEqual(exporter.main(['--check', '--output', str(output)]), 0)
                resolve.assert_called_once_with()
                self.assertEqual(rebuild.call_args.args[1], source)
            self.assertEqual(output.read_text(encoding='utf-8'), expected)

    def test_integer_nearest_uses_nonzero_first_tie(self):
        palette = [[255, 255, 255] for _ in range(256)]
        palette[0], palette[1], palette[2] = [50, 0, 0], [49, 0, 0], [51, 0, 0]
        maps = exporter.brightness_maps(palette)
        self.assertEqual(maps['red'][50], 1, 'index zero excluded and equal-distance earlier index retained')
        self.assertEqual(maps['red'][51], 2)
        self.assertEqual(len(maps), 6)
        self.assertTrue(all(len(indices) == 256 and 0 not in indices for indices in maps.values()))

    def test_palette_rejects_invalid_dimensions_or_channels(self):
        for palette in [[[0, 0, 0]] * 255, [[0, 0]] * 256, [[256, 0, 0]] * 256, [[1.5, 0, 0]] * 256]:
            with self.subTest(palette=palette[0]):
                with self.assertRaisesRegex(ValueError, '256 RGB byte'):
                    exporter.brightness_maps(palette)

    def test_source_bgr_and_reserved_bytes_survive_hash_lock(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'fixture.wil'
            digest, raw = wil_fixture(source)
            actual_raw, rgb = exporter.source_palette(source, digest)
            self.assertEqual(actual_raw, raw)
            self.assertEqual(rgb[2], [1, 253, 2])
            source.write_bytes(source.read_bytes() + b'changed after palette')
            with self.assertRaisesRegex(ValueError, 'source hash mismatch'):
                exporter.source_palette(source, digest)

    def test_source_header_and_palette_size_are_not_guessed(self):
        with tempfile.TemporaryDirectory() as directory:
            for kwargs, error in [({'bad_header': True}, 'header'), ({'bad_size': True}, 'palette size')]:
                source = Path(directory) / 'fixture.wil'
                digest, _ = wil_fixture(source, **kwargs)
                with self.assertRaisesRegex(ValueError, error):
                    exporter.source_palette(source, digest)

    def test_primary_contract_cannot_unlock_source_hash(self):
        profile = json.loads((ROOT / 'content/classic-176/actor-status.json').read_text(encoding='utf-8'))
        profile['drawEffect']['palette']['sourceSha256'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'locked national Prguse'):
            exporter.build_resource(profile, ROOT)

    def test_bad_native_source_never_writes_output(self):
        with tempfile.TemporaryDirectory() as directory:
            directory = Path(directory)
            wil_fixture(directory / 'Prguse.wil')
            output = directory / 'should-not-exist.json'
            with patch.object(exporter, 'default_data_dir', side_effect=AssertionError('explicit directory must bypass default root')):
                with self.assertRaisesRegex(ValueError, 'source hash mismatch'):
                    exporter.main(['--data-dir', str(directory), '--output', str(output)])
            self.assertFalse(output.exists())

    def test_check_is_read_only_and_exactly_detects_changed_output(self):
        resource = {'source': {}, 'compatibleSources': [], 'lookup': {}}
        expected = json.dumps(resource, ensure_ascii=False, indent=2) + '\n'
        with tempfile.TemporaryDirectory() as directory, patch.object(exporter, 'build_resource', return_value=resource):
            output = Path(directory) / 'fixture.json'
            output.write_text(expected, encoding='utf-8')
            self.assertEqual(exporter.main(['--check', '--output', str(output)]), 0)
            output.write_text(expected + ' ', encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'resource differs'):
                exporter.main(['--check', '--output', str(output)])
            self.assertEqual(output.read_text(encoding='utf-8'), expected + ' ')

    def test_installed_national_sources_rebuild_bundled_resource(self):
        data_dir = exporter.default_data_dir()
        if not (data_dir / 'Prguse.wil').exists():
            self.skipTest('configured original national WIL package absent')
        profile = json.loads((ROOT / 'content/classic-176/actor-status.json').read_text(encoding='utf-8'))
        actual = exporter.build_resource(profile, data_dir)
        expected = json.loads((ROOT / 'content/classic-176/actor-status-palette.json').read_text(encoding='utf-8'))
        self.assertEqual(actual, expected)
        self.assertEqual(len(actual['compatibleSources']), 22)
        for effect, indices in actual['sourceIndexMaps'].items():
            self.assertEqual(indices[0], 0)
            for index, rgb in enumerate(actual['palette'][1:], 1):
                self.assertEqual(indices[index], actual['brightnessMaps'][effect][sum(rgb) // 3])


if __name__ == '__main__':
    unittest.main()
