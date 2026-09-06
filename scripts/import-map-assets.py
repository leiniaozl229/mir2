#!/usr/bin/env python3
"""Fetch hash-locked libraries and export frames used by every browser map."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from crystal_lib import CrystalLibrary, export
from map_tool import export as export_map


def main():
    sources = json.loads((ROOT / 'content/classic-176/asset-sources.json').read_text())
    map_source_dir = ROOT / 'vendor/mirserver-data/Mir200/Map'
    profile = json.loads((ROOT / 'content/classic-176/version-profile.json').read_text())
    map_ids = list(profile['p0Baseline']['maps'])
    if '0122' not in map_ids:
        map_ids.append('0122')
    map_files = {path.stem.casefold(): path for path in map_source_dir.glob('*.map')}
    for map_id in map_ids:
        source_map = map_files.get(map_id.casefold())
        if source_map is None:
            raise FileNotFoundError(map_source_dir / f'{map_id}.map')
        destination = ROOT / 'assets/web/maps' / map_id
        manifest_path = destination / 'map.json'
        expected_hash = hashlib.sha256(source_map.read_bytes()).hexdigest()
        current_hash = None
        if manifest_path.exists():
            try:
                current_hash = json.loads(manifest_path.read_text()).get('sourceSha256')
            except json.JSONDecodeError:
                pass
        if current_hash != expected_hash:
            manifest = export_map(source_map, destination)
            # Source packs contain lower-case filenames for some maps while
            # runtime route ids are case-stable. Keep the manifest id aligned
            # with the browser route and profile.
            if manifest['id'] != map_id:
                manifest['id'] = map_id
                manifest_path.write_text(json.dumps(manifest, indent=2))
            print(map_id, 'map:', manifest['width'], 'x', manifest['height'],
                  'chunks:', len(manifest['chunks']), flush=True)
        elif manifest_path.exists():
            manifest = json.loads(manifest_path.read_text())
            if manifest.get('id') != map_id:
                manifest['id'] = map_id
                manifest_path.write_text(json.dumps(manifest, indent=2))
    worlds = [json.loads(path.read_text()) for path in sorted((ROOT / 'assets/web/maps').glob('*/map.json'))]
    if not worlds:
        raise ValueError("No exported browser maps found")
    dependencies = {name: set() for name in ('Tiles', 'SmTiles', 'Objects')}
    for world in worlds:
        for name in dependencies:
            dependencies[name].update(world['dependencies'][name])
    groups = [('map', sources['files']), ('actor', sources.get('actorFiles', [])),
              ('effect', sources.get('effectFiles', [])), ('item', sources.get('itemFiles', []))]
    for kind, source in [(kind, source) for kind, entries in groups for source in entries]:
        raw = ROOT / {'map':'assets/raw/crystal-shanda','actor':'assets/raw/crystal-actors',
                      'effect':'assets/raw/crystal-effects','item':'assets/raw/crystal-items'}[kind]
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
                              'effect':'assets/web/effects','item':'assets/web/items'}[kind] / name
        if kind == 'map':
            indices = sorted(dependencies[name])
        elif kind == 'effect':
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


if __name__ == '__main__':
    main()
