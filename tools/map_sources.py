"""One hash-locked map input for browser cells and server collision data."""

import hashlib
import json
from pathlib import Path

from map_tool import ClassicMap

CONTRACT = Path('content/classic-176/map-sources.json')
PROFILE = Path('content/classic-176/version-profile.json')


def digest(payload):
    return hashlib.sha256(payload).hexdigest()


def relative_file(root, name):
    path = Path(name)
    if path.is_absolute() or '..' in path.parts or '\\' in name:
        raise ValueError(f'Unsafe map source path: {name}')
    target = (root / path).resolve()
    if not target.is_relative_to(root.resolve()):
        raise ValueError(f'Map source escapes repository: {name}')
    return target


def load_contract(root):
    contract = json.loads((root / CONTRACT).read_text(encoding='utf-8'))
    profile = json.loads((root / PROFILE).read_text(encoding='utf-8'))
    ids = profile['p0Baseline']['maps']
    baseline = contract['baseline']['maps']
    if contract.get('schemaVersion') != 1 or contract.get('domain') != 'map-cells':
        raise ValueError('Unsupported map source contract')
    if [entry['id'] for entry in baseline] != ids:
        raise ValueError('Map source contract must preserve the ordered route catalog')
    if len({map_id.casefold() for map_id in ids}) != len(ids):
        raise ValueError('Duplicate map ids in route catalog')
    if digest('\n'.join(ids).encode('utf-8')) != contract['baseline']['orderedMapIdsSha256']:
        raise ValueError('Map route order hash mismatch')
    overrides = contract['overrides']
    override_ids = [entry['id'] for entry in overrides]
    if len(set(override_ids)) != len(override_ids) or not set(override_ids).issubset(ids):
        raise ValueError('Duplicate or unknown original map override')
    by_id = {entry['id']: entry for entry in baseline}
    for override in overrides:
        previous = by_id[override['id']]
        if not previous['originalClientMapPresent'] or override['previousServerSha256'] != previous['sha256']:
            raise ValueError(f"Original map baseline mismatch: {override['id']}")
        if (previous['width'], previous['height']) != (override['width'], override['height']):
            raise ValueError(f"Original map dimensions differ from route baseline: {override['id']}")
    absent = [entry['id'] for entry in baseline if not entry['originalClientMapPresent']]
    if absent != contract['serverRoutesAbsentFromInstalledClient']:
        raise ValueError('Installed-client map absence inventory mismatch')
    for entry in baseline + overrides:
        relative_file(root, entry['path'])
        map_id = entry['id']
        if '/' in map_id or '\\' in map_id or map_id in ('', '.', '..'):
            raise ValueError(f'Unsafe map id: {map_id}')
    return contract


def checked_payload(path, entry):
    payload = path.read_bytes()
    if len(payload) != entry['bytes'] or digest(payload) != entry['sha256']:
        raise ValueError(f"Map source hash mismatch: {entry['id']} ({path.name})")
    world = ClassicMap(payload)
    if (world.width, world.height) != (entry['width'], entry['height']):
        raise ValueError(f"Map source dimensions mismatch: {entry['id']}")
    return payload


def resolve_maps(root, map_ids=None):
    """Preflight every requested source before a caller writes any output.

    Missing or changed original overrides are errors, never a vendor fallback.
    Maps absent from this installation retain the explicitly recorded server source.
    """
    root = Path(root).resolve()
    contract = load_contract(root)
    baseline = {entry['id']: entry for entry in contract['baseline']['maps']}
    overrides = {entry['id']: entry for entry in contract['overrides']}
    selected = list(baseline) if map_ids is None else list(map_ids)
    if len(set(selected)) != len(selected) or not set(selected).issubset(baseline):
        raise ValueError('Unknown or duplicate requested map id')
    result = {}
    for map_id in selected:
        entry = baseline[map_id]
        baseline_path = relative_file(root, entry['path'])
        checked_payload(baseline_path, entry)
        if map_id in overrides:
            override = overrides[map_id]
            if override['previousServerSha256'] != entry['sha256'] or not entry['originalClientMapPresent']:
                raise ValueError(f'Original map baseline mismatch: {map_id}')
            entry = override
        path = relative_file(root, entry['path'])
        if path != baseline_path:
            try:
                checked_payload(path, entry)
            except FileNotFoundError as error:
                raise FileNotFoundError(f'Missing locked map {map_id}; run scripts/import-native-map-sources.py with the reference client Map directory') from error
        result[map_id] = path
    return result


def import_native_maps(root, client_map_directory):
    """Import only the six differing originals after validating all six inputs."""
    root = Path(root).resolve()
    contract = load_contract(root)
    directory = Path(client_map_directory)
    files = {}
    for path in directory.iterdir():
        if path.is_file() and path.suffix.casefold() == '.map':
            key = path.name.casefold()
            if key in files:
                raise ValueError(f'Ambiguous original map filename: {path.name}')
            files[key] = path
    operations = []
    for entry in contract['overrides']:
        source = files.get(entry['installedFile'].casefold())
        if source is None:
            raise FileNotFoundError(directory / entry['installedFile'])
        operations.append((relative_file(root, entry['path']), checked_payload(source, entry)))
    for target, payload in operations:
        write_bytes_if_changed(target, payload)
    return {entry['id']: entry['sha256'] for entry in contract['overrides']}


def write_bytes_if_changed(target, payload):
    if target.is_file() and target.read_bytes() == payload:
        return False
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(target.name + '.map-source.tmp')
    try:
        temporary.write_bytes(payload)
        temporary.replace(target)
    finally:
        if temporary.exists():
            temporary.unlink()
    return True


def refresh_runtime_maps(root, map_directory):
    """Replace only declared overrides; refuse unrecognized runtime map data.

    The command caller must stop the engine normally and back up saves first.
    This function neither stops services nor changes world definitions or saves.
    """
    root = Path(root).resolve()
    contract = load_contract(root)
    entries = contract['overrides']
    sources = resolve_maps(root, [entry['id'] for entry in entries])
    operations = []
    for entry in entries:
        target = Path(map_directory) / (entry['id'] + '.map')
        before = digest(target.read_bytes()) if target.is_file() else None
        if before not in (None, entry['sha256'], entry['previousServerSha256']):
            raise ValueError(f"Unrecognized runtime map; preserve and review it before refreshing: {entry['id']}")
        operations.append((entry, target, checked_payload(sources[entry['id']], entry), before))
    rows = []
    for entry, target, payload, before in operations:
        changed = write_bytes_if_changed(target, payload)
        rows.append({'id': entry['id'], 'beforeSha256': before,
                     'sourceSha256': entry['sha256'], 'changed': changed})
    return rows


def map_provenance(root, map_id):
    contract = load_contract(Path(root))
    entry = next(entry for entry in contract['baseline']['maps'] if entry['id'] == map_id)
    overridden = any(row['id'] == map_id for row in contract['overrides'])
    return {
        'contract': CONTRACT.as_posix(),
        'contractSha256': digest((Path(root) / CONTRACT).read_bytes()),
        'classification': 'installed-client' if entry['originalClientMapPresent'] else 'server-route',
        'originalClientMapPresent': entry['originalClientMapPresent'],
        'originalClientOverride': overridden,
        'nativeRuntimeAcceptance': 'pending',
        'policy': 'Shared browser graphics and server collision bytes; source identity alone does not prove runtime or historical acceptance.',
    }
