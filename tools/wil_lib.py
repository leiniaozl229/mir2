"""Read classic Legend of Mir WIL/WIX and WZL/WZX libraries.

The decoder keeps the source frame number, signed anchor offsets, empty
frames, and the original indexed/16-bit pixel data. Output is compatible with
the browser library manifest produced by ``crystal_lib.py``.
"""
import hashlib
import json
from pathlib import Path
import struct
import zlib

from crystal_lib import png_rgba


MAX_PIXELS = 16_777_216
WIL_HEADER = struct.Struct("<hhhh")
WZL_HEADER = struct.Struct("<B3xhhhhI")


class WeMadeFormatError(ValueError):
    pass


def _checked_dimensions(width, height):
    if width < 0 or height < 0 or width * height > MAX_PIXELS:
        raise WeMadeFormatError(f"invalid image dimensions: {width}x{height}")


def _rgb565_to_bgra(value):
    red = (value & 0xF800) >> 8
    green = (value & 0x07E0) >> 3
    blue = (value & 0x001F) << 3
    return bytes((blue, green, red, 255))


class WeMadeLibrary:
    """Decode one paired WIL/WIX or WZL/WZX library."""

    def __init__(self, source, index=None):
        self.source = Path(source)
        suffix = self.source.suffix.casefold()
        if suffix not in (".wil", ".wzl"):
            raise WeMadeFormatError(f"unsupported library: {self.source.name}")
        self.kind = suffix[1:]
        self.data = self.source.read_bytes()
        self.index_path = Path(index) if index else self.source.with_suffix(".wix" if self.kind == "wil" else ".wzx")
        if not self.index_path.is_file():
            raise FileNotFoundError(self.index_path)
        self.index_data = self.index_path.read_bytes()
        self.version = None
        self.palette = None
        self.flip_y = False
        self.image_header_size = 16 if self.kind == "wzl" else 8
        self.index_header_size = 52 if self.kind == "wzl" else 48
        if self.kind == "wil":
            self._read_wil_header()
        self.raw_offset_count = 0
        self.discarded_trailing_offsets = []
        self.offsets = self._read_offsets()

    def _read_wil_header(self):
        if len(self.data) < 60:
            raise WeMadeFormatError("truncated WIL header")
        palette_count = struct.unpack_from("<i", self.data, 48)[0]
        if not 1 <= palette_count <= 256:
            raise WeMadeFormatError(f"unsupported WIL palette size: {palette_count}")
        if self.data.startswith(b"#ILIB v1.0-"):
            # Classic client WIL stores the palette byte length at 52 and
            # starts the 256 RGBA entries at 56. There is no version integer
            # in this header variant; the first image starts at 1080.
            self.version = 0
            self.index_header_size = 48
            self.image_header_size = 8
            palette_offset = 56
            self.flip_y = True
        else:
            # Keep support for the compact fixture/header variant used by
            # the initial importer tests.
            self.version = struct.unpack_from("<i", self.data, 56)[0]
            if self.version not in (0, 1):
                raise WeMadeFormatError(f"unsupported WIL version: {self.version}")
            self.index_header_size = 48 if self.version == 0 else 52
            self.image_header_size = 8 if self.version == 0 else 12
            palette_offset = 60 if self.version == 0 else 64
        palette_entries = palette_count if self.data.startswith(b"#ILIB v1.0-") else palette_count - 1
        if palette_offset + palette_entries * 4 > len(self.data):
            raise WeMadeFormatError("truncated WIL palette")
        # Palette index 0 is the transparent color in the classic 8-bit WIL.
        self.palette = [0] * palette_count
        if self.data.startswith(b"#ILIB v1.0-"):
            palette_indices = range(1, palette_count)
            palette_index_offset = lambda index: index
        else:
            palette_indices = range(1, palette_count)
            palette_index_offset = lambda index: index - 1
        for index in palette_indices:
            color = struct.unpack_from("<I", self.data, palette_offset + palette_index_offset(index) * 4)[0]
            self.palette[index] = color | 0xFF000000

    def _read_offsets(self):
        if len(self.index_data) < self.index_header_size:
            raise WeMadeFormatError("truncated WIX/WZX header")
        size = len(self.index_data) - self.index_header_size
        if size % 4:
            raise WeMadeFormatError("misaligned WIX/WZX index table")
        offsets = list(struct.unpack_from(f"<{size // 4}i", self.index_data, self.index_header_size))
        self.raw_offset_count = len(offsets)
        # A few original libraries append a terminal offset after the last
        # real frame. Some clients leave that value just past the extracted
        # WIL length, so discard only a trailing invalid entry while keeping
        # malformed offsets in the middle strict.
        while offsets and offsets[-1] >= len(self.data) and all(
            offset == 0 or 0 <= offset < len(self.data) for offset in offsets[:-1]
        ):
            self.discarded_trailing_offsets.append(offsets.pop())
        return offsets

    @property
    def count(self):
        return len(self.offsets)

    def frame(self, index):
        if not 0 <= index < self.count:
            raise IndexError(index)
        offset = self.offsets[index]
        if offset == 0:
            return None
        if offset < 0 or offset >= len(self.data):
            raise WeMadeFormatError(f"frame {index} offset outside library: {offset}")
        if self.kind == "wil":
            return self._wil_frame(index, offset)
        return self._wzl_frame(index, offset)

    def _wil_frame(self, index, offset):
        if offset + self.image_header_size > len(self.data):
            raise WeMadeFormatError(f"truncated WIL frame header: {index}")
        width, height, x, y = WIL_HEADER.unpack_from(self.data, offset)
        _checked_dimensions(width, height)
        if not width or not height:
            return None
        pixel_count = width * height
        start = offset + self.image_header_size
        end = start + pixel_count
        if end > len(self.data):
            raise WeMadeFormatError(f"truncated WIL pixels: {index}")
        pixels = self.data[start:end]
        if self.flip_y and height > 1:
            pixels = b"".join(
                pixels[row * width:(row + 1) * width]
                for row in range(height - 1, -1, -1)
            )
        return self._frame(index, width, height, x, y, self._indexed_pixels(pixels, width, height))

    def _wzl_frame(self, index, offset):
        if offset + WZL_HEADER.size > len(self.data):
            raise WeMadeFormatError(f"truncated WZL frame header: {index}")
        depth, width, height, x, y, compressed_size = WZL_HEADER.unpack_from(self.data, offset)
        _checked_dimensions(width, height)
        if depth not in (0, 5):
            raise WeMadeFormatError(f"unsupported WZL pixel depth marker {depth} at frame {index}")
        if not width or not height:
            return None
        start = offset + WZL_HEADER.size
        end = start + compressed_size
        if end > len(self.data):
            raise WeMadeFormatError(f"truncated WZL compressed pixels: {index}")
        compressed = self.data[start:end]
        try:
            raw = zlib.decompress(compressed)
        except zlib.error as error:
            raise WeMadeFormatError(f"invalid WZL zlib stream at frame {index}: {error}") from error
        bytes_per_pixel = 2 if depth == 5 else 1
        stride = ((width * bytes_per_pixel + 3) // 4) * 4
        expected = stride * height
        if len(raw) < expected:
            raise WeMadeFormatError(f"short WZL pixel stream at frame {index}: {len(raw)} < {expected}")
        pixels = bytearray(width * height * 4)
        cursor = 0
        out = 0
        for _row in range(height):
            row = raw[cursor:cursor + width * bytes_per_pixel]
            cursor += stride
            if depth == 5:
                for pixel in range(width):
                    value = struct.unpack_from("<H", row, pixel * 2)[0]
                    pixels[out:out + 4] = _rgb565_to_bgra(value)
                    out += 4
            else:
                converted = self._indexed_pixels(row, width, 1)
                pixels[out:out + len(converted)] = converted
                out += len(converted)
        return self._frame(index, width, height, x, y, bytes(pixels))

    def _indexed_pixels(self, indices, width, height):
        if self.palette is None:
            self.palette = [0] * 256
        pixels = bytearray()
        for index in indices:
            if index >= len(self.palette):
                raise WeMadeFormatError(f"palette index outside WIL palette: {index}")
            pixels.extend(struct.pack("<I", self.palette[index]))
        return bytes(pixels)

    @staticmethod
    def _frame(index, width, height, x, y, pixels):
        return {"index": index, "width": width, "height": height, "offsetX": x, "offsetY": y, "pixels": pixels}


def export(source, destination, indices=None, index=None):
    """Export selected frames and return a browser-compatible manifest."""
    library = WeMadeLibrary(source, index)
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=True)
    if indices is None:
        indices = range(library.count)
    frames, missing, empty = {}, [], []
    for number in sorted(set(indices)):
        if number >= library.count:
            missing.append(number)
            continue
        frame = library.frame(number)
        if frame is None:
            empty.append(number)
            continue
        png = png_rgba(frame["width"], frame["height"], frame.pop("pixels"))
        digest = hashlib.sha256(png).hexdigest()
        filename = f'{number}.{digest[:16]}.png'
        (destination / filename).write_bytes(png)
        frame.update(file=filename, sha256=digest)
        frames[str(number)] = frame
    manifest = {
        "schemaVersion": 1,
        "format": f"{library.kind}-classic",
        "source": library.source.name,
        "sourceSha256": hashlib.sha256(library.data).hexdigest(),
        "index": library.index_path.name,
        "indexSha256": hashlib.sha256(library.index_data).hexdigest(),
        "sourceFrameCount": library.count,
        "rawIndexEntries": library.raw_offset_count,
        "discardedTrailingOffsets": library.discarded_trailing_offsets,
        "frames": frames,
        "empty": empty,
        "missing": missing,
    }
    (destination / "library.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    return manifest
