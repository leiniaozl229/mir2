#!/usr/bin/env python3
"""Export source-bound monochrome UI glyphs offscreen. No UI input or font-file copying."""
import argparse
import ctypes
from ctypes import wintypes
import hashlib
import json
from pathlib import Path
import platform
import sys

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / 'content/classic-176/native-ui-fonts.json'


def digest(path):
    with path.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def cp936_characters():
    """The actual gateway's strict CP936 decoder is authoritative, including U+F8F5."""
    record = json.loads((ROOT / 'content/classic-176/legacy-text-repertoire.json').read_text(encoding='utf-8'))
    values = record['codepoints']
    if record['encoding'] != 'CP936' or record['count'] != len(values) or values != sorted(set(values)):
        raise ValueError('Invalid legacy text repertoire')
    if any(not isinstance(value, int) or value < 0 or value > 0xffff for value in values):
        raise ValueError('Invalid legacy text codepoint')
    sha = hashlib.sha256(','.join(str(value) for value in values).encode('ascii')).hexdigest()
    if sha != record['sha256'] or digest(ROOT / 'services/web-gateway/LegacyCodec.cs') != record['sourceCodecSha256']:
        raise ValueError('Legacy codec or repertoire identity changed; re-export from the built gateway')
    return [chr(value) for value in values]


class BitmapHeader(ctypes.Structure):
    _fields_ = [('size', wintypes.DWORD), ('width', wintypes.LONG), ('height', wintypes.LONG),
               ('planes', wintypes.WORD), ('bits', wintypes.WORD), ('compression', wintypes.DWORD),
               ('imageSize', wintypes.DWORD), ('xPels', wintypes.LONG), ('yPels', wintypes.LONG),
               ('used', wintypes.DWORD), ('important', wintypes.DWORD)]


class Extent(ctypes.Structure):
    _fields_ = [('x', wintypes.LONG), ('y', wintypes.LONG)]


def export_profile(spec, profile, characters, output, source_font, rasterizer):
    gdi = ctypes.WinDLL('gdi32', use_last_error=True)
    pointer = ctypes.c_void_p
    signatures = {
        'CreateCompatibleDC': ([pointer], pointer),
        'CreateDIBSection': ([pointer, ctypes.POINTER(BitmapHeader), wintypes.UINT, ctypes.POINTER(pointer), pointer, wintypes.DWORD], pointer),
        'CreateFontW': ([ctypes.c_int] * 5 + [wintypes.DWORD] * 8 + [wintypes.LPCWSTR], pointer),
        'SelectObject': ([pointer, pointer], pointer),
        'SetBkColor': ([pointer, wintypes.DWORD], wintypes.DWORD),
        'SetTextColor': ([pointer, wintypes.DWORD], wintypes.DWORD),
        'TextOutW': ([pointer, ctypes.c_int, ctypes.c_int, wintypes.LPCWSTR, ctypes.c_int], wintypes.BOOL),
        'GetTextExtentPoint32W': ([pointer, wintypes.LPCWSTR, ctypes.c_int, ctypes.POINTER(Extent)], wintypes.BOOL),
        'GetTextFaceW': ([pointer, ctypes.c_int, wintypes.LPWSTR], ctypes.c_int),
        'GetGlyphIndicesW': ([pointer, wintypes.LPCWSTR, ctypes.c_int, ctypes.POINTER(wintypes.WORD), wintypes.DWORD], wintypes.DWORD),
        'GdiFlush': ([], wintypes.BOOL),
        'DeleteObject': ([pointer], wintypes.BOOL),
        'DeleteDC': ([pointer], wintypes.BOOL),
    }
    for name, (args, result) in signatures.items():
        function = getattr(gdi, name)
        function.argtypes, function.restype = args, result
    width = height = 64
    padding = 16
    dc = gdi.CreateCompatibleDC(None)
    header = BitmapHeader(ctypes.sizeof(BitmapHeader), width, -height, 1, 32, 0, width * height * 4, 0, 0, 0, 0)
    bits = pointer()
    bitmap = gdi.CreateDIBSection(dc, ctypes.byref(header), 0, ctypes.byref(bits), None, 0)
    font = gdi.CreateFontW(-spec['size'], 0, 0, 0, spec['weight'], 0, 0, 0,
                          rasterizer['charset'], 0, 0, rasterizer['quality'], 0, source_font['requestedFamily'])
    if not (dc and bitmap and font):
        raise ctypes.WinError(ctypes.get_last_error())
    old_bitmap, old_font = gdi.SelectObject(dc, bitmap), gdi.SelectObject(dc, font)
    page_size = 2048
    page = Image.new('RGBA', (page_size, page_size), (0, 0, 0, 0))
    pages, glyphs, fallbacks = [], {}, 0
    x = y = row_height = 0

    def save_page():
        cropped = page.crop((0, 0, page_size, max(1, y + row_height)))
        temporary = output / (profile + '-page.png')
        cropped.save(temporary)
        sha = digest(temporary)
        filename = profile + '-' + sha[:16] + '.png'
        target = output / filename
        # Keep prior exported versions for recovery; replace only this exact generated file.
        temporary.replace(target)
        pages.append({'file': filename, 'sha256': sha, 'width': cropped.width, 'height': cropped.height})

    try:
        actual = ctypes.create_unicode_buffer(128)
        gdi.GetTextFaceW(dc, 128, actual)
        if actual.value != source_font['resolvedFamily']:
            raise ValueError('Requested font resolved to another family: ' + actual.value)
        gdi.SetBkColor(dc, 0)
        gdi.SetTextColor(dc, 0xffffff)
        for index, char in enumerate(characters):
            extent = Extent()
            if not gdi.GetTextExtentPoint32W(dc, char, 1, ctypes.byref(extent)):
                raise ctypes.WinError(ctypes.get_last_error())
            glyph_index = wintypes.WORD()
            if gdi.GetGlyphIndicesW(dc, char, 1, ctypes.byref(glyph_index), 1) == 0xffffffff:
                raise ctypes.WinError(ctypes.get_last_error())
            if glyph_index.value == 0xffff:
                fallbacks += 1
            ctypes.memset(bits, 0, width * height * 4)
            if not gdi.TextOutW(dc, padding, padding, char, 1):
                raise ctypes.WinError(ctypes.get_last_error())
            gdi.GdiFlush()
            raw = Image.frombytes('RGB', (width, height), ctypes.string_at(bits, width * height * 4), 'raw', 'BGRX')
            alpha = raw.convert('L').point(lambda value: 255 if value else 0)
            box = alpha.getbbox()
            key = str(ord(char))
            if box is None:
                glyphs[key] = [0, 0, 0, 0, 0, 0, 0, extent.x]
                continue
            left, top, right, bottom = box
            if left == 0 or top == 0 or right == width or bottom == height:
                raise ValueError('Glyph touches offscreen buffer edge: U+%04X' % ord(char))
            ink_width, ink_height = right - left, bottom - top
            if x + ink_width > page_size:
                x, y, row_height = 0, y + row_height + 1, 0
            if y + ink_height > page_size:
                save_page()
                page = Image.new('RGBA', (page_size, page_size), (0, 0, 0, 0))
                x = y = row_height = 0
            glyph = Image.new('RGBA', (ink_width, ink_height), (255, 255, 255, 255))
            glyph.putalpha(alpha.crop(box))
            page.paste(glyph, (x, y))
            # [page, source-x, source-y, width, height, ink-offset-x, ink-offset-y, advance]
            glyphs[key] = [len(pages), x, y, ink_width, ink_height, left - padding, top - padding, extent.x]
            x += ink_width + 1
            row_height = max(row_height, ink_height)
            if index % 5000 == 0:
                print(json.dumps({'profile': profile, 'glyphsProcessed': index, 'total': len(characters)}), flush=True)
        save_page()
    finally:
        gdi.SelectObject(dc, old_font)
        gdi.SelectObject(dc, old_bitmap)
        gdi.DeleteObject(font)
        gdi.DeleteObject(bitmap)
        gdi.DeleteDC(dc)
    repertoire_sha = hashlib.sha256(','.join(str(ord(char)) for char in characters).encode('ascii')).hexdigest()
    manifest = {'schemaVersion': 1, 'profile': profile, 'sourceFontSha256': source_font['sha256'],
                'family': actual.value, 'size': spec['size'], 'weight': spec['weight'],
                'charset': rasterizer['charset'], 'quality': rasterizer['quality'],
                'encoding': 'CP936', 'repertoireSha256': repertoire_sha, 'glyphCount': len(glyphs),
                'fallbackGlyphCount': fallbacks, 'fallbackAppearanceNativeQualified': False,
                'rasterizerPlatform': platform.platform(), 'pages': pages, 'glyphs': glyphs}
    temporary = output / (profile + '-manifest.json')
    temporary.write_text(json.dumps(manifest, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    sha = digest(temporary)
    filename = profile + '-' + sha[:16] + '.json'
    temporary.replace(output / filename)
    return {'manifest': '/ui-national/fonts/' + filename, 'sha256': sha, 'glyphCount': len(glyphs),
            'repertoireSha256': repertoire_sha, 'fallbackGlyphCount': fallbacks}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--font', type=Path, default=Path('C:/Windows/Fonts/simkai.ttf'))
    parser.add_argument('--output', type=Path, default=ROOT / 'assets/web/ui-national/fonts')
    parser.add_argument('--lock-contract', action='store_true')
    args = parser.parse_args()
    if sys.platform != 'win32':
        parser.error('Generating this observed GDI raster requires Windows; browsers only need the exported assets')
    if args.lock_contract and args.output.resolve() != (ROOT / 'assets/web/ui-national/fonts').resolve():
        parser.error('Contract locking requires the repository asset directory')
    contract = json.loads(CONTRACT.read_text(encoding='utf-8'))
    if digest(args.font) != contract['sourceFont']['sha256']:
        parser.error('Local font file differs from the observed source')
    args.output.mkdir(parents=True, exist_ok=True)
    characters = cp936_characters()
    exported = {}
    for name, spec in contract['profiles'].items():
        exported[name] = export_profile(spec, name, characters, args.output, contract['sourceFont'], contract['rasterizer'])
        if args.lock_contract:
            spec.update(exported[name])
    if args.lock_contract:
        CONTRACT.write_text(json.dumps(contract, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'ok': True, 'profiles': exported, 'scope': 'CP936 glyph coverage; only observed strings are native pixel-qualified'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
