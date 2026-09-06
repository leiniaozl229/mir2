#!/usr/bin/env python3
"""Classic Mir2 MAP reader and deterministic browser chunk exporter.

Source layout: OpenMir2 M2Server/Maps/Envirnoment.cs, commit 1847483.
The server reads a 52-byte header followed by 12-byte cells.  A few historical
maps append a legacy auxiliary tail after those cells; the server ignores that
tail, so the browser exporter records it and follows the same boundary.
"""
import argparse
import hashlib
import json
import struct
from pathlib import Path

CELL = struct.Struct("<HHHBBBBBB")
MAX_CELLS = 16_000_000


class UnsupportedMap(ValueError):
    pass


class ClassicMap:
    def __init__(self, data):
        if len(data) < 52:
            raise UnsupportedMap("truncated header")
        self.width, self.height = struct.unpack_from("<HH", data)
        if not 1 < self.width <= 32767 or not 1 < self.height <= 32767:
            raise UnsupportedMap("invalid dimensions")
        cells = self.width * self.height
        if cells > MAX_CELLS:
            raise UnsupportedMap("map exceeds allocation budget")
        expected = 52 + cells * CELL.size
        if len(data) < expected:
            raise UnsupportedMap(f"truncated map: expected at least {expected} bytes, got {len(data)}")
        trailing = len(data) - expected
        if trailing and trailing % CELL.size:
            raise UnsupportedMap(f"unsupported layout: expected {expected} bytes, got {len(data)}")
        self.data = data
        self.cell_bytes = expected - 52
        self.trailing_bytes = trailing

    def cell(self, x, y):
        if not (0 <= x < self.width and 0 <= y < self.height):
            raise IndexError((x, y))
        return CELL.unpack_from(self.data, 52 + (x * self.height + y) * CELL.size)

    def blocked(self, x, y):
        cell = self.cell(x, y)
        return bool((cell[0] | cell[2]) & 0x8000)

    def dependencies(self):
        references = [set(), set(), set()]
        blocked = 0
        for cell in CELL.iter_unpack(self.data[52:52 + self.cell_bytes]):
            for layer in range(3):
                index = cell[layer] & 0x7fff
                # The high 0x7f00 range is the classic empty/special-layer sentinel.
                # After stripping the collision bit it would otherwise turn
                # into bogus library indices near 32750.
                if index and index < 0x7f00:
                    references[layer].add(index - 1)
            front = cell[2] & 0x7fff
            if front and front < 0x7f00 and cell[5] & 0x7f:
                references[2].update(range(front - 1, front - 1 + (cell[5] & 0x7f)))
            blocked += bool((cell[0] | cell[2]) & 0x8000)
        return references, blocked


def audit(directory):
    entries = []
    for path in sorted(directory.glob("*.map")):
        raw = path.read_bytes()
        entry = {"file": path.name, "bytes": len(raw),
                 "sha256": hashlib.sha256(raw).hexdigest()}
        try:
            world = ClassicMap(raw)
            entry.update(format="classic-12", width=world.width, height=world.height,
                         trailingBytes=world.trailing_bytes)
        except UnsupportedMap as error:
            entry.update(format="unsupported", reason=str(error))
        entries.append(entry)
    return {"schemaVersion": 1, "count": len(entries),
            "supported": sum(e["format"] == "classic-12" for e in entries), "maps": entries}


def export(path, destination, size=64):
    if not 1 <= size <= 256:
        raise ValueError("chunk size must be 1..256")
    raw = path.read_bytes()
    world = ClassicMap(raw)
    destination.mkdir(parents=True, exist_ok=True)
    references, blocked = world.dependencies()
    chunks = []
    for x in range(0, world.width, size):
        for y in range(0, world.height, size):
            width, height = min(size, world.width - x), min(size, world.height - y)
            data = bytearray()
            for cx in range(x, x + width):
                start = 52 + (cx * world.height + y) * CELL.size
                data.extend(raw[start:start + height * CELL.size])
            digest = hashlib.sha256(data).hexdigest()
            filename = f"{x}-{y}.{digest[:16]}.bin"
            (destination / filename).write_bytes(data)
            chunks.append({"x": x, "y": y, "width": width, "height": height,
                           "file": filename, "sha256": digest, "bytes": len(data)})
    manifest = {"schemaVersion": 1, "id": path.stem, "sourceSha256": hashlib.sha256(raw).hexdigest(),
                "format": "classic-12", "cellOrder": "column-major", "cellBytes": 12,
                "width": world.width, "height": world.height, "tileWidth": 48, "tileHeight": 32,
                "blockedCells": blocked, "trailingBytes": world.trailing_bytes, "chunks": chunks,
                "dependencies": {name: sorted(values) for name, values in
                                 zip(["Tiles", "SmTiles", "Objects"], references)}}
    (destination / "map.json").write_text(json.dumps(manifest, indent=2))
    return manifest


def main():
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)
    scan = commands.add_parser("audit")
    scan.add_argument("directory", type=Path)
    scan.add_argument("--output", type=Path, required=True)
    convert = commands.add_parser("export")
    convert.add_argument("map", type=Path)
    convert.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "audit":
        result = audit(args.directory)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, indent=2))
        print(f"{result['supported']}/{result['count']} maps recognized; report: {args.output}")
    else:
        result = export(args.map, args.output)
        print(f"Exported {result['width']}x{result['height']}, {len(result['chunks'])} chunks")


if __name__ == "__main__":
    main()
