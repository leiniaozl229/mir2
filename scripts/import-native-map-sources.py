#!/usr/bin/env python3
"""Import hash-locked original map sources without activating browser or server maps."""

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from map_sources import import_native_maps


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--client-map-dir', required=True, type=Path)
    args = parser.parse_args()
    imported = import_native_maps(ROOT, args.client_map_dir)
    print(json.dumps({'imported': imported, 'browserActivated': False,
                      'serverActivated': False}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
