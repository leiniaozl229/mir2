import json
import importlib.util
from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
import sys
sys.path.insert(0, str(ROOT / 'tools'))
from monster_visual_audit import audit as audit_monster_visuals


class ActorAssetProfileTests(unittest.TestCase):
    def test_profile_covers_every_supported_source_map(self):
        spec = importlib.util.spec_from_file_location(
            'prepare_runtime', ROOT / 'scripts/prepare-runtime.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        profile = json.loads((ROOT / 'content/classic-176/version-profile.json').read_text())
        self.assertEqual(set(profile['p0Baseline']['maps']), set(module._source_map_paths()))
        self.assertEqual(len(module._source_map_paths()), 570)

    def test_classic_spawn_filter_covers_route_catalog(self):
        spec = importlib.util.spec_from_file_location(
            'prepare_runtime', ROOT / 'scripts/prepare-runtime.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        profile = json.loads((ROOT / 'content/classic-176/version-profile.json').read_text())
        routes = profile['p0Baseline']['maps']
        lines = module._classic_mon_gen(routes).splitlines()
        spawn_maps = {line.split()[0] for line in lines if line.strip()}
        self.assertTrue(spawn_maps.issubset(set(routes)))
        self.assertEqual(spawn_maps, set(routes))
        bounds = {
            map_id: module.ClassicMap(path.read_bytes())
            for map_id, path in module._source_map_paths().items()
        }
        for line in lines:
            fields = line.split()
            world = bounds[fields[0]]
            self.assertGreaterEqual(int(fields[1]), 0)
            self.assertGreaterEqual(int(fields[2]), 0)
            self.assertLess(int(fields[1]), world.width, line)
            self.assertLess(int(fields[2]), world.height, line)

    def test_classic_npc_definitions_filter_to_route_catalog(self):
        spec = importlib.util.spec_from_file_location(
            'prepare_runtime', ROOT / 'scripts/prepare-runtime.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        profile = json.loads((ROOT / 'content/classic-176/version-profile.json').read_text())
        routes = profile['p0Baseline']['maps']
        specs = {'Merchant.txt': 1, 'Npcs.txt': 2, 'GuardList.txt': 1}
        expected_counts = {'Merchant.txt': 127, 'Npcs.txt': 3, 'GuardList.txt': 49}
        for name, map_field in specs.items():
            lines = module._filtered_route_definitions(
                ROOT / 'vendor/mirserver-data/Mir200/Envir' / name,
                map_field,
                routes,
            )
            self.assertTrue(lines, name)
            self.assertEqual(len(lines), expected_counts[name])
            self.assertTrue(
                all(line.split()[map_field] in routes for line in lines),
                name,
            )

    def test_classic_route_imports_all_source_market_definitions(self):
        spec = importlib.util.spec_from_file_location(
            'prepare_runtime', ROOT / 'scripts/prepare-runtime.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        source_root = ROOT / 'vendor/mirserver-data/Mir200/Envir/Market_Def'
        source_files = {path.relative_to(source_root) for path in source_root.rglob('*') if path.is_file()}
        self.assertGreaterEqual(len(source_files), 100)
        helper = (ROOT / 'scripts/prepare-runtime.py').read_text(encoding='utf-8')
        self.assertIn('_copy_classic_market_definitions(route_mode)', helper)
        self.assertIn('source.relative_to(source_root)', helper)

    def test_castle_configs_are_normalized_for_engine_encoding(self):
        text = (ROOT / 'scripts/prepare-runtime.py').read_text(encoding='utf-8')
        self.assertIn('def _normalize_castle_configs()', text)
        self.assertIn('target.read_text(encoding="utf-8-sig")', text)
        self.assertIn('target.write_text(read_text(source), encoding="utf-8-sig")', text)

    def test_castle_manager_initializes_the_persisted_castle_directory_first(self):
        text = (ROOT / 'vendor/openmir2/src/M2Server/Castle/CastleManager.cs').read_text(
            encoding='utf-8-sig')
        self.assertIn('new UserCastle("0")', text)
        self.assertNotIn('castle.ConfigDir = "0"', text)
        self.assertLess(text.index('castle.EnvirList.Add("0151")'), text.index('castle.Initialize();'))

    def test_profile_maps_have_exported_chunks(self):
        profile = json.loads((ROOT / 'content/classic-176/version-profile.json').read_text())
        self.assertEqual(len(profile['p0Baseline']['maps']), 570)
        for map_id in profile['p0Baseline']['maps']:
            manifest_path = ROOT / 'assets/web/maps' / map_id / 'map.json'
            self.assertTrue(manifest_path.is_file(), map_id)
            manifest = json.loads(manifest_path.read_text())
            self.assertEqual(manifest['id'], map_id)
            self.assertGreater(manifest['width'], 1)
            self.assertGreater(manifest['height'], 1)
            self.assertTrue(manifest['chunks'], map_id)

    def test_classic_catalog_guide_covers_every_non_home_route(self):
        spec = importlib.util.spec_from_file_location(
            'prepare_runtime', ROOT / 'scripts/prepare-runtime.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        profile = json.loads((ROOT / 'content/classic-176/version-profile.json').read_text())
        routes = set(profile['p0Baseline']['maps'])
        guide = module._build_extended_guide(module.CLASSIC_EXTRA_ROUTES)
        destinations = set(re.findall(r'^MAPMOVE\s+([^\s]+)', guide, re.M)) - {'0'}
        self.assertEqual(destinations, routes - {'0'})

    def test_every_source_route_has_a_walkable_spawn_candidate(self):
        spec = importlib.util.spec_from_file_location(
            'prepare_runtime', ROOT / 'scripts/prepare-runtime.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        profile = json.loads((ROOT / 'content/classic-176/version-profile.json').read_text())
        source_paths = module._source_map_paths()
        self.assertEqual(set(profile['p0Baseline']['maps']), set(source_paths))
        for map_id in profile['p0Baseline']['maps']:
            world = module.ClassicMap(source_paths[map_id].read_bytes())
            x, y = module._walkable_point(world)
            self.assertGreaterEqual(x, 0, map_id)
            self.assertGreaterEqual(y, 0, map_id)
            self.assertFalse(world.blocked(x, y), map_id)

    def test_cave_route_dependencies_have_exported_frames(self):
        profile = json.loads((ROOT / 'content/classic-176/version-profile.json').read_text())
        libraries = {
            name: json.loads((ROOT / 'assets/web/libraries' / name / 'library.json').read_text())
            for name in ('Tiles', 'SmTiles', 'Objects')
        }
        for map_id in profile['p0Baseline']['maps']:
            if map_id in {'0', '1', '2', '3'}:
                continue
            manifest = json.loads((ROOT / 'assets/web/maps' / map_id / 'map.json').read_text())
            for name, library in libraries.items():
                for index in manifest['dependencies'][name]:
                    self.assertTrue(
                        str(index) in library['frames'] or index in library['empty'],
                        f'{map_id} references missing {name}:{index}',
                    )

    def test_starter_armour_libraries_are_hash_locked(self):
        profile = json.loads((ROOT / 'content/classic-176/asset-sources.json').read_text())
        actors = {entry['file']: entry for entry in profile['actorFiles']}
        self.assertEqual(
            [f'CArmour{i:02d}.Lib' for i in range(14)],
            [name for name in actors if name.startswith('CArmour')],
        )
        for index in range(14):
            entry = actors[f'CArmour{index:02d}.Lib']
            self.assertEqual(entry['bytes'] > 0, True)
            self.assertRegex(entry['sha256'], r'^[0-9a-f]{64}$')
            self.assertIn(f'/CArmour/{index:02d}.Lib', entry['url'])

    def test_exported_starter_armour_preserves_full_action_table(self):
        for index in range(14):
            library_path = ROOT / 'assets/web/actors' / f'CArmour{index:02d}' / 'library.json'
            self.assertTrue(library_path.is_file(), library_path)
            library = json.loads(library_path.read_text())
            self.assertEqual(library['sourceFrameCount'], 1616)
            self.assertEqual(len(library['frames']), 1616)
            self.assertEqual(library['empty'], [])
            self.assertEqual(library['missing'], [])

    def test_zuma_monster_libraries_are_complete(self):
        expected = {'Monster047': 224, 'Monster061': 352, 'Monster062': 38}
        profile = json.loads((ROOT / 'content/classic-176/asset-sources.json').read_text())
        actors = {entry['file']: entry for entry in profile['actorFiles']}
        for name, frame_count in expected.items():
            entry = actors[f'{name}.Lib']
            self.assertRegex(entry['sha256'], r'^[0-9a-f]{64}$')
            library = json.loads((ROOT / 'assets/web/actors' / name / 'library.json').read_text())
            self.assertEqual(library['sourceFrameCount'], frame_count)
            self.assertEqual(len(library['frames']), frame_count)
            self.assertEqual(library['empty'], [])
            self.assertEqual(library['missing'], [])

    def test_p0_monster_visual_catalog_covers_every_baseline_name(self):
        report = audit_monster_visuals()
        self.assertTrue(report['ok'], report)
        self.assertEqual(report['expected'], 22)
        self.assertEqual(report['covered'], 22)
        self.assertEqual(report['missing'], [])
        self.assertGreaterEqual(report['candidateCount'], 1)

    def test_new_classic_monster_assets_are_hash_locked_and_exported(self):
        profile = json.loads((ROOT / 'content/classic-176/asset-sources.json').read_text())
        actors = {entry['file']: entry for entry in profile['actorFiles']}
        for name, frame_count in {'Monster006': 224, 'Monster019': 224, 'Monster103': 225, 'Monster112': 224}.items():
            entry = actors[f'{name}.Lib']
            self.assertRegex(entry['sha256'], r'^[0-9a-f]{64}$')
            library = json.loads((ROOT / 'assets/web/actors' / name / 'library.json').read_text())
            self.assertEqual(library['sourceFrameCount'], frame_count)
            self.assertEqual(len(library['frames']), frame_count)
            self.assertEqual(library['empty'], [])
            self.assertEqual(library['missing'], [])
