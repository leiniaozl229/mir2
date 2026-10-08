import json
import importlib.util
from pathlib import Path
import re
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
import sys
sys.path.insert(0, str(ROOT / 'tools'))
from monster_visual_audit import audit as audit_monster_visuals
from ui_visual_diff import write_png


class ActorAssetProfileTests(unittest.TestCase):
    def test_national_importer_requires_same_directory_for_paired_indices(self):
        spec = importlib.util.spec_from_file_location(
            'import_national_ui', ROOT / 'tools/import-national-ui.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        family = {'variants': [['Prguse.wil', 'Prguse.wix']]}
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            wil_dir, wix_dir = root / 'client-a', root / 'client-b'
            wil_dir.mkdir()
            wix_dir.mkdir()
            wil = wil_dir / 'Prguse.wil'
            wix = wix_dir / 'Prguse.wix'
            wil.write_bytes(b'wil')
            wix.write_bytes(b'wix')
            match, diagnostic = module.choose_variant(
                family, module.index_files(root))
            self.assertIsNone(match)
            self.assertEqual(diagnostic, 'paired files are in different directories')
            wix.unlink()
            wix = wil_dir / 'Prguse.wix'
            wix.write_bytes(b'wix')
            match, diagnostic = module.choose_variant(
                family, module.index_files(root))
            self.assertEqual(match, [wil, wix])
            self.assertIsNone(diagnostic)

    def test_runtime_notices_and_login_messages_are_localized(self):
        spec = importlib.util.spec_from_file_location(
            'prepare_runtime', ROOT / 'scripts/prepare-runtime.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        source = '\n'.join([
            'StartChangeAttackModeHelp=www.old.example',
            'StartNoticeMsg=客服QQ：123456',
            'WebSite=http://old.example',
            'BbsSite=www.old.example',
            'ClientDownload=https://old.example',
            'QQ=123456',
        ])
        localized = module._localize_string_config(source)
        self.assertIn('StartNoticeMsg=本服用于本地功能验证', localized)
        self.assertNotRegex(localized.lower(), r'https?://|www\.|qq：123456')
        notice_writer = (ROOT / 'scripts/prepare-runtime.py').read_text(encoding='utf-8')
        self.assertIn('_write_local_notices()', notice_writer)
        self.assertIn('write_bytes(', notice_writer)

    def test_profile_covers_every_supported_source_map(self):
        spec = importlib.util.spec_from_file_location(
            'prepare_runtime', ROOT / 'scripts/prepare-runtime.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        profile = json.loads((ROOT / 'content/classic-176/version-profile.json').read_text(encoding='utf-8'))
        self.assertEqual(set(profile['p0Baseline']['maps']), set(module._source_map_paths()))
        self.assertEqual(len(module._source_map_paths()), 572)
        extensions = json.loads((ROOT / 'content/classic-176/map-server-extensions.json').read_text(encoding='utf-8'))
        self.assertEqual({entry['id'] for entry in extensions['maps']}, {'D718', 'D719'})
        self.assertEqual(len(set(profile['p0Baseline']['maps']) - {'D718', 'D719'}), 570)

    def test_client_installer_chain_is_hash_locked(self):
        profile = json.loads((ROOT / 'content/classic-176/asset-sources.json').read_text())
        installer = profile['clientInstaller']
        self.assertEqual(installer['sha256'], '46e6cf029bd33f32b9977a4184b95d056a24ac32b60d03210a50e5251dcf4d42')
        self.assertEqual(installer['runtimeStatus'], 'windows-runtime-pending')
        chain_files = [file for step in installer['chain'] for file in step['files']]
        self.assertEqual(
            [file['file'] for file in chain_files],
            ['data1.cab', 'data2.cab', 'Mir.exe', 'mir.dat', 'mirclient.dll', 'load.lib'],
        )
        for file in chain_files:
            self.assertRegex(file['sha256'], r'^[0-9a-f]{64}$')

    def test_exported_ui_audit_classifies_blank_duplicate_and_decode_failure(self):
        spec = importlib.util.spec_from_file_location(
            'validate_national_ui', ROOT / 'tools/validate-national-ui.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            export = root / 'ui-national' / 'prguse'
            export.mkdir(parents=True)
            valid = write_png(2, 2, bytes([
                255, 0, 0, 255, 0, 255, 0, 255,
                0, 0, 255, 255, 255, 255, 255, 255,
            ]))
            blank = write_png(1, 1, bytes([0, 0, 0, 0]))
            (export / '0.png').write_bytes(valid)
            (export / '1.png').write_bytes(blank)
            (export / '2.png').write_bytes(valid)
            (export / '3.png').write_bytes(b'not-a-png')
            manifest = {
                'source': 'Prguse.wil',
                'frames': {
                    '0': {'width': 2, 'height': 2, 'file': '0.png'},
                    '1': {'width': 1, 'height': 1, 'file': '1.png'},
                    '2': {'width': 2, 'height': 2, 'file': '2.png'},
                    '3': {'width': 1, 'height': 1, 'file': '3.png'},
                    '4': {'width': 1, 'height': 1, 'file': 'missing.png'},
                },
            }
            (export / 'library.json').write_text(json.dumps(manifest))
            report = module.audit_exported_libraries(root / 'ui-national')
            summary = report['libraries'][0]
            self.assertFalse(report['ok'])
            self.assertEqual(summary['validFrames'], 1)
            self.assertEqual(summary['blankFrames'], 1)
            self.assertEqual(summary['duplicateFrames'], 1)
            self.assertEqual(summary['decodeFailedFrames'], 1)
            self.assertEqual(summary['missingFrames'], 1)
            source_data = root / 'Data'
            source_data.mkdir()
            for name in ('Prguse.wil', 'Prguse.wix', 'Prguse2.wil', 'Prguse2.wix', 'stateitem.wil', 'stateitem.wix', 'ChrSel.wil', 'ChrSel.wix', 'mmap.wil', 'mmap.wix', 'MagIcon.wil', 'MagIcon.wix', 'Items.wil', 'Items.wix', 'DnItems.wil', 'DnItems.wix'):
                (source_data / name).write_bytes(b'asset')
            checked = module.validate(source_data, root / 'ui-national')
            self.assertFalse(checked['ok'])
            self.assertEqual(checked['status'], 'blocked-export-integrity')

    def test_classic_spawn_filter_covers_route_catalog(self):
        spec = importlib.util.spec_from_file_location(
            'prepare_runtime', ROOT / 'scripts/prepare-runtime.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        profile = json.loads((ROOT / 'content/classic-176/version-profile.json').read_text(encoding='utf-8'))
        routes = profile['p0Baseline']['maps']
        lines = module._classic_mon_gen(routes).splitlines()
        spawn_maps = {line.split()[0] for line in lines if line.strip()}
        controlled_maps = {"D001"}
        self.assertTrue(spawn_maps.issubset(set(routes)))
        self.assertEqual(spawn_maps | controlled_maps, set(routes))
        self.assertNotIn("D001", spawn_maps)
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

    def test_classic_spawn_filter_does_not_leak_unselected_fallback_maps(self):
        spec = importlib.util.spec_from_file_location(
            'prepare_runtime', ROOT / 'scripts/prepare-runtime.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        for routes, expected in (([], set()), (['D001'], set()),
                                 (['D718'], {'D718'}),
                                 (['D718', 'D719'], {'D718', 'D719'}),
                                 (['0', 'D401'], {'0', 'D401'}),
                                 (['d718'], {'d718'})):
            with self.subTest(routes=routes):
                lines = [line for line in module._classic_mon_gen(routes).splitlines() if line.strip()]
                self.assertEqual({line.split()[0] for line in lines}, expected)
                self.assertTrue(all(line.split()[0] in routes for line in lines))
        fallback = module._classic_mon_gen(['D718']).splitlines()
        self.assertEqual(len(fallback), 1)
        self.assertEqual(fallback[0].split()[:3], ['D718', '51', '50'])
        self.assertEqual(module._classic_mon_gen(['0']).splitlines()[:2],
                         ['0 292 623 鸡 3 4 1', '0 300 626 鹿 4 3 1'])

    def test_viper_valley_guide_does_not_overlap_source_merchants(self):
        spec = importlib.util.spec_from_file_location(
            'prepare_runtime', ROOT / 'scripts/prepare-runtime.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        definitions = [line.split() for line in module.city_services.service_definitions({'2'})]
        travelers = [fields for fields in definitions
                     if fields[0] == module.city_services.TRAVEL_SCRIPT]
        self.assertEqual(len(travelers), 1)
        guide = tuple(map(int, travelers[0][2:4]))
        self.assertEqual(guide, (507, 468))
        source_merchants = module._filtered_route_definitions(
            ROOT / 'vendor/mirserver-data/Mir200/Envir/Merchant.txt', 1, {'2'})
        source_merchants = [line for raw in source_merchants
                            if (line := module.city_services.normalize_merchant(raw)) is not None]
        occupied = {(int(line.split()[2]), int(line.split()[3])) for line in source_merchants}
        occupied.update(tuple(map(int, fields[2:4])) for fields in definitions
                        if fields[0] != module.city_services.TRAVEL_SCRIPT)
        occupied.add((506, 484))  # Actual playtest supply NPC added by prepare-runtime.
        self.assertNotIn(guide, occupied)
        self.assertGreaterEqual(min(max(abs(guide[0] - x), abs(guide[1] - y)) for x, y in occupied), 5)
        world = module.ClassicMap(module._source_map_paths()['2'].read_bytes())
        self.assertFalse(world.blocked(*guide))

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
        self.assertIn('raw.decode("gb18030")', text)
        self.assertIn('target.write_bytes(text.encode("gb18030"))', text)

    def test_castle_manager_loads_persisted_directories_without_duplicates(self):
        text = (ROOT / 'vendor/openmir2/src/M2Server/Castle/CastleManager.cs').read_text(
            encoding='utf-8-sig')
        self.assertIn('ReadCastleDirectories()', text)
        self.assertIn('result.Add(castleDir)', text)
        self.assertIn('loadList.Add(CastleList[i].ConfigDir)', text)
        self.assertIn('if (CastleList.Count > 0)', text)

    def test_profile_maps_have_exported_chunks(self):
        profile = json.loads((ROOT / 'content/classic-176/version-profile.json').read_text(encoding='utf-8'))
        self.assertEqual(len(profile['p0Baseline']['maps']), 572)
        for map_id in profile['p0Baseline']['maps']:
            manifest_path = ROOT / 'assets/web/maps' / map_id / 'map.json'
            self.assertTrue(manifest_path.is_file(), map_id)
            manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
            self.assertEqual(manifest['id'], map_id)
            self.assertGreater(manifest['width'], 1)
            self.assertGreater(manifest['height'], 1)
            self.assertTrue(manifest['chunks'], map_id)

    def test_classic_catalog_guide_covers_every_non_home_route(self):
        spec = importlib.util.spec_from_file_location(
            'prepare_runtime', ROOT / 'scripts/prepare-runtime.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        profile = json.loads((ROOT / 'content/classic-176/version-profile.json').read_text(encoding='utf-8'))
        routes = set(profile['p0Baseline']['maps'])
        guide = module._build_extended_guide(module.CLASSIC_EXTRA_ROUTES)
        destinations = set(re.findall(r'^MAPMOVE\s+([^\s]+)', guide, re.M)) - {'0'}
        self.assertEqual(destinations, (routes - {'0'}) | set(module.CLASSIC_EXTRA_ROUTES))

    def test_classic_catalog_menus_fit_native_dialogue_and_keep_links_reachable(self):
        spec = importlib.util.spec_from_file_location(
            'prepare_runtime', ROOT / 'scripts/prepare-runtime.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        guide = module._build_extended_guide(module.CLASSIC_EXTRA_ROUTES)
        sections = re.findall(r'^\[@([^\]]+)\]\n(.*?)(?=^\[@|\Z)', guide,
                              re.M | re.S)
        labels = {label for label, _ in sections}
        directory_links = set()
        route_links = set()
        for label, body in sections:
            if not (label == 'main' or label.startswith(('directory', 'page'))):
                continue
            rows = [line for line in body.splitlines() if line.strip()]
            self.assertLessEqual(len(rows), 9, label)
            links = re.findall(r'/@([A-Za-z0-9_]+)', body)
            self.assertTrue(set(links) <= labels | {'exit'}, label)
            if label == 'main' or label.startswith('directory'):
                directory_links.update(link for link in links if link.startswith('page'))
            else:
                route_links.update(link for link in links if link.startswith('route'))
                self.assertLessEqual(len([link for link in links if link.startswith('route')]),
                                     6, label)
        self.assertEqual(directory_links, {label for label in labels if label.startswith('page')})
        self.assertEqual(route_links, {label for label in labels if label.startswith('route')})

    def test_city_services_use_walkable_cells_and_clickable_region_pages(self):
        spec = importlib.util.spec_from_file_location(
            'prepare_runtime', ROOT / 'scripts/prepare-runtime.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        maps = module._source_map_paths()
        services = module.city_services
        for _, map_id, shop_x, shop_y, travel_x, travel_y in services.CITY_HUBS:
            world = module.ClassicMap(maps[map_id].read_bytes())
            self.assertFalse(world.blocked(shop_x, shop_y), (map_id, shop_x, shop_y))
            self.assertFalse(world.blocked(travel_x, travel_y), (map_id, travel_x, travel_y))
            self.assertNotEqual((shop_x, shop_y), (travel_x, travel_y))
        script = services.build_travel_script()
        sections = dict(re.findall(r'^\[@([^\]]+)\]\n(.*?)(?=^\[@|\Z)', script, re.M | re.S))
        for label, body in sections.items():
            if label == 'main' or label.startswith('g'):
                self.assertLessEqual(len([line for line in body.splitlines() if line.strip()]), 9, label)
                self.assertTrue(set(re.findall(r'/@([A-Za-z0-9_]+)', body)) <= sections.keys() | {'exit'}, label)
        self.assertEqual(len(re.findall(r'^MAPMOVE ', script, re.M)), 60)
        for map_id, x, y in re.findall(r'^MAPMOVE\s+(\S+)\s+(\d+)\s+(\d+)$', script, re.M):
            world = module.ClassicMap(maps[map_id].read_bytes())
            self.assertFalse(world.blocked(int(x), int(y)), (map_id, x, y))
        goods = (ROOT / 'content/classic-176/p0/city-general-merchant.txt').read_text(encoding='utf-8')
        self.assertIn('回城石 30 3', goods)
        self.assertIn('回城卷 50 3', goods)
        self.assertNotIn('月卡', goods)

    def test_quest_shop_conversion_keeps_quest_without_old_sale(self):
        spec = importlib.util.spec_from_file_location(
            'prepare_runtime', ROOT / 'scripts/prepare-runtime.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        services = module.city_services
        for (script_name, map_id), quest_name in services.QUEST_ONLY_SHOPS.items():
            source = module.SOURCE / f'Mir200/Envir/Market_Def/{script_name}-{map_id}.txt'
            converted = services.quest_only_script(module.read_text(source))
            self.assertTrue(converted.startswith('[@main]'), script_name)
            self.assertNotIn('[goods]', converted.lower(), script_name)
            self.assertFalse(re.search(r'/@(?:buy|sell|repair|s_repair|yueka)',
                                       converted, re.I), script_name)
            self.assertTrue(any(label.startswith('rw') for label in
                                re.findall(r'^\[@([^\]]+)\]', converted, re.M)), script_name)
            self.assertIn(quest_name, services.normalize_merchant(
                f'{script_name} {map_id} 1 1 原商人 0 5 0'))

    def test_forest_return_npcs_are_accessible_and_go_to_bichon(self):
        spec = importlib.util.spec_from_file_location(
            'prepare_runtime', ROOT / 'scripts/prepare-runtime.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        world = module.ClassicMap(module._source_map_paths()['1'].read_bytes())
        occupied = set()
        for source in ('Merchant.txt', 'Npcs.txt', 'GuardList.txt'):
            for line in module.read_text(module.SOURCE / 'Mir200/Envir' / source).splitlines():
                parts = line.split()
                if len(parts) >= 4 and parts[1] == '1':
                    occupied.add((int(parts[2]), int(parts[3])))
        for _, x, y, _ in module.FOREST_SERVICE_NPCS:
            self.assertFalse(world.blocked(x, y), (x, y))
            self.assertNotIn((x, y), occupied)
        script = (ROOT / 'content/classic-176/p0/forest-return.txt').read_text(encoding='utf-8')
        self.assertIn('MAPMOVE 0 329 268', script)
        self.assertIn('GIVE 回城石 3', script)
        self.assertIn('<返回比奇/@home>', script)

    def test_every_source_route_has_a_walkable_spawn_candidate(self):
        spec = importlib.util.spec_from_file_location(
            'prepare_runtime', ROOT / 'scripts/prepare-runtime.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        profile = json.loads((ROOT / 'content/classic-176/version-profile.json').read_text(encoding='utf-8'))
        source_paths = module._source_map_paths()
        self.assertEqual(set(profile['p0Baseline']['maps']), set(source_paths))
        for map_id in profile['p0Baseline']['maps']:
            world = module.ClassicMap(source_paths[map_id].read_bytes())
            x, y = module._walkable_point(world)
            self.assertGreaterEqual(x, 0, map_id)
            self.assertGreaterEqual(y, 0, map_id)
            self.assertFalse(world.blocked(x, y), map_id)

    def test_cave_route_current_render_dependencies_preserve_national_gap(self):
        from map_asset_bindings import audit_bindings, resolve_bound_frame
        profile = json.loads((ROOT / 'content/classic-176/version-profile.json').read_text(encoding='utf-8'))
        contract = json.loads((ROOT / 'content/classic-176/map-asset-bindings.json').read_text(encoding='utf-8'))
        bindings = audit_bindings(contract)
        self.assertTrue(bindings['technicalOk'], bindings['failures'])
        libraries = {
            name: json.loads((ROOT / 'assets/web/libraries' / name / 'library.json').read_text(encoding='utf-8'))
            for name in ('Tiles', 'SmTiles', 'Objects')
        }
        national_missing = {}
        layers = {'Tiles': 'background', 'SmTiles': 'middle', 'Objects': 'objects'}
        for map_id in profile['p0Baseline']['maps']:
            if map_id in {'0', '1', '2', '3'}:
                continue
            manifest = json.loads((ROOT / 'assets/web/maps' / map_id / 'map.json').read_text(encoding='utf-8'))
            for name, library in libraries.items():
                for index in manifest['dependencies'][name]:
                    if str(index) in library['frames'] or index in library['empty']:
                        continue
                    national_missing.setdefault((map_id, name), set()).add(index)
                    selected = resolve_bound_frame(bindings, map_id=map_id,
                        map_source_sha256=manifest['sourceSha256'], layer=layers[name], library=name, index=index)
                    self.assertIsNotNone(selected, f'{map_id} references unresolved render {name}:{index}')
                    self.assertEqual(selected['index'], index)
                    self.assertEqual(selected['namespace'], '/libraries/reference-ga0/Tiles')
                    self.assertEqual(selected['provenance'], 'reference_source')
                    self.assertFalse(selected['pairingVerified'])
        # Closing a current render gap cannot erase original national fidelity.
        self.assertEqual(set(national_missing), {('GA0', 'Tiles')})
        self.assertEqual(national_missing[('GA0', 'Tiles')], set(contract['bindings'][0]['indices']))
        self.assertEqual(len(national_missing[('GA0', 'Tiles')]), 408)
        entry = bindings['entries'][0]
        self.assertEqual(len(entry['preserveNativeIndices']), 125)
        self.assertEqual(entry['protectedNativeIndices'], [9, 14])
        self.assertEqual(entry['checkedPngFrames'], 408)
        self.assertFalse(entry['mapVersionPairingVerified'])
        self.assertTrue(bindings['historicalFailures'])
        self.assertFalse(bindings['complete'])

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

    def test_exported_national_armour_preserves_both_genders_and_all_actions(self):
        profile = json.loads((ROOT / 'content/classic-176/national-gameplay.json').read_text())
        library = json.loads((ROOT / 'assets/web/actors/NHum/library.json').read_text())
        expected = profile['sourceFamilies']['NHum']
        self.assertEqual(library['sourceSha256'], expected['sourceSha256'])
        self.assertEqual(library['indexSha256'], expected['indexSha256'])
        self.assertEqual(library['sourceFrameCount'], 10800)
        self.assertEqual(library['missing'], [])
        for dress in range(profile['player']['bodyShapes'] * 2):
            for action in profile['player']['actions'].values():
                for direction in range(8):
                    first = dress * 600 + action['start'] + direction * (action['count'] + action['skip'])
                    last = first + action['count'] - 1
                    self.assertIn(str(first), library['frames'])
                    self.assertIn(str(last), library['frames'])

    def test_national_zuma_source_libraries_are_complete(self):
        profile = json.loads((ROOT / 'content/classic-176/national-gameplay.json').read_text())
        for name in ('Mon5', 'Mon7'):
            library = json.loads((ROOT / 'assets/web/actors' / name / 'library.json').read_text())
            expected = profile['sourceFamilies'][name]
            self.assertEqual(library['sourceSha256'], expected['sourceSha256'])
            self.assertEqual(library['sourceFrameCount'], expected['frameCount'])
            self.assertEqual(len(library['frames']), expected['frameCount'])
            self.assertEqual(library['missing'], [])

    def test_p0_monster_visual_catalog_covers_every_baseline_name(self):
        report = audit_monster_visuals()
        self.assertTrue(report['ok'], report)
        self.assertEqual(report['expected'], 22)
        self.assertEqual(report['covered'], 22)
        self.assertEqual(report['missing'], [])
        self.assertGreaterEqual(report['candidateCount'], 1)

    def test_national_monster_libraries_are_hash_locked_and_exported(self):
        profile = json.loads((ROOT / 'content/classic-176/national-gameplay.json').read_text())
        for index in range(1, 19):
            name = f'Mon{index}'
            expected = profile['sourceFamilies'][name]
            library = json.loads((ROOT / 'assets/web/actors' / name / 'library.json').read_text())
            self.assertEqual(library['profile'], profile['id'])
            self.assertEqual(library['sourceSha256'], expected['sourceSha256'])
            self.assertEqual(library['indexSha256'], expected['indexSha256'])
            self.assertEqual(library['sourceFrameCount'], expected['frameCount'])
            self.assertEqual(library['missing'], [])

    def test_classic_ui_libraries_are_hash_locked(self):
        profile = json.loads((ROOT / 'content/classic-176/asset-sources.json').read_text())
        ui = {entry['file']: entry for entry in profile['uiFiles']}
        for name in ('Prguse.Lib', 'Prguse2.Lib', 'Title.Lib', 'ChrSel.Lib', 'MagIcon.Lib'):
            entry = ui[name]
            self.assertGreater(entry['bytes'], 0)
            self.assertRegex(entry['sha256'], r'^[0-9a-f]{64}$')
            self.assertIn(f'/Data/{name}', entry['url'])

    def test_national_ui_manifests_preserve_raw_index_diagnostics(self):
        expected = {
            'chrsel': (280, []),
            'prguse': (510, []),
            'prguse2': (14, []),
            'stateitem': (561, [520652]),
            'items': (571, [292422]),
            'dnitems': (566, [117328]),
            'mmap': (190, [17396799]),
            'magic-icons': (72, []),
        }
        for name, (raw_count, discarded) in expected.items():
            manifest = json.loads((ROOT / 'assets/web/ui-national' / name / 'library.json').read_text())
            self.assertEqual(manifest['rawIndexEntries'], raw_count, name)
            self.assertEqual(manifest['discardedTrailingOffsets'], discarded, name)
            self.assertEqual(manifest['sourceFrameCount'] + len(discarded), raw_count, name)

    def test_exported_national_ui_covers_production_hud_and_window_frames(self):
        layout = json.loads((ROOT / 'content/classic-176/ui-layout.json').read_text())
        self.assertEqual(layout['canvas'], {'width': 800, 'height': 600})
        self.assertEqual(layout['nationalHud']['mainDialog']['index'], 1)
        self.assertEqual(layout['nationalHud']['mainDialog']['y'], 349)
        required = {'prguse': [1, 3, 4, 7, 73, 371, 380, 402],
                    'chrsel': [40, 80, 120, 160, 200, 240]}
        for name, indices in required.items():
            library = json.loads((ROOT / 'assets/web/ui-national' / name / 'library.json').read_text())
            for index in indices:
                frame = library['frames'][str(index)]
                self.assertGreater(frame['width'], 4, f'{name}#{index}')
                self.assertGreater(frame['height'], 1, f'{name}#{index}')

    def test_classic_login_and_select_layout_matches_crystal(self):
        layout = json.loads((ROOT / 'content/classic-176/ui-layout.json').read_text())
        self.assertEqual(layout['login']['library'], 'ChrSel')
        self.assertEqual(layout['login']['index'], 0)
        self.assertEqual(layout['login']['dialog']['index'], 1084)
        self.assertEqual(layout['login']['dialog']['x'], 236)
        self.assertEqual(layout['select']['library'], 'Prguse')
        self.assertEqual(layout['select']['index'], 65)
        self.assertEqual(layout['select']['slot']['count'], 4)
        self.assertEqual(layout['newCharacter']['index'], 73)
        source = (ROOT / 'apps/web/src/classic-auth.ts').read_text()
        self.assertNotIn("uiFrame(fallbackPrguse, 65)", source)
        auth_actions = json.loads((ROOT / 'content/classic-176/auth-actions.json').read_text())
        self.assertEqual(auth_actions['login']['backgroundFrame'], 60)
        self.assertIn("uiFrame(prguse,65)", source)
        markup = (ROOT / 'apps/web/play.html').read_text()
        self.assertIn('data-auth-login', markup)
        self.assertIn('data-auth-select', markup)
        self.assertIn('data-auth-start', markup)

    def test_classic_inventory_and_equipment_layout_matches_crystal(self):
        layout = json.loads((ROOT / 'content/classic-176/ui-layout.json').read_text())
        grid = layout['inventoryGrid']
        self.assertEqual(grid, {'columns': 8, 'visible': 40, 'cellWidth': 36, 'cellHeight': 32,
                                'originX': 9, 'originY': 37, 'gapX': 1, 'gapY': 1})
        self.assertEqual(layout['characterPage'], {'library': 'Prguse', 'index': 340, 'x': 8, 'y': 90})
        self.assertEqual(layout['paperdollActor'], {'x': 70, 'y': 150, 'direction': 4})
        self.assertEqual({k:layout['nationalCharacterPage'][k] for k in ['library','index','x','y']}, {'library': 'prguse', 'index': 378, 'x': 38, 'y': 52})
        self.assertEqual({k:layout['nationalPaperdollActor'][k] for k in ['x','y','direction','scale']}, {'x': 38, 'y': 52, 'direction': 4, 'scale': 1})
        self.assertEqual(layout['nationalHud']['mainDialog']['y'], 349)
        self.assertEqual(layout['nationalInventoryWindow']['width'], 336)
        self.assertEqual(layout['nationalCharacterWindow']['width'], 232)
        self.assertEqual((layout['nationalCharacterWindow']['index'],layout['nationalCharacterWindow']['x'],layout['nationalCharacterWindow']['y']), (370,568,0))
        self.assertEqual(layout['nationalCharacterWindow']['statePage']['index'],382)
        self.assertEqual(layout['nationalCharacterWindow']['skillsPage']['index'],383)
        self.assertEqual(layout['nationalInventoryGrid']['gold'], {'x': 65, 'y': 190, 'width': 136, 'height': 16})
        self.assertEqual(layout['windows']['inventory']['index'], 196)
        self.assertEqual(layout['windows']['character']['index'], 504)
        slots = {cell['slot']: (cell['x'], cell['y']) for cell in layout['equipmentCells']}
        self.assertEqual(slots[1], (123, 7))
        self.assertEqual(slots[0], (163, 7))
        self.assertEqual(slots[4], (203, 7))
        self.assertEqual(slots[9], (8, 242))
        self.assertEqual(len(layout['equipmentCells']), 13)
        national_slots = {cell['slot']: (cell['x'], cell['y']) for cell in layout['nationalEquipmentCells']}
        self.assertEqual(national_slots, {3: (131, 36), 2: (131, 72), 5: (131, 125),
                                          6: (4, 125), 7: (4, 161), 8: (131, 161)})
        self.assertEqual([cell['slot'] for cell in layout['nationalEquipmentAppearance']], [0, 1, 4])
        paperdoll = (ROOT / 'apps/web/src/paperdoll.ts').read_text()
        self.assertIn("playerLayers", paperdoll)
        self.assertIn("377:376", paperdoll)
        self.assertIn('id="paperdoll-actor"', (ROOT / 'apps/web/play.html').read_text())
        drops = (ROOT / 'apps/web/src/ground-items.ts').read_text()
        self.assertIn("fontFamily:'SimSun, Songti SC, serif'", drops)
        self.assertIn('fill:0xffe085', drops)

    def test_classic_cursors_are_hash_locked_and_exported(self):
        profile = json.loads((ROOT / 'content/classic-176/asset-sources.json').read_text())
        layout = json.loads((ROOT / 'content/classic-176/ui-layout.json').read_text())
        files = {entry['file']: entry for entry in profile['cursorFiles']}
        for name in layout['cursors'].values():
            entry = files[name]
            self.assertEqual(entry['bytes'], 4286)
            self.assertRegex(entry['sha256'], r'^[0-9a-f]{64}$')
            path = ROOT / 'assets/web/ui/Cursors' / name
            self.assertTrue(path.is_file(), name)
            self.assertEqual(path.stat().st_size, entry['bytes'])
