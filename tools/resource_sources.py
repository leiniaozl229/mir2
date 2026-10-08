"""Resolve icon frames against explicit source locks, never against filenames alone.

This checks resource identity and basic exported geometry.  It does not establish
the intended game version of a server row, pixel fidelity, or runtime behaviour.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def child_path(base: Path, relative: str) -> Path | None:
    """Reject absolute paths and traversal in contract children and frame URLs."""
    path = Path(relative)
    if path.is_absolute() or "\\" in relative or any(part == ".." for part in path.parts):
        return None
    result = (base / path).resolve()
    return result if result.is_relative_to(base.resolve()) else None


class ResourceSources:
    def __init__(self, root: Path, web: Path, contract: dict[str, Any]):
        self.root, self.web, self.contract = root, web, contract
        self._libraries: dict[str, dict[str, Any] | None] = {}
        self._source_checks: dict[str, tuple[bool, str | None]] = {}

    def library(self, namespace: str) -> dict[str, Any] | None:
        namespace = namespace.strip("/")
        if namespace not in self._libraries:
            path = child_path(self.web, namespace + "/library.json")
            try:
                self._libraries[namespace] = json.loads(path.read_text(encoding="utf-8")) if path else None
            except (OSError, ValueError):
                self._libraries[namespace] = None
        return self._libraries[namespace]

    def registered(self, namespace: str) -> list[dict[str, Any]]:
        path = child_path(self.web, namespace.strip("/") + "/library.json")
        if path is None or not path.is_relative_to(self.root.resolve()):
            return []
        relative = path.relative_to(self.root.resolve()).as_posix()
        return [entry for entry in self.contract.get("assets", [])
                if entry.get("kind") == "library" and relative in entry.get("library", {}).get("manifests", [])]

    def source_check(self, entry: dict[str, Any]) -> tuple[bool, str | None]:
        key = entry["id"]
        if key in self._source_checks:
            return self._source_checks[key]
        result: tuple[bool, str | None] = (True, None)
        if not entry.get("sourceFiles"):
            result = (False, "unknown_source")
        for locked in entry.get("sourceFiles", []):
            root_value = self.contract.get("roots", {}).get(locked.get("root"))
            if root_value is None:
                result = (False, "unknown_source")
                break
            base = Path(root_value)
            if not base.is_absolute():
                base = self.root / base
            path = child_path(base, locked["path"])
            if path is None or not path.is_file():
                result = (False, "source_missing")
                break
            if path.stat().st_size != locked.get("bytes") or sha256(path) != locked.get("sha256"):
                result = (False, "source_hash_mismatch")
                break
        self._source_checks[key] = result
        return result

    def resolve(self, namespace: str, index: int) -> dict[str, Any]:
        namespace = namespace.strip("/")
        result: dict[str, Any] = {"namespace": "/" + namespace, "index": index,
                                  "sourceId": None, "sourceRole": "unknown", "sourceVersion": "unknown",
                                  "provenance": None, "sourceVerified": False, "sourceFrameCount": None,
                                  "available": False, "url": None, "missingReason": "unknown_source"}
        data = self.library(namespace)
        registered = self.registered(namespace)
        # Ambiguous declarations are not silently ordered into a version choice.
        matches = []
        for entry in registered:
            expected_data = next((value for value in entry.get("sourceFiles", []) if value.get("purpose") == "data"), None)
            expected_index = next((value for value in entry.get("sourceFiles", []) if value.get("purpose") == "index"), None)
            if data and expected_data and data.get("sourceSha256") == expected_data.get("sha256") and (
                    not expected_index or data.get("indexSha256") == expected_index.get("sha256")):
                matches.append(entry)
        if len(matches) != 1:
            if registered:
                result["missingReason"] = "asset_missing" if data is None else "source_hash_mismatch" if not matches else "ambiguous_source"
            return result
        entry = matches[0]
        result.update(sourceId=entry["id"], sourceRole=entry["role"], sourceVersion=entry.get("version", "unknown"),
                      provenance=entry.get("provenance"), sourceFrameCount=entry["library"].get("sourceFrameCount"))
        verified, reason = self.source_check(entry)
        if not verified:
            result["missingReason"] = reason
            return result
        result["sourceVerified"] = True
        if data.get("sourceFrameCount") != result["sourceFrameCount"]:
            result["missingReason"] = "source_frame_count_mismatch"
            return result
        if not isinstance(index, int) or index < 0 or index >= result["sourceFrameCount"]:
            result["missingReason"] = "frame_out_of_range"
            return result
        frame = data.get("frames", {}).get(str(index))
        if not frame or frame.get("width", 0) <= 4 or frame.get("height", 0) <= 1:
            result["missingReason"] = "frame_empty_placeholder" if frame or index in data.get("empty", []) else "asset_missing"
            return result
        frame_path = child_path(self.web / namespace, frame.get("file", ""))
        if frame_path is None or not frame_path.is_file():
            result["missingReason"] = "asset_missing"
            return result
        result.update(available=True, url=f"/{namespace}/{frame['file']}", missingReason=None,
                      frameGeometry={key: frame.get(key) for key in ("width", "height", "offsetX", "offsetY")})
        return result

    def candidates(self, category: str, stem: str | None = None) -> list[dict[str, Any]]:
        """Candidates identify locked sources; they do not establish usable frames."""
        return [{"sourceId": value["id"], "sourceRole": value["role"],
                 "sourceVersion": value.get("version", "unknown"), "namespace": value.get("namespace"),
                 "selected": False, "missingReason": "extension_mapping_unconfirmed"}
                for value in self.contract.get("assets", [])
                if value.get("role") == "reference_candidate" and value.get("category") == category
                and (stem is None or any(Path(source["path"]).stem.casefold() == stem.casefold() for source in value.get("sourceFiles", [])))]


def magic_identity(skills: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Same effect pairs are aliases only for this narrow comparison, not all rules."""
    groups: dict[int, list[dict[str, Any]]] = {}
    for skill in skills:
        groups.setdefault(skill["magicId"], []).append(skill)
    conflicts, aliases = [], []
    for magic_id, rows in sorted(groups.items()):
        if len(rows) < 2:
            continue
        if len({(row["effectType"], row["effect"]) for row in rows}) == 1:
            aliases.append({"magicId": magic_id, "names": [row["name"] for row in rows],
                            "scope": "same_effect_type_and_effect_only"})
        else:
            conflicts.append({"magicId": magic_id, "reason": "different_effect_type_or_effect",
                              "rows": [{key: row[key] for key in ("idx", "magicId", "name", "effectType", "effect")} for row in rows]})
    return conflicts, aliases
