#!/usr/bin/env python3
"""Prepare an isolated, loopback-only configuration for the 2003 Mir launcher.

No executable is patched or launched. This prepares an experiment, not evidence
that the installed client speaks the current OpenMir2 protocol.
"""
from __future__ import annotations

import argparse
import base64
import configparser
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SIGNATURE = bytes.fromhex("83c4e88d44240850")
XOR_TABLE = bytes(value ^ 1 for value in range(256))
PROGRAMS = ("Mir.exe", "mir.dat", "mirclient.dll", "load.lib")
ASSETS = ("Data", "Map", "Wav")


def parse_group(data: bytes) -> tuple[int, list[bytes]]:
    """Validate the known container and return decoded blocks without text loss."""
    if len(data) < 12 or data[:8] != SIGNATURE:
        raise ValueError("Unsupported group.dat signature")
    count = struct.unpack_from("<I", data, 8)[0]
    if not 1 <= count <= 1000:
        raise ValueError("Invalid group count")
    entries = 2 * count + 2  # Main, two blocks per group, window blacklist.
    cursor = 12 + entries * 8
    if cursor > len(data):
        raise ValueError("Truncated group.dat index")
    blocks = []
    for index in range(entries):
        offset, size = struct.unpack_from("<II", data, 12 + index * 8)
        if offset != cursor or size == 0 or offset + size > len(data):
            raise ValueError(f"Invalid group.dat block {index}")
        blocks.append(data[offset:offset + size].translate(XOR_TABLE))
        cursor += size
    if cursor != len(data):
        raise ValueError("Unexpected trailing data in group.dat")
    return count, blocks


def build_group(count: int, blocks: list[bytes]) -> bytes:
    if not 1 <= count <= 1000 or len(blocks) != count * 2 + 2:
        raise ValueError("Group count does not match block count")
    cursor = 12 + len(blocks) * 8
    index = bytearray(SIGNATURE + struct.pack("<I", count))
    payload = bytearray()
    for block in blocks:
        if not block:
            raise ValueError("Empty group.dat block")
        index += struct.pack("<II", cursor, len(block))
        payload += block.translate(XOR_TABLE)
        cursor += len(block)
    result = bytes(index + payload)
    parse_group(result)
    return result


def read_ini(block: bytes) -> configparser.ConfigParser:
    parser = configparser.ConfigParser(interpolation=None, strict=True)
    parser.optionxform = str
    parser.read_string(block.decode("gbk"))
    return parser


def write_ini(parser: configparser.ConfigParser) -> bytes:
    output = io.StringIO()
    parser.write(output, space_around_delimiters=False)
    return output.getvalue().replace("\n", "\r\n").encode("gbk")


def local_group(data: bytes, server_name: str) -> bytes:
    if not server_name or any(c in server_name for c in "\r\n;[]=\x00"):
        raise ValueError("Server name must be a single INI value")
    server_name.encode("gbk")
    _, blocks = parse_group(data)
    # Read known sections before generating the smaller container. Do not guess
    # offsets or replace bytes inside compressed program files.
    read_ini(blocks[0])["main"]
    updater = read_ini(blocks[1])
    connection = read_ini(blocks[2])
    updater["Setup"]["site"] = "127.0.0.1"
    updater["Setup"]["port"] = "21"  # This is FTP, not the game login port.
    updater["Setup"]["userid"] = "anonymous"
    updater["Setup"]["passwd"] = ""
    updater["Server"] = {
        "ServerCount": "1", "server1caption": server_name,
        "server1name": server_name,
    }
    connection["Setup"]["ServerAddr"] = "127.0.0.1"
    main = configparser.ConfigParser(interpolation=None)
    main.optionxform = str
    main["main"] = {"name": "OpenMir2 (Local)", "regnew": "1", "lastgroup": "1"}
    main["focus"] = {"face": "esales.jpg", "url": "http://127.0.0.1/", "gailv": "49"}
    return build_group(1, [write_ini(main), write_ini(updater),
                           write_ini(connection), blocks[-1]])


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_direct_configs(destination: Path) -> None:
    """Materialize files read by the unpacked mir.dat entry/form code.

    The live 2003 client reads mirsetup.ini [Setup] ServerAddr/FontName and
    ftp.ini [Server] ServerCount/ServerNCaption/ServerNName. Its entry reads
    mir.ini [Setup] Patched, then resets that flag to zero. Param1..5 are copied
    unchanged from the selected group; they must not be guessed as IP/port.
    """
    count, blocks = parse_group((destination / "group.dat").read_bytes())
    if count != 1 or read_ini(blocks[2])["Setup"]["ServerAddr"] != "127.0.0.1":
        raise ValueError("Direct config generation requires a prepared local group")
    (destination / "ftp.ini").write_bytes(blocks[1])
    (destination / "mirsetup.ini").write_bytes(blocks[2])
    entry = read_ini(blocks[2])
    for key in list(entry["Setup"]):
        if key.lower() == "patched":
            del entry["Setup"][key]
    entry["Setup"]["Patched"] = "1"
    (destination / "mir.ini").write_bytes(write_ini(entry))
    # Use CreateProcess, not file association, because this PE has a .dat suffix.
    # mir.dat consumes Patched=1, so restore only that flag on every local launch.
    launcher = r'''$ErrorActionPreference = 'Stop'
$clientRoot = $PSScriptRoot
$entryPath = Join-Path $clientRoot 'mir.ini'
$entryEncoding = [Text.Encoding]::GetEncoding(936)
$entryText = [IO.File]::ReadAllText($entryPath, $entryEncoding)
if ($entryText -notmatch '(?im)^Patched=') { throw 'Missing prepared Patched entry' }
$entryText = [regex]::Replace($entryText, '(?im)^Patched=[^\r\n]*', 'Patched=1')
[IO.File]::WriteAllText($entryPath, $entryText, $entryEncoding)
$clientStart = New-Object System.Diagnostics.ProcessStartInfo
$clientStart.FileName = Join-Path $clientRoot 'mir.dat'
$clientStart.WorkingDirectory = $clientRoot
$clientStart.UseShellExecute = $false
[Diagnostics.Process]::Start($clientStart) | Select-Object Id, ProcessName
'''
    (destination / "Launch-Local.ps1").write_text(launcher, encoding="utf-8-sig")


def make_junction(target: Path, link: Path) -> None:
    # PowerShell literals plus EncodedCommand prevent paths from becoming code.
    quote = lambda path: "'" + str(path).replace("'", "''") + "'"
    command = ("$ErrorActionPreference='Stop'; New-Item -ItemType Junction "
               f"-Path {quote(link)} -Value {quote(target)} | Out-Null")
    encoded = base64.b64encode(command.encode("utf-16-le")).decode("ascii")
    subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive",
                    "-EncodedCommand", encoded], check=True,
                   creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))


def prepare(source: Path, destination: Path, server_name: str,
            assets: str = "junction") -> dict:
    source, destination = source.resolve(), destination.resolve()
    if source == destination or source in destination.parents or destination in source.parents:
        raise ValueError("Source and destination must be separate directories")
    if destination.exists():
        raise ValueError("Destination already exists; choose a new directory")
    if assets not in {"junction", "copy"}:
        raise ValueError("Unknown asset mode")
    if assets == "junction" and os.name != "nt":
        raise ValueError("Junction mode requires Windows; use --assets copy")
    for name in (*PROGRAMS, "group.dat"):
        if not (source / name).is_file():
            raise ValueError(f"Required client file missing: {name}")
    for name in ASSETS:
        if not (source / name).is_dir():
            raise ValueError(f"Required asset directory missing: {name}")
    group = local_group((source / "group.dat").read_bytes(), server_name)
    original_hashes = {p.name: sha256(p) for p in source.iterdir() if p.is_file()}
    destination.mkdir(parents=True, exist_ok=False)
    for path in source.iterdir():
        if path.is_file():
            shutil.copy2(path, destination / path.name)
    backup = destination / "original-config"
    backup.mkdir()
    for name in ("group.dat", "user.ini", "region.dat"):
        if (source / name).is_file():
            shutil.copy2(source / name, backup / name)
    (destination / "group.dat").write_bytes(group)
    (destination / "user.ini").write_bytes(b"[main]\r\nLastGroup=0\r\n")
    write_direct_configs(destination)
    # Preserve region.dat for reference, but old geographic mappings reference
    # groups removed from this one-group local configuration.
    if (destination / "region.dat").exists():
        (destination / "region.dat").write_bytes(b"[Region]\r\n[Info]\r\nProvince=\r\nRegion=\r\n")
    for name in ASSETS:
        if assets == "junction":
            make_junction(source / name, destination / name)
        else:
            shutil.copytree(source / name, destination / name)
    hashes = {name: sha256(destination / name) for name in PROGRAMS}
    if any(hashes[name] != original_hashes[name] for name in PROGRAMS):
        raise RuntimeError("Executable copy hash mismatch")
    manifest = {
        "source": str(source), "destination": str(destination),
        "server_name": server_name, "server_address": "127.0.0.1",
        "observed_login_port": 7000, "configurable_login_port_verified": False,
        "direct_configs": ["mir.ini", "mirsetup.ini", "ftp.ini"],
        "direct_launcher": "Launch-Local.ps1",
        "remote_update_site": "127.0.0.1", "update_port": 21,
        "asset_mode": assets, "original_sha256": original_hashes,
        "copied_program_sha256": hashes,
        "runtime_verified": False,
        "notes": [
            "The unpacked mir.dat sets its initial socket port to the constant 7000.",
            "group.dat exposes an FTP port but no verified game port setting.",
            "mir.dat was observed connecting to loopback:7000 owned by Mir.exe.",
            "mir.dat reads the generated INI files; group.dat is launcher input.",
            "Launch-Local.ps1 restores the consumed Patched=1 flag before direct launch.",
            "load.lib retains historical website links; no Flash content is patched.",
            "Junctions share assets; they do not enforce read-only permissions.",
        ],
    }
    (destination / "native-client-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (destination / "README-local.txt").write_text(
        "Prepared local-client experiment; no client was launched.\n"
        "group.dat now contains one local group and one server.\n"
        "Run Launch-Local.ps1 to start mir.dat directly with its prepared INI files.\n"
        "Its initial TCP port is hardcoded to 7000 in this client build.\n"
        "The local launcher restores Patched=1, which mir.dat consumes at startup.\n"
        "The FTP updater is localized to 127.0.0.1:21, not a running update service.\n"
        "Do not infer connection success from this preparation.\n"
        "Original configurations are in original-config.\n"
        "Data/Map/Wav junctions are shared with the source, not access-controlled.\n"
        "load.lib retains historical web navigation links.\n", encoding="utf-8")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--destination", type=Path, default=ROOT / ".runtime/native-client")
    parser.add_argument("--server-name", default="热血传奇")
    parser.add_argument("--assets", choices=("junction", "copy"), default="junction")
    args = parser.parse_args()
    try:
        manifest = prepare(args.source, args.destination, args.server_name, args.assets)
    except (ValueError, OSError, configparser.Error, subprocess.CalledProcessError) as error:
        parser.exit(1, f"Preparation failed: {error}\n")
    print(json.dumps({"destination": manifest["destination"],
                      "server_address": manifest["server_address"],
                      "observed_login_port": 7000,
                      "runtime_verified": False}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
