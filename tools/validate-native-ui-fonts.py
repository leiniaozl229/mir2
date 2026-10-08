#!/usr/bin/env python3
"""Validate exported source-bound glyph pixels; this does not qualify native appearance."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def digest(file):
    with file.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def validate():
    spec = importlib.util.spec_from_file_location('native_ui_font_import', ROOT / 'tools/import-native-ui-fonts.py')
    importer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(importer)
    codepoints = [ord(char) for char in importer.cp936_characters()]
    repertoire_sha = hashlib.sha256(','.join(map(str, codepoints)).encode('ascii')).hexdigest()
    contract = json.loads((ROOT / 'content/classic-176/native-ui-fonts.json').read_text(encoding='utf-8'))
    profiles = []
    for name, lock in contract['profiles'].items():
        manifest_file = ROOT / 'assets/web' / lock['manifest'].lstrip('/')
        if not manifest_file.resolve().is_relative_to((ROOT / 'assets/web/ui-national/fonts').resolve()):
            raise ValueError('Font manifest escapes its asset directory')
        if digest(manifest_file) != lock['sha256']:
            raise ValueError('Font manifest identity mismatch')
        manifest = json.loads(manifest_file.read_text(encoding='utf-8'))
        if (manifest['profile'] != name or manifest['sourceFontSha256'] != contract['sourceFont']['sha256']
                or manifest['size'] != lock['size'] or manifest['weight'] != lock['weight']
                or manifest['repertoireSha256'] != repertoire_sha
                or sorted(map(int, manifest['glyphs'])) != codepoints
                or manifest['fallbackAppearanceNativeQualified'] is not False):
            raise ValueError('Font provenance, repertoire or qualification mismatch')
        pages = []
        for page in manifest['pages']:
            file = manifest_file.parent / page['file']
            if file.parent.resolve() != manifest_file.parent.resolve() or digest(file) != page['sha256']:
                raise ValueError('Glyph image identity mismatch')
            image = Image.open(file)
            image.load()
            if image.format != 'PNG' or image.mode != 'RGBA' or image.size != (page['width'], page['height']):
                raise ValueError('Glyph image format or geometry mismatch')
            if not set(image.getchannel('A').tobytes()).issubset({0, 255}):
                raise ValueError('Glyph alpha is not monochrome')
            if image.convert('RGB').getextrema() != ((0, 255), (0, 255), (0, 255)):
                raise ValueError('Glyph palette is not the white-mask palette')
            pages.append(image)
        ink_glyphs = 0
        for key, glyph in manifest['glyphs'].items():
            page, x, y, width, height, dx, dy, advance = glyph
            if not all(type(value) is int for value in glyph) or not 0 <= page < len(pages) or not 0 <= advance <= 64:
                raise ValueError('Invalid glyph metrics: ' + key)
            if not width and not height:
                continue
            if (width <= 0 or height <= 0 or x < 0 or y < 0 or x + width > pages[page].width
                    or y + height > pages[page].height or abs(dx) > 32 or abs(dy) > 32):
                raise ValueError('Glyph exceeds its atlas: ' + key)
            pixels = pages[page].crop((x, y, x + width, y + height))
            if pixels.getchannel('A').getbbox() != (0, 0, width, height):
                raise ValueError('Glyph ink does not fill its declared crop: ' + key)
            data = pixels.tobytes()
            for offset in range(0, len(data), 4):
                if data[offset + 3] and data[offset:offset + 3] != b'\xff\xff\xff':
                    raise ValueError('Visible glyph ink is not white: ' + key)
            ink_glyphs += 1
        profiles.append({'profile': name, 'glyphCount': len(codepoints), 'inkGlyphs': ink_glyphs,
                         'pages': len(pages), 'fallbackGlyphCount': manifest['fallbackGlyphCount']})
    return {'ok': True, 'scope': 'Exported asset identity, full CP936 coverage, monochrome masks and tight glyph bounds',
            'nativeAppearanceComplete': False, 'profiles': profiles}


if __name__ == '__main__':
    try:
        print(json.dumps(validate(), ensure_ascii=False))
    except (KeyError, ValueError, OSError) as error:
        print(json.dumps({'ok': False, 'error': str(error)}, ensure_ascii=False))
        sys.exit(1)
