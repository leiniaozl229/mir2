#!/usr/bin/env python3
"""Plan or export only the two pinned server extension maps; never prepare a world."""

import argparse
import datetime
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from map_tool import ClassicMap, export as export_map

EXTENSION_IDS = {'D718', 'D719'}
CONTRACT = Path('content/classic-176/map-server-extensions.json')
PROFILE = Path('content/classic-176/version-profile.json')


def digest(payload):
    return hashlib.sha256(payload).hexdigest()


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf-8')


def relative_file(root, name):
    path = Path(name)
    if path.is_absolute() or '..' in path.parts:
        raise ValueError(f'Unsafe relative source: {name}')
    resolved = (root / path).resolve()
    if not resolved.is_relative_to(root.resolve()):
        raise ValueError(f'Source escapes repository: {name}')
    return resolved


def _git(source, *args):
    return subprocess.check_output(['git', *args], cwd=source, text=True).strip()


def _prepare_module(root):
    spec = importlib.util.spec_from_file_location(
        '_extension_map_prepare', root / 'scripts/prepare-runtime.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def verify_dependencies(root, references, locks):
    """Check existing PNG bytes and original library/index locks without decoding."""
    result = {}
    for name, indices in zip(('Tiles', 'SmTiles', 'Objects'), references):
        directory = root / 'assets/web/libraries' / name
        library = json.loads((directory / 'library.json').read_text(encoding='utf-8'))
        for key in ('source', 'sourceSha256', 'index', 'indexSha256'):
            if library.get(key) != locks[name][key]:
                raise ValueError(f'{name} original library lock mismatch: {key}')
        empty = set(library.get('empty', []))
        checked = []
        for index in sorted(indices):
            frame = library['frames'].get(str(index))
            if frame is None:
                if index not in empty:
                    raise ValueError(f'Unresolved {name}:{index}; no exported frame or known empty')
                if not 0 <= index < library['sourceFrameCount']:
                    raise ValueError(f'Out-of-range empty {name}:{index}')
                checked.append({'index': index, 'empty': True})
                continue
            if frame.get('index') != index or frame.get('sourceIndex', index) != index:
                raise ValueError(f'{name}:{index} source index mismatch')
            filename = frame['file']
            if Path(filename).name != filename:
                raise ValueError(f'Unsafe {name}:{index} PNG filename')
            path = directory / filename
            if not path.is_file() or path.resolve().parent != directory.resolve():
                raise ValueError(f'Missing or escaped {name}:{index} PNG')
            payload = path.read_bytes()
            if digest(payload) != frame['sha256']:
                raise ValueError(f'Changed {name}:{index} PNG bytes')
            if not payload.startswith(b'\x89PNG\r\n\x1a\n'):
                raise ValueError(f'Invalid {name}:{index} PNG signature')
            if (int.from_bytes(payload[16:20], 'big'), int.from_bytes(payload[20:24], 'big')) != (
                    frame['width'], frame['height']):
                raise ValueError(f'Changed {name}:{index} PNG geometry')
            checked.append({'index': index, 'sha256': frame['sha256']})
        result[name] = {'references': len(indices), 'verified': len(checked),
                        'orderedFrameEvidenceSha256': digest(json_bytes(checked)),
                        'sourceSha256': library['sourceSha256'],
                        'indexSha256': library['indexSha256']}
    return result


def _expected_export(source, entry, contract):
    """Use the production exporter and independently reconstruct every cell byte."""
    raw = source.read_bytes()
    world = ClassicMap(raw)
    with tempfile.TemporaryDirectory(prefix='mir2-server-map-plan-') as temporary:
        directory = Path(temporary)
        manifest = export_map(source, directory)
        files = {}
        cells = bytearray(world.cell_bytes)
        covered = set()
        for chunk in manifest['chunks']:
            payload = (directory / chunk['file']).read_bytes()
            if len(payload) != chunk['bytes'] or digest(payload) != chunk['sha256']:
                raise ValueError(f"Exported chunk changed: {chunk['file']}")
            files[chunk['file']] = payload
            for dx in range(chunk['width']):
                for dy in range(chunk['height']):
                    x, y = chunk['x'] + dx, chunk['y'] + dy
                    if (x, y) in covered:
                        raise ValueError('Overlapping map chunks')
                    covered.add((x, y))
                start = ((chunk['x'] + dx) * world.height + chunk['y']) * 12
                offset = dx * chunk['height'] * 12
                cells[start:start + chunk['height'] * 12] = payload[offset:offset + chunk['height'] * 12]
        if len(covered) != world.width * world.height or bytes(cells) != raw[52:52 + world.cell_bytes]:
            raise ValueError('Browser chunks do not reproduce the source cell bytes')
    manifest['id'] = entry['id']
    manifest['provenance'] = {
        'classification': 'server-extension', 'sourcePath': entry['source']['path'],
        'sourceGitBlob': entry['source']['gitBlob'],
        'sourceCommit': contract['source']['submoduleCommit'],
        'contract': CONTRACT.as_posix(), 'sourceMapInfoEntry': None,
        'sourceMonGenEntries': 0, 'generatedRoute': entry['generatedRoute'],
        'originalClientMapPresent': False,
        'originalClientEvidenceScope': 'local original 528-map filename inventory; no native runtime comparison',
        'cellBytePolicy': 'raw source bytes; no palette conversion or quantization',
    }
    files['map.json'] = json_bytes(manifest)
    return manifest, files


def make_plan(root=ROOT, output_root=None):
    root = Path(root).resolve()
    output_root = Path(output_root or root / 'assets/web/maps').resolve()
    contract = json.loads((root / CONTRACT).read_text(encoding='utf-8'))
    profile = json.loads((root / PROFILE).read_text(encoding='utf-8'))
    entries = contract['maps']
    if len(entries) != 2 or {e['id'] for e in entries} != EXTENSION_IDS:
        raise ValueError('Only D718 and D719 are owned by this exporter')
    maps = profile['p0Baseline']['maps']
    baseline = [map_id for map_id in maps if map_id not in EXTENSION_IDS]
    if len(maps) != 572 or len(set(maps)) != 572 or len(baseline) != 570:
        raise ValueError('Profile must preserve 570 existing maps and append exactly two extensions')
    if digest(json.dumps(baseline, separators=(',', ':')).encode()) != contract['preservedBaseline']['orderedMapIdsSha256']:
        raise ValueError('Existing 570 map IDs or order changed')
    source_repo = root / 'vendor/mirserver-data'
    if _git(source_repo, 'rev-parse', 'HEAD') != contract['source']['submoduleCommit']:
        raise ValueError('Server map source commit changed')
    module = _prepare_module(root)
    names, flags = module._map_names(), module._map_info_flags()
    report = {'schemaVersion': 1, 'domain': 'maps', 'ok': True, 'classification': 'server-extension',
              'existingProfileMaps': 570, 'extensionMaps': 2, 'profileMaps': len(maps),
              'sourceCommit': contract['source']['submoduleCommit'], 'maps': [],
              'originalClientEvidence': contract['originalClientEvidence'],
              'graphicsPolicy': 'Existing library PNG bytes/geometry are checked and reused; no image or palette conversion.',
              'runtimeChanged': False, 'databaseAccessed': False,
              'runtimeRouteConfigurationUpdated': False,
              'nativeRuntimeVerified': False, 'browserRuntimeVerified': False,
              'sourceSha256': {p.as_posix(): digest((root / p).read_bytes()) for p in
                              [CONTRACT, PROFILE, Path('scripts/prepare-runtime.py'),
                               Path('scripts/export-server-extension-maps.py'), Path('tools/map_tool.py')]}}
    operations = []
    for entry in entries:
        map_id = entry['id']
        source = relative_file(root, entry['source']['path'])
        if source.parent != (source_repo / 'Mir200/Map').resolve() or source.stem.upper() != map_id:
            raise ValueError(f'Unexpected extension source path: {map_id}')
        raw = source.read_bytes()
        blob = hashlib.sha1(('blob ' + str(len(raw)) + '\0').encode() + raw).hexdigest()
        tree = _git(source_repo, 'ls-tree', 'HEAD', '--', source.relative_to(source_repo).as_posix()).split()
        if (len(raw) != entry['source']['bytes'] or digest(raw) != entry['source']['sha256']
                or blob != entry['source']['gitBlob'] or len(tree) < 3 or tree[2] != blob):
            raise ValueError(f'Changed or untracked extension map: {map_id}')
        for key in ('sourceMapInfo', 'sourceMonGen'):
            path = relative_file(root, entry[key]['path'])
            if digest(path.read_bytes()) != entry[key]['sha256']:
                raise ValueError(f'{map_id} source {key} changed')
        if map_id.casefold() in names or map_id.casefold() in flags:
            raise ValueError(f'{map_id} acquired a source MapInfo entry; review generated fallback')
        mon_gen = module.read_text(source_repo / 'Mir200/Envir/MonGen.txt')
        if any(line.split() and line.split()[0].casefold() == map_id.casefold()
               for line in mon_gen.splitlines()):
            raise ValueError(f'{map_id} acquired source spawns; review generated fallback')
        world = ClassicMap(raw)
        if (world.width, world.height, world.trailing_bytes) != (entry['width'], entry['height'], entry['trailingBytes']):
            raise ValueError(f'{map_id} source geometry changed')
        generated = entry['generatedRoute']
        route = module.CLASSIC_EXTRA_ROUTES[map_id]
        if any(route[key] != (tuple(generated[key]) if key in ('start', 'npc') else generated[key])
               for key in ('name', 'start', 'npc', 'monster')):
            raise ValueError(f'{map_id} generated route changed')
        if world.blocked(*generated['start']) or world.blocked(*generated['npc']):
            raise ValueError(f'{map_id} generated arrival or NPC is blocked')
        refs, _ = world.dependencies()
        dependencies = verify_dependencies(root, refs, contract['libraryLocks'])
        manifest, files = _expected_export(source, entry, contract)
        target = output_root / map_id
        if target.resolve().parent != output_root:
            raise ValueError(f'Extension output escapes destination: {map_id}')
        if any((target / name).resolve().parent != target.resolve() for name in files):
            raise ValueError(f'Existing extension output file escapes destination: {map_id}')
        changed = [name for name, payload in files.items()
                   if not (target / name).is_file() or (target / name).read_bytes() != payload]
        report['maps'].append({'id': map_id, 'sourceSha256': digest(raw), 'sourceBytes': len(raw),
                               'sourceGitBlob': blob, 'manifestSha256': digest(files['map.json']),
                               'width': world.width, 'height': world.height, 'chunks': len(manifest['chunks']),
                               'chunkBytes': sum(c['bytes'] for c in manifest['chunks']),
                               'cellBytesVerified': True, 'dependencies': dependencies,
                               'sourceMapInfoEntry': None, 'sourceMonGenEntries': 0,
                               'generatedRoute': generated, 'filesNeedingWrite': changed})
        operations.append((target, files))
    return report, operations, baseline


def _baseline_snapshot(output_root, baseline):
    return {map_id: digest((output_root / map_id / 'map.json').read_bytes())
            for map_id in baseline if (output_root / map_id / 'map.json').is_file()}


def execute(root=ROOT, output_root=None, apply=False):
    output_root = Path(output_root or Path(root) / 'assets/web/maps').resolve()
    report, operations, baseline = make_plan(root, output_root)
    before = _baseline_snapshot(output_root, baseline)
    written = 0
    if apply:
        for target, files in operations:
            target.mkdir(parents=True, exist_ok=True)
            for name, payload in files.items():
                path = target / name
                if path.resolve().parent != target.resolve():
                    raise ValueError(f'Escaped extension output file: {name}')
                if path.is_file() and path.read_bytes() == payload:
                    continue
                descriptor, temporary = tempfile.mkstemp(prefix='.extension-map-', dir=target)
                try:
                    with os.fdopen(descriptor, 'wb') as stream:
                        stream.write(payload)
                    os.replace(temporary, path)
                finally:
                    if Path(temporary).exists():
                        Path(temporary).unlink()
                written += 1
        for target, files in operations:
            if any((target / name).read_bytes() != payload for name, payload in files.items()):
                raise ValueError('Post-export byte verification failed')
    after = _baseline_snapshot(output_root, baseline)
    if before != after:
        raise ValueError('Existing map manifests changed during export')
    report.update(mode='apply' if apply else 'plan', writtenFiles=written,
                  existingMapManifestsObserved=len(before), existingMapManifestsPreserved=True,
                  existingManifestSnapshotSha256=digest(json_bytes(before)))
    return report


def write_report(path, report):
    payload = json_bytes(report)
    if path.exists():
        if path.read_bytes() != payload:
            raise ValueError(f'Refusing to replace archived report: {path}')
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='write only D718/D719 map manifests/chunks')
    parser.add_argument('--output-root', type=Path, default=ROOT / 'assets/web/maps')
    parser.add_argument('--report', type=Path, help='new report path; an existing different report is never overwritten')
    args = parser.parse_args()
    now = datetime.datetime.now(datetime.timezone.utc)
    report_path = args.report or ROOT / '.runtime/reports' / (
        f"map-server-extensions-{'apply' if args.apply else 'plan'}-{now.strftime('%Y%m%dT%H%M%S%fZ')}.json")
    if report_path.exists():
        parser.exit(1, f'Refusing to replace archived report: {report_path}\n')
    try:
        report = execute(output_root=args.output_root, apply=args.apply)
        report['recordedAt'] = now.isoformat()
        write_report(report_path, report)
    except (ValueError, OSError, KeyError, subprocess.CalledProcessError) as error:
        parser.exit(1, f'Extension map export blocked: {error}\n')
    print(f"{report['mode']}: 2 server extension maps; {report['writtenFiles']} files written; original maps preserved; report: {report_path}")


if __name__ == '__main__':
    main()
