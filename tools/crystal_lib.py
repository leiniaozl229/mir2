"""Read Crystal v2/v3 libraries without Windows or DirectX.

Layout reference: Suprcode/Crystal Client/MirGraphics/MLibrary.cs.
Pixels are gzip-compressed BGRA8; original indices and signed offsets survive.
"""
import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path
import struct
import zlib

IMAGE_HEADER = struct.Struct('<hhhhhhBi')
ACTION_RECORD = struct.Struct('<BiiiiiiiiBB')
MAX_PIXELS = 16_777_216


def png_rgba(width, height, bgra):
    if len(bgra) != width * height * 4:
        raise ValueError('pixel byte count mismatch')
    rgba = bytearray(bgra)
    rgba[0::4], rgba[2::4] = bgra[2::4], bgra[0::4]
    rows = b''.join(b'\0' + rgba[y*width*4:(y+1)*width*4] for y in range(height))
    def chunk(kind, payload):
        return struct.pack('>I', len(payload)) + kind + payload + struct.pack('>I', zlib.crc32(kind + payload))
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(rows, 9)) + chunk(b'IEND', b''))


class CrystalLibrary:
    def __init__(self, data):
        if len(data) < 8:
            raise ValueError('truncated library')
        self.data = data
        self.version, self.count = struct.unpack_from('<ii', data)
        if self.version not in (2, 3) or not 0 <= self.count <= 1_000_000:
            raise ValueError('unsupported library version/count')
        start = 12 if self.version == 3 else 8
        self.table_end = start + self.count * 4
        if self.table_end > len(data):
            raise ValueError('truncated index table')
        self.indices = struct.unpack_from(f'<{self.count}i', data, start)
        if any(offset and not self.table_end <= offset < len(data) for offset in self.indices):
            raise ValueError('image offset outside library')
        self.actions = {}
        if self.version == 3:
            action_offset = struct.unpack_from('<i', data, 8)[0]
            if not self.table_end <= action_offset <= len(data) - 4:
                raise ValueError('action table outside library')
            count = struct.unpack_from('<i', data, action_offset)[0]
            if not 0 <= count <= 256 or action_offset + 4 + count * ACTION_RECORD.size > len(data):
                raise ValueError('truncated action table')
            keys = ('start', 'count', 'skip', 'interval', 'effectStart', 'effectCount',
                    'effectSkip', 'effectInterval', 'reverse', 'blend')
            for number in range(count):
                action, *values = ACTION_RECORD.unpack_from(data, action_offset + 4 + number * ACTION_RECORD.size)
                if action in self.actions or values[-1] > 1 or values[-2] > 1:
                    raise ValueError('invalid or duplicate action')
                self.actions[action] = dict(zip(keys, values))

    def frame(self, index):
        if not 0 <= index < self.count:
            raise IndexError(index)
        offset = self.indices[index]
        if not offset:
            return None
        if offset + IMAGE_HEADER.size > len(self.data):
            raise ValueError('truncated image header')
        w, h, x, y, sx, sy, shadow, length = IMAGE_HEADER.unpack_from(self.data, offset)
        cursor = offset + IMAGE_HEADER.size
        result = {'index': index, 'width': w, 'height': h, 'offsetX': x, 'offsetY': y,
                  'shadowX': sx, 'shadowY': sy, 'shadow': shadow & 127}
        result['pixels'], cursor = self._pixels(cursor, length, w, h)
        if shadow & 128:
            if cursor + 12 > len(self.data):
                raise ValueError('truncated mask header')
            mw, mh, mx, my, ml = struct.unpack_from('<hhhhi', self.data, cursor)
            pixels, _ = self._pixels(cursor + 12, ml, mw, mh)
            result['mask'] = {'width': mw, 'height': mh, 'offsetX': mx, 'offsetY': my, 'pixels': pixels}
        return result

    def _pixels(self, offset, length, width, height):
        if width < 0 or height < 0 or width * height > MAX_PIXELS or length < 0:
            raise ValueError('invalid image dimensions or length')
        if offset + length > len(self.data):
            raise ValueError('truncated compressed pixels')
        expected = width * height * 4
        if not length and not expected:
            return b'', offset
        with gzip.GzipFile(fileobj=io.BytesIO(self.data[offset:offset+length])) as stream:
            pixels = stream.read(expected + 1)
        if len(pixels) != expected:
            raise ValueError('decoded pixel length mismatch')
        return pixels, offset + length


def export(source, destination, indices):
    data = source.read_bytes()
    library = CrystalLibrary(data)
    destination.mkdir(parents=True, exist_ok=True)
    frames, missing, empty = {}, [], []
    for index in sorted(set(indices)):
        if index >= library.count:
            missing.append(index)
            continue
        frame = library.frame(index)
        if frame is None or not frame['width'] or not frame['height']:
            empty.append(index)
            continue
        for layer, name in [(frame, str(index)), (frame.get('mask'), f'{index}-mask')]:
            if layer is None:
                continue
            png = png_rgba(layer['width'], layer['height'], layer.pop('pixels'))
            digest = hashlib.sha256(png).hexdigest()
            filename = f'{name}.{digest[:16]}.png'
            (destination / filename).write_bytes(png)
            layer.update(file=filename, sha256=digest)
        frames[str(index)] = frame
    manifest = {'schemaVersion': 1, 'format': f'crystal-lib-v{library.version}',
                'sourceSha256': hashlib.sha256(data).hexdigest(), 'sourceFrameCount': library.count,
                'frames': frames, 'empty': empty, 'missing': missing, 'actions': library.actions}
    (destination / 'library.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    selection = parser.add_mutually_exclusive_group(required=True)
    selection.add_argument('--map-manifest', type=Path)
    selection.add_argument('--all', action='store_true')
    parser.add_argument('--layer', choices=['Tiles', 'SmTiles', 'Objects'])
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.all:
        indices = range(CrystalLibrary(args.source.read_bytes()).count)
    else:
        if not args.layer:
            parser.error('--layer is required with --map-manifest')
        indices = json.loads(args.map_manifest.read_text())['dependencies'][args.layer]
    report = export(args.source, args.output, indices)
    print(f"Exported {len(report['frames'])}; empty {len(report['empty'])}; missing {len(report['missing'])}")
