#!/usr/bin/env python3
"""Fetch hash-locked libraries and export frames used by every browser map."""
import hashlib
import argparse
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from crystal_lib import CrystalLibrary, export
from map_tool import ClassicMap, export as export_map
from map_sources import resolve_maps, map_provenance, digest


def export_browser_maps(root, destination, map_ids=None):
    """Export locked cells without importing or replacing any graphics library."""
    sources = resolve_maps(root, map_ids)
    rows = []
    for map_id, source_map in sources.items():
        target = Path(destination) / map_id
        manifest_path = target / 'map.json'
        source_payload = source_map.read_bytes()
        expected_hash = digest(source_payload)
        world = ClassicMap(source_payload)
        manifest = None
        if manifest_path.is_file():
            try:
                existing = json.loads(manifest_path.read_text(encoding='utf-8'))
                intact = (existing.get('sourceSha256') == expected_hash
                          and existing.get('width') == world.width and existing.get('height') == world.height
                          and existing.get('cellBytes') == 12 and existing.get('cellOrder') == 'column-major'
                          and existing.get('format') == 'classic-12')
                for chunk in existing.get('chunks', []):
                    chunk_file = target / chunk['file']
                    if Path(chunk['file']).name != chunk['file'] or not chunk_file.is_file():
                        intact = False
                        break
                    payload = chunk_file.read_bytes()
                    if (digest(payload) != chunk['sha256'] or len(payload) != chunk['width'] * chunk['height'] * 12
                            or chunk['width'] <= 0 or chunk['height'] <= 0
                            or not 0 <= chunk['x'] < chunk['x'] + chunk['width'] <= world.width
                            or not 0 <= chunk['y'] < chunk['y'] + chunk['height'] <= world.height):
                        intact = False
                        break
                if intact and existing.get('chunks') and sum(chunk['width'] * chunk['height'] for chunk in existing['chunks']) == world.width * world.height:
                    manifest = existing
            except (ValueError, KeyError, TypeError):
                pass
        rebuilt = manifest is None
        if rebuilt:
            manifest = export_map(source_map, target)
        manifest['id'] = map_id
        manifest.setdefault('provenance', {})['sharedSource'] = map_provenance(root, map_id)
        encoded = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
        if not manifest_path.is_file() or manifest_path.read_bytes() != encoded:
            manifest_path.write_bytes(encoded)
        rows.append({'id': map_id, 'sourceSha256': expected_hash,
                     'chunks': len(manifest['chunks']), 'rebuilt': rebuilt})
    return rows


def import_reference_cursors(sources):
    """Import only the pinned reference cursors, without replacing native atlases."""
    for source in sources.get('cursorFiles', []):
        destination = ROOT / 'assets/web/ui/Cursors' / source['file']
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.exists() and hashlib.sha256(destination.read_bytes()).hexdigest() == source['sha256']:
            continue
        temporary = destination.with_suffix('.download')
        subprocess.run(['curl', '-fLsS', '--retry', '2', '--max-time', '60',
                        source['url'], '-o', str(temporary)], check=True)
        payload = temporary.read_bytes()
        if len(payload) != source['bytes'] or hashlib.sha256(payload).hexdigest() != source['sha256']:
            raise ValueError(f"Cursor source hash changed: {source['file']}")
        temporary.replace(destination)
        print(source['file'], 'hash-locked reference cursor', flush=True)
    (ROOT / 'assets/web/ui/Cursors/provenance.json').write_text(json.dumps({
        'source': 'pinned Crystal reference cursors',
        'nationalRuntimeComparison': 'pending',
        'files': sources.get('cursorFiles', []),
    }, ensure_ascii=False, indent=2), encoding='utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--cursors-only', action='store_true', help='import pinned reference cursors only; preserve national gameplay assets')
    mode.add_argument('--maps-only', action='store_true', help='export shared original/server map cells only; preserve all gameplay libraries')
    parser.add_argument('--map-ids', nargs='+', help='export only these canonical route ids with --maps-only')
    parser.add_argument('--output-root', type=Path, help='map export destination with --maps-only (default: assets/web/maps)')
    args = parser.parse_args()
    if (args.map_ids or args.output_root) and not args.maps_only:
        parser.error('--map-ids and --output-root require --maps-only')
    if args.maps_only:
        rows = export_browser_maps(ROOT, args.output_root or ROOT / 'assets/web/maps', args.map_ids)
        print(json.dumps({'maps': rows, 'graphicsLibrariesChanged': False}, ensure_ascii=False, indent=2))
        return
    sources = json.loads((ROOT / 'content/classic-176/asset-sources.json').read_text())
    if args.cursors_only:
        import_reference_cursors(sources)
        return
    if (ROOT / 'assets/web/national-gameplay-import.json').exists():
        parser.error('national gameplay assets are installed; this reference importer would overwrite them. Use import-national-game-assets.py for gameplay or --cursors-only for reference cursors.')
    export_browser_maps(ROOT, ROOT / 'assets/web/maps')
    worlds = [json.loads(path.read_text()) for path in sorted((ROOT / 'assets/web/maps').glob('*/map.json'))]
    if not worlds:
        raise ValueError("No exported browser maps found")
    dependencies = {name: set() for name in ('Tiles', 'SmTiles', 'Objects')}
    for world in worlds:
        for name in dependencies:
            dependencies[name].update(world['dependencies'][name])
    groups = [('map', sources['files']), ('actor', sources.get('actorFiles', [])),
              ('effect', sources.get('effectFiles', [])), ('item', sources.get('itemFiles', [])),
              ('ui', sources.get('uiFiles', []))]
    for kind, source in [(kind, source) for kind, entries in groups for source in entries]:
        raw = ROOT / {'map':'assets/raw/crystal-shanda','actor':'assets/raw/crystal-actors',
                      'effect':'assets/raw/crystal-effects','item':'assets/raw/crystal-items',
                      'ui':'assets/raw/crystal-ui'}[kind]
        raw.mkdir(parents=True, exist_ok=True)
        path = raw / source['file']
        def valid(candidate):
            return (candidate.exists() and candidate.stat().st_size == source['bytes']
                    and hashlib.sha256(candidate.read_bytes()).hexdigest() == source['sha256'])
        if not valid(path):
            temporary = path.with_suffix('.download')
            subprocess.run(['curl', '-fLsS', '--retry', '2', '--max-time', '180',
                            source['url'], '-o', str(temporary)], check=True)
            if not valid(temporary):
                raise ValueError(f"Source hash changed: {source['file']}; review before importing")
            temporary.replace(path)
        name = path.stem
        destination = ROOT / {'map':'assets/web/libraries','actor':'assets/web/actors',
                              'effect':'assets/web/effects','item':'assets/web/items',
                              'ui':'assets/web/ui'}[kind] / name
        if kind == 'map':
            indices = sorted(dependencies[name])
        elif kind in ('effect', 'ui') and source.get('ranges'):
            indices = sorted({index for start, end in source['ranges'] for index in range(start, end + 1)})
        else:
            indices = range(CrystalLibrary(path.read_bytes()).count)
        result = export(path, destination, indices)
        print(name, 'frames:', len(result['frames']), 'empty:', len(result['empty']),
              'missing:', len(result['missing']), flush=True)
    for source in sources.get('audioFiles', []):
        raw = ROOT / 'assets/raw/crystal-sounds'
        raw.mkdir(parents=True, exist_ok=True)
        path = raw / source['file']
        def valid_audio(candidate):
            return (candidate.exists() and candidate.stat().st_size == source['bytes']
                    and hashlib.sha256(candidate.read_bytes()).hexdigest() == source['sha256'])
        if not valid_audio(path):
            temporary = path.with_suffix(path.suffix + '.download')
            subprocess.run(['curl', '-fLsS', '--retry', '2', '--max-time', '180',
                            source['url'], '-o', str(temporary)], check=True)
            if not valid_audio(temporary):
                raise ValueError(f"Source hash changed: {source['file']}; review before importing")
            temporary.replace(path)
        destination = ROOT / 'assets/web/audio' / source['file']
        destination.parent.mkdir(parents=True, exist_ok=True)
        if not valid_audio(destination):
            destination.write_bytes(path.read_bytes())
        print(source['file'], 'audio:', source['role'], source['bytes'], 'bytes', flush=True)
    for source in sources.get('cursorFiles', []):
        raw = ROOT / 'assets/raw/crystal-cursors'
        raw.mkdir(parents=True, exist_ok=True)
        path = raw / source['file']
        def valid_cursor(candidate, expected=source):
            return (candidate.exists() and candidate.stat().st_size == expected['bytes']
                    and hashlib.sha256(candidate.read_bytes()).hexdigest() == expected['sha256'])
        if not valid_cursor(path):
            temporary = path.with_suffix(path.suffix + '.download')
            subprocess.run(['curl', '-fLsS', '--retry', '2', '--max-time', '60',
                            source['url'], '-o', str(temporary)], check=True)
            if not valid_cursor(temporary):
                raise ValueError(f"Source hash changed: {source['file']}; review before importing")
            temporary.replace(path)
        destination = ROOT / 'assets/web/ui/Cursors' / source['file']
        destination.parent.mkdir(parents=True, exist_ok=True)
        if not valid_cursor(destination):
            destination.write_bytes(path.read_bytes())
        print(source['file'], 'cursor:', source['bytes'], 'bytes', flush=True)


if __name__ == '__main__':
    main()
