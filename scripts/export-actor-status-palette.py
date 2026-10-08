#!/usr/bin/env python3
"""Rebuild the version-locked actor color-level lookup, without exporting sprites.

Reference cliUtil.BuildColorLevels uses the global Prguse palette selected by
ClMain/MShare/Share, integer RGB average and the first nearest nonzero index.
The generated JSON is bundled by Vite; the production filter uploads one small
shared texture. This does not establish the original executable's runtime.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct

ROOT = Path(__file__).resolve().parents[1]
MAIN_SHA256 = '88a12492138bc85ba0429dce3cbd857efcea5b7659cdd8d85a4f2f4db68d5ef2'
PALETTE_SHA256 = '325fe725be263df66b47dbd9817dab2462d3fe54b3dc20bdf04971eb108c2b0f'
CHANNELS = {'green': (0, 1, 0), 'red': (1, 0, 0), 'blue': (0, 0, 1), 'yellow': (1, 1, 0), 'fuchsia': (1, 0, 1), 'gray': (1, 1, 1)}


def default_data_dir():
    """Use the pinned original package, not the mutable native-client link."""
    config = json.loads((ROOT / 'content/classic-176/active-asset-sources.json').read_text(encoding='utf-8'))
    roots = config.get('roots')
    source = roots.get('nationalData') if isinstance(roots, dict) else None
    if not isinstance(source, str) or not source.strip():
        raise ValueError('active asset sources must configure roots.nationalData; use --data-dir for an explicit source')
    path = Path(source)
    return (path if path.is_absolute() else ROOT / path).resolve()


def source_palette(path, expected_sha256):
    path = Path(path)
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        header = stream.read(1080)
        digest.update(header)
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    if digest.hexdigest() != expected_sha256:
        raise ValueError(f'source hash mismatch: {path.name}')
    if not header.startswith(b'#ILIB v1.0-') or len(header) != 1080:
        raise ValueError(f'unsupported national WIL header: {path.name}')
    if struct.unpack_from('<ii', header, 48) != (256, 1024):
        raise ValueError(f'unsupported palette size: {path.name}')
    raw = header[56:1080]
    rgb = [[raw[index + 2], raw[index + 1], raw[index]] for index in range(0, 1024, 4)]
    return raw, rgb


def brightness_maps(palette):
    if len(palette) != 256 or any(len(rgb) != 3 or any(not isinstance(c, int) or not 0 <= c <= 255 for c in rgb) for rgb in palette):
        raise ValueError('palette must contain 256 RGB byte entries')
    maps = {}
    for effect, channels in CHANNELS.items():
        indices = []
        for brightness in range(256):
            target = [brightness * channel for channel in channels]
            # Strictly smaller matches retain the earliest index on ties;
            # index zero is reserved for transparent source pixels.
            match, distance = 0, 768
            for index in range(1, 256):
                candidate = sum(abs(a - b) for a, b in zip(palette[index], target))
                if candidate < distance:
                    match, distance = index, candidate
            indices.append(match)
        maps[effect] = indices
    return maps


def build_resource(profile, data_dir):
    spec = profile['drawEffect']['palette']
    if spec['source'] != 'Prguse.wil' or spec['sourceSha256'] != MAIN_SHA256 or spec['paletteSha256'] != PALETTE_SHA256:
        raise ValueError('actor palette contract is not the locked national Prguse source')
    raw, palette = source_palette(Path(data_dir) / spec['source'], MAIN_SHA256)
    if hashlib.sha256(raw).hexdigest() != PALETTE_SHA256:
        raise ValueError('locked primary palette mismatch')
    compatible = []
    for source in spec['compatibleSources']:
        actor_raw, _ = source_palette(Path(data_dir) / source['source'], source['sourceSha256'])
        if actor_raw != raw:
            raise ValueError(f"actor palette differs from global palette: {source['source']}")
        compatible.append({**source, 'paletteSha256': PALETTE_SHA256})
    maps = brightness_maps(palette)
    index_maps = {effect: [0] + [indices[sum(rgb) // 3] for rgb in palette[1:]] for effect, indices in maps.items()}
    lookup = bytes(channel for indices in maps.values() for index in indices for channel in [*palette[index], 255])
    return {
        'schemaVersion': 1, 'id': 'national-2003-actor-color-levels',
        'evidence': {'pixels': 'native_pixels: locked national Prguse/Hum/Hair/NPC/Mon WIL palette bytes', 'rules': 'reference_source: cliUtil.BuildColorLevels; ClMain/MShare/Share select global Prguse palette', 'runtime': 'Original executable/browser GPU comparison pending; this resource does not quantize screen framebuffer blending'},
        'source': {'file': spec['source'], 'sha256': MAIN_SHA256, 'paletteOffset': 56, 'paletteByteLength': 1024, 'paletteSha256': PALETTE_SHA256},
        'compatibleSources': compatible,
        'algorithm': {'average': 'integer floor((r+g+b)/3)', 'distance': 'Manhattan RGB', 'candidateIndices': [1, 255], 'tie': 'first lowest index', 'transparentSourceIndex': 0, 'transparentOutputIndex': 0},
        'effects': list(CHANNELS), 'palette': palette, 'brightnessMaps': maps, 'sourceIndexMaps': index_maps,
        'lookup': {'width': 256, 'height': len(CHANNELS), 'format': 'rgba8unorm', 'scaleMode': 'nearest', 'rgbaSha256': hashlib.sha256(lookup).hexdigest()},
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-dir', type=Path, help='explicit original WIL source directory; defaults to active source roots.nationalData')
    parser.add_argument('--output', type=Path, default=ROOT / 'content/classic-176/actor-status-palette.json')
    parser.add_argument('--check', action='store_true', help='verify the generated resource without writing it')
    parser.add_argument('--report', type=Path)
    args = parser.parse_args(argv)
    data_dir = args.data_dir if args.data_dir is not None else default_data_dir()
    profile = json.loads((ROOT / 'content/classic-176/actor-status.json').read_text(encoding='utf-8'))
    resource = build_resource(profile, data_dir)
    encoded = json.dumps(resource, ensure_ascii=False, indent=2) + '\n'
    if args.check:
        if not args.output.is_file() or args.output.read_text(encoding='utf-8') != encoded:
            raise ValueError('actor palette resource differs; rebuild it with the locked original sources')
    else:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(encoded, encoding='utf-8')
    report = {'schemaVersion': 1, 'ok': True, 'mode': 'check' if args.check else 'export', 'dataDir': str(data_dir), 'sourceSelection': 'explicit_data_dir' if args.data_dir is not None else 'active_roots_nationalData', 'scope': 'source palette + exact reference color-level LUT only; no original/browser runtime or screen framebuffer quantization', 'source': resource['source'], 'compatibleSourceCount': len(resource['compatibleSources']), 'brightnessEntries': 6 * 256, 'sourceIndexEntries': 6 * 256, 'resourceSha256': hashlib.sha256(encoded.encode('utf-8')).hexdigest(), 'lookup': resource['lookup']}
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
