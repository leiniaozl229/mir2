#!/usr/bin/env python3
"""Create and restore consistent personal Mir2 save archives."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import tarfile
import tempfile


ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / ".runtime"
DEFAULT_BACKUP_DIR = RUNTIME / "backups"
DATABASES = ("mir2_account", "mir2_db", "mir2_data")
STATE_PATHS = (
    Path("Mir200/GuildBase"),
    Path("Mir200/Castle"),
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def compose(*args: str, input_bytes: bytes | None = None, capture: bool = False) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["bash", str(ROOT / "scripts/compose.sh"), *args],
        cwd=ROOT,
        input=input_bytes,
        stdout=subprocess.PIPE if capture else None,
        check=True,
    )


def running_services() -> set[str]:
    result = compose("ps", "--status", "running", "--services", capture=True)
    return set(result.stdout.decode().split())


def stop_game_services(running: set[str]) -> None:
    targets = [name for name in ("web-gateway", "engine") if name in running]
    if targets:
        compose("stop", *targets)


def restart_game_services(running: set[str]) -> None:
    targets = [name for name in ("engine", "web-gateway") if name in running]
    if not targets:
        return
    compose("up", "-d", *targets)
    if "engine" in running:
        subprocess.run(["python3", str(ROOT / "scripts/wait-ready.py")], cwd=ROOT, check=True)


def database_dump(destination: Path) -> None:
    command = (
        'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump -uroot '
        "--single-transaction --hex-blob --routines --events --triggers "
        "--skip-comments --set-gtid-purged=OFF --add-drop-database --databases "
        + " ".join(DATABASES)
    )
    result = compose("exec", "-T", "db", "sh", "-c", command, capture=True)
    destination.write_bytes(result.stdout)


def git_state() -> dict[str, object]:
    revision = subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True,
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
    )
    status = subprocess.run(
        ["git", "status", "--porcelain"], cwd=ROOT, text=True,
        stdout=subprocess.PIPE, check=True,
    )
    return {
        "revision": revision.stdout.strip() if revision.returncode == 0 else None,
        "dirty": bool(status.stdout),
    }


def add_state_files(staging: Path) -> dict[str, str]:
    hashes: dict[str, str] = {}
    source_root = RUNTIME / "server"
    for relative_root in STATE_PATHS:
        source = source_root / relative_root
        if not source.exists():
            continue
        for path in sorted(source.rglob("*")):
            if not path.is_file():
                continue
            relative = Path("files") / relative_root / path.relative_to(source)
            destination = staging / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, destination)
            hashes[relative.as_posix()] = sha256(destination)
    return hashes


def validate_member_name(name: str) -> None:
    path = PurePosixPath(name)
    if path.is_absolute() or ".." in path.parts:
        raise ValueError(f"unsafe archive entry: {name}")


def validate_archive(archive: Path, destination: Path) -> dict[str, object]:
    with tarfile.open(archive, "r:gz") as bundle:
        for member in bundle.getmembers():
            validate_member_name(member.name)
            if member.issym() or member.islnk() or member.isdev():
                raise ValueError(f"unsupported archive entry: {member.name}")
        bundle.extractall(destination)
    manifest_path = destination / "manifest.json"
    database_path = destination / "database.sql"
    if not manifest_path.is_file() or not database_path.is_file():
        raise ValueError("archive is missing manifest.json or database.sql")
    manifest = json.loads(manifest_path.read_text())
    if manifest.get("schemaVersion") != 1:
        raise ValueError("unsupported backup schema")
    if sha256(database_path) != manifest.get("databaseSha256"):
        raise ValueError("database dump checksum mismatch")
    for name, expected in manifest.get("fileSha256", {}).items():
        validate_member_name(name)
        path = destination / name
        if not path.is_file() or sha256(path) != expected:
            raise ValueError(f"state file checksum mismatch: {name}")
    return manifest


def create_backup(output: Path | None) -> Path:
    if not (RUNTIME / "db.env").is_file():
        raise SystemExit("Run scripts/prepare-runtime.py before creating a backup")
    compose("up", "-d", "db")
    running = running_services()
    stop_game_services(running)
    try:
        with tempfile.TemporaryDirectory(dir=RUNTIME, prefix="backup-") as temp_name:
            staging = Path(temp_name)
            database = staging / "database.sql"
            database_dump(database)
            file_hashes = add_state_files(staging)
            manifest = {
                "schemaVersion": 1,
                "createdAt": datetime.now(timezone.utc).isoformat(),
                "databases": list(DATABASES),
                "databaseBytes": database.stat().st_size,
                "databaseSha256": sha256(database),
                "fileSha256": file_hashes,
                "project": git_state(),
            }
            (staging / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
            if output is None:
                stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
                output = DEFAULT_BACKUP_DIR / f"mir2-save-{stamp}.tar.gz"
            output = output.expanduser().resolve()
            output.parent.mkdir(parents=True, exist_ok=True)
            temporary_output = output.with_suffix(output.suffix + ".tmp")
            with tarfile.open(temporary_output, "w:gz") as bundle:
                for path in sorted(staging.rglob("*")):
                    if path.is_file():
                        bundle.add(path, arcname=path.relative_to(staging).as_posix(), recursive=False)
            temporary_output.chmod(0o600)
            temporary_output.replace(output)
            return output
    finally:
        restart_game_services(running)


def restore_backup(archive: Path, confirmed: bool) -> dict[str, object]:
    if not confirmed:
        raise SystemExit("Restore replaces the current save. Re-run with --yes after selecting the archive.")
    archive = archive.expanduser().resolve()
    compose("up", "-d", "db")
    with tempfile.TemporaryDirectory(dir=RUNTIME, prefix="restore-") as temp_name:
        staging = Path(temp_name)
        manifest = validate_archive(archive, staging)
        running = running_services()
        stop_game_services(running)
        try:
            command = 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot'
            compose("exec", "-T", "db", "sh", "-c", command,
                    input_bytes=(staging / "database.sql").read_bytes())
            server_root = RUNTIME / "server"
            for relative_root in STATE_PATHS:
                restored = staging / "files" / relative_root
                if not restored.exists():
                    continue
                destination = server_root / relative_root
                shutil.rmtree(destination, ignore_errors=True)
                shutil.copytree(restored, destination)
        finally:
            restart_game_services(running)
        return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    backup = commands.add_parser("create", help="stop game services, save, and create an archive")
    backup.add_argument("--output", type=Path)
    verify = commands.add_parser("verify", help="validate an archive without changing the save")
    verify.add_argument("archive", type=Path)
    restore = commands.add_parser("restore", help="replace the current save from an archive")
    restore.add_argument("archive", type=Path)
    restore.add_argument("--yes", action="store_true")
    args = parser.parse_args()
    if args.command == "create":
        path = create_backup(args.output)
        print(f"Backup created: {path}")
    elif args.command == "verify":
        with tempfile.TemporaryDirectory(dir=RUNTIME, prefix="verify-") as temp_name:
            manifest = validate_archive(args.archive.expanduser().resolve(), Path(temp_name))
        print(f"Backup valid: {args.archive} ({manifest['databaseBytes']} database bytes)")
    else:
        manifest = restore_backup(args.archive, args.yes)
        print(f"Backup restored: {args.archive} ({manifest['createdAt']})")


if __name__ == "__main__":
    main()
