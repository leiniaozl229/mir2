"""Install an experimental dgVoodoo window wrapper for the original client.

The dgVoodoo archive is supplied by the operator and is never copied into Git.
The original mir.dat is checked but never modified.
The current 2003 client stalls after server selection in this forced-window mode.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parents[1]
SETTINGS = {
    "FullScreenMode": "false",
    "AppControlledScreenMode": "false",
    "DisableAltEnterToToggleScreenMode": "false",
    "dgVoodooWatermark": "false",
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def configure(text: str) -> str:
    for key, value in SETTINGS.items():
        pattern = rf"(?m)^{re.escape(key)}[ \t]*=[ \t]*[^\r\n]*(?=\r?$)"
        text, count = re.subn(pattern, f"{key} = {value}", text)
        if count != 1:
            raise ValueError(f"Expected one {key} setting in dgVoodoo.conf; found {count}")
    return text


def install(archive: Path, client_root: Path) -> dict[str, str]:
    client = client_root / "mir.dat"
    if not client.is_file():
        raise ValueError(f"Prepared native client is missing: {client}")
    original_hash = sha256(client.read_bytes())
    with ZipFile(archive) as package:
        dll = package.read("MS/x86/DDraw.dll")
        config = configure(package.read("dgVoodoo.conf").decode("latin-1"))
    dll_path = client_root / "DDraw.dll"
    if dll_path.exists() and sha256(dll_path.read_bytes()) != sha256(dll):
        raise ValueError(f"A different DirectDraw wrapper already exists: {dll_path}")
    config_path = client_root / "dgVoodoo.conf"
    if config_path.exists() and config_path.read_bytes() != config.encode("latin-1"):
        raise ValueError(f"A different dgVoodoo configuration already exists: {config_path}")
    dll_path.write_bytes(dll)
    config_path.write_bytes(config.encode("latin-1"))
    if sha256(client.read_bytes()) != original_hash:
        raise RuntimeError("The original client changed during wrapper installation")
    return {
        "client": str(client),
        "original_client_sha256": original_hash,
        "wrapper_sha256": sha256(dll),
        "configured_mode": "experimental 800x600 movable window; gameplay unverified",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", required=True, type=Path, help="Original dgVoodoo ZIP archive")
    parser.add_argument("--client-root", type=Path, default=ROOT / ".runtime/native-client")
    args = parser.parse_args()
    try:
        result = install(args.archive, args.client_root)
    except (OSError, KeyError, ValueError) as error:
        parser.exit(1, f"Window-wrapper installation failed: {error}\n")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
