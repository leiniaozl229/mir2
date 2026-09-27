#!/usr/bin/env python3
"""Restore an already-fetched data submodule, excluding Windows-invalid names.

Windows Git rejects this upstream tree even with sparse-checkout: five names
contain literal backslashes and alias real QuestDiary files on Windows. Export
legal blobs and bootstrap a standard Git v3 index without changing any objects.
Never run sparse-checkout set/reapply here: it can remove those aliased files.
Existing files must match their recorded blobs and are never overwritten.
"""

from __future__ import annotations

import hashlib
import os
from pathlib import Path
import re
import struct
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
SUBMODULE = "vendor/mirserver-data"
WORKTREE = ROOT / SUBMODULE


def git(*args: str, input_bytes: bytes | None = None) -> bytes:
    return subprocess.check_output(["git", "-C", str(ROOT), *args], input=input_bytes)


def windows_invalid(path: str) -> bool:
    for part in path.split("/"):
        if re.search(r'[<>:"\\|?*\x00-\x1f]|[. ]$', part):
            return True
        if re.fullmatch(r"(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?", part, re.I):
            return True
    return False


def literal_pattern(path: str) -> str:
    # A non-cone sparse-checkout file uses gitignore escaping, including for
    # literal backslashes embedded in names created on Unix.
    return "!/" + "".join("\\" + c if c in "\\*?[] " else c for c in path)


def make_index(entries: list[tuple[bytes, bytes, str]], excluded: set[str]) -> bytes:
    """Git index v3: standard entries, skip-worktree on excluded names, SHA-1."""
    data = bytearray(b"DIRC" + struct.pack(">II", 3, len(entries)))
    for mode, oid, path in entries:
        name = path.encode("utf-8")
        skip = path in excluded
        flags = min(len(name), 0xFFF) | (0x4000 if skip else 0)
        record = struct.pack(">10I20sH", 0, 0, 0, 0, 0, 0, int(mode, 8), 0, 0, 0,
                             bytes.fromhex(oid.decode("ascii")), flags)
        if skip:
            record += struct.pack(">H", 0x4000)
        record += name + b"\0"
        record += b"\0" * (-len(record) % 8)
        data.extend(record)
    return bytes(data) + hashlib.sha1(data).digest()


def main() -> None:
    record = git("ls-tree", "HEAD", SUBMODULE).decode("utf-8").strip()
    if not record.startswith("160000 commit "):
        raise SystemExit(f"{SUBMODULE} is not a submodule in HEAD")
    expected = record.split()[2]
    gitdir = Path(git("rev-parse", "--git-path", f"modules/{SUBMODULE}").decode().strip())
    if not gitdir.is_absolute():
        gitdir = ROOT / gitdir
    gitdir = gitdir.resolve()
    if not (gitdir / "objects").is_dir():
        raise SystemExit("Fetch the data submodule first: git submodule update --init")
    WORKTREE.mkdir(parents=True, exist_ok=True)

    def subgit(*args: str, input_bytes: bytes | None = None) -> bytes:
        return git(f"--git-dir={gitdir}", f"--work-tree={WORKTREE}", *args, input_bytes=input_bytes)

    actual = subgit("rev-parse", "HEAD").decode().strip()
    if actual != expected:
        raise SystemExit(f"Refusing to change existing HEAD {actual}; expected {expected}")
    index_exists = (gitdir / "index").exists()
    if index_exists:
        if subgit("status", "--porcelain", "--untracked-files=all"):
            raise SystemExit("Refusing to alter a modified submodule; preserve its changes first")
    if subgit("rev-parse", "--show-object-format").strip() != b"sha1":
        raise SystemExit("This index bootstrap supports SHA-1 repositories only")
    entries = []
    for raw in subgit("ls-tree", "-rz", expected).rstrip(b"\0").split(b"\0"):
        metadata, name = raw.split(b"\t", 1)
        mode, kind, oid = metadata.split()
        if kind != b"blob" or mode not in (b"100644", b"100755"):
            raise SystemExit("This recovery only supports regular-file data trees")
        entries.append((mode, oid, name.decode("utf-8")))
    paths = [path for _, _, path in entries]
    excluded = {path for path in paths if windows_invalid(path)}
    if any("\n" in path or "\r" in path for path in excluded):
        raise SystemExit("A path contains a newline and cannot be safely excluded by this script")
    patterns = ("/*\n" + "\n".join(literal_pattern(path) for path in sorted(excluded)) + "\n").encode("utf-8")

    gitfile = WORKTREE / ".git"
    expected_gitfile = "gitdir: " + os.path.relpath(gitdir, WORKTREE).replace(os.sep, "/") + "\n"
    if gitfile.exists():
        if gitfile.is_dir():
            raise SystemExit("Refusing to replace an embedded repository")
        linked = gitfile.read_text(encoding="utf-8").strip()
        if not linked.startswith("gitdir: ") or (WORKTREE / linked[8:]).resolve() != gitdir:
            raise SystemExit("Existing .git pointer refers to a different repository")

    allowed = {path.casefold() for path in paths if path not in excluded}
    for target in WORKTREE.rglob("*"):
        relative = target.relative_to(WORKTREE).as_posix()
        if target.is_file() and relative != ".git" and relative.casefold() not in allowed:
            raise SystemExit(f"Refusing to alter a worktree containing an untracked file: {relative}")
    missing = []
    for _, oid, path in entries:
        if path in excluded:
            continue
        target = WORKTREE / path
        if target.is_symlink():
            raise SystemExit(f"Refusing to write through a symbolic link: {path}")
        if target.exists():
            content = target.read_bytes()
            actual_blob = hashlib.sha1(b"blob " + str(len(content)).encode() + b"\0" + content).hexdigest()
            if actual_blob != oid.decode("ascii"):
                raise SystemExit(f"Refusing to overwrite a changed file: {path}")
        else:
            missing.append((oid, path))
    if index_exists and missing:
        raise SystemExit("Refusing to restore deletions in an existing indexed worktree")

    # Archive/read-tree also reject these names on Windows, so read blobs by ID.
    if missing:
        command = ["git", f"--git-dir={gitdir}", "cat-file", "--batch"]
        with subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE) as process:
            assert process.stdin is not None and process.stdout is not None
            for oid, path in missing:
                target = (WORKTREE / path).resolve()
                if WORKTREE.resolve() not in target.parents:
                    raise SystemExit(f"Unsafe path outside the data directory: {path}")
                process.stdin.write(oid + b"\n")
                process.stdin.flush()
                header = process.stdout.readline().split()
                if len(header) != 3 or header[:2] != [oid, b"blob"]:
                    raise SystemExit("Unexpected git cat-file response")
                content = process.stdout.read(int(header[2]))
                if len(content) != int(header[2]) or process.stdout.read(1) != b"\n":
                    raise SystemExit("Incomplete git blob response")
                target.parent.mkdir(parents=True, exist_ok=True)
                with target.open("xb") as output:
                    output.write(content)
            process.stdin.close()
            if process.wait() != 0:
                raise SystemExit("Git blob export failed")

    # All configuration belongs exclusively to this submodule. Preserve any
    # differing sparse file instead of silently replacing user configuration.
    sparse_file = gitdir / "info/sparse-checkout"
    if sparse_file.exists() and sparse_file.read_bytes() != patterns:
        raise SystemExit("Existing sparse-checkout patterns differ; review them before recovery")
    sparse_file.parent.mkdir(parents=True, exist_ok=True)
    if not sparse_file.exists():
        sparse_file.write_bytes(patterns)
    subgit("config", "--local", "extensions.worktreeConfig", "true")
    subgit("config", "--local", "core.bare", "false")
    subgit("config", "--worktree", "core.worktree", os.path.relpath(WORKTREE, gitdir).replace(os.sep, "/"))
    subgit("config", "--worktree", "core.sparseCheckout", "true")
    subgit("config", "--worktree", "core.sparseCheckoutCone", "false")
    if not index_exists:
        with (gitdir / "index").open("xb") as output:
            output.write(make_index(entries, excluded))
    if not gitfile.exists():
        gitfile.write_text(expected_gitfile, encoding="utf-8")
    git("submodule", "init", "--", SUBMODULE)

    missing = [path for path in paths if path not in excluded and not (WORKTREE / path).is_file()]
    if missing:
        raise SystemExit(f"Checkout verification failed: {len(missing)} included files are missing")
    if subgit("status", "--porcelain", "--untracked-files=all"):
        raise SystemExit("Checkout verification failed: submodule is not clean")
    print(f"Restored {len(paths) - len(excluded)} files at {expected}")
    for path in sorted(excluded):
        print(f"Windows path excluded (Git object preserved): {path}")
    print(git("submodule", "status", "--", SUBMODULE).decode().strip())


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    main()
