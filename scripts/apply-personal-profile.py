#!/usr/bin/env python3
"""Apply an opt-in solo profile to an already prepared runtime directory."""
from __future__ import annotations

import argparse
import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PROFILE = ROOT / "content/classic-176/personal-profile.example.json"


def decode(path: Path) -> tuple[str, str]:
    raw = path.read_bytes()
    for encoding in ("utf-8-sig", "gb18030", "utf-8"):
        try:
            return raw.decode(encoding), encoding
        except UnicodeDecodeError:
            continue
    raise UnicodeDecodeError("unknown", raw, 0, len(raw), f"cannot decode {path}")


def replace_key(path: Path, key: str, value: int) -> bool:
    text, encoding = decode(path)
    pattern = re.compile(rf"(?m)^(?P<prefix>\s*{re.escape(key)}\s*=\s*)[^\r\n]*")
    text, count = pattern.subn(lambda match: f"{match.group('prefix')}{value}", text, count=1)
    if count:
        path.write_bytes(text.encode("utf-8-sig" if encoding == "utf-8-sig" else encoding))
    return bool(count)


def scale_mon_items(directory: Path, multiplier: float, apply: bool) -> int:
    changed = 0
    line_pattern = re.compile(r"^(?P<indent>\s*)(?P<selected>\d+)\s*/\s*(?P<maximum>\d+)(?P<rest>.*)$")
    for path in sorted(directory.glob("*.txt")):
        text, encoding = decode(path)
        lines = text.splitlines(keepends=True)
        output: list[str] = []
        file_changed = False
        for line in lines:
            ending = "\r\n" if line.endswith("\r\n") else "\n" if line.endswith("\n") else ""
            body = line[: -len(ending)] if ending else line
            match = line_pattern.match(body)
            if not match:
                output.append(line)
                continue
            selected, maximum = int(match["selected"]), int(match["maximum"])
            if maximum <= 0 or selected <= 0:
                output.append(line)
                continue
            scaled = max(1, min(maximum, math.floor(selected * multiplier + 0.5)))
            new_body = f"{match['indent']}{scaled}/{maximum}{match['rest']}"
            file_changed |= new_body != body
            output.append(new_body + ending)
        if file_changed:
            changed += 1
            if apply:
                path.write_bytes("".join(output).encode("utf-8-sig" if encoding == "utf-8-sig" else encoding))
    return changed


def apply_profile(profile_path: Path, runtime: Path, apply: bool) -> dict:
    profile = json.loads(profile_path.read_text(encoding="utf-8"))
    exp = profile.get("experienceMultiplier", 1)
    drop = float(profile.get("dropMultiplier", 1.0))
    spawn = float(profile.get("spawnDelayMultiplier", 1.0))
    if isinstance(exp, bool) or int(exp) != exp or int(exp) < 1:
        raise ValueError("experienceMultiplier must be a positive integer")
    if not 0.1 <= drop <= 100 or not 0.1 <= spawn <= 100:
        raise ValueError("dropMultiplier and spawnDelayMultiplier must be between 0.1 and 100")
    mir = runtime / "server/Mir200"
    exps = mir / "exps.conf"
    server = mir / "server.conf"
    mon_items = mir / "Envir/MonItems"
    admin = mir / "Envir/AdminList.txt"
    if not all(path.exists() for path in (exps, server, mon_items)):
        raise FileNotFoundError(f"prepared runtime is missing: {mir}")
    changes = {
        "experienceMultiplier": {"file": str(exps), "key": "KillMonExpMultiple", "value": int(exp)},
        "spawnDelayMultiplier": {"file": str(server), "key": "RegenMonstersTime", "value": max(10, math.floor(200 * spawn + 0.5))},
    }
    if apply:
        replace_key(exps, "KillMonExpMultiple", int(exp))
        replace_key(server, "RegenMonstersTime", changes["spawnDelayMultiplier"]["value"])
    changed_monsters = scale_mon_items(mon_items, drop, apply)
    gm = profile.get("gm", {})
    gm_enabled = bool(gm.get("enabled", False))
    gm_character = str(gm.get("character", "")).strip()
    gm_ip = str(gm.get("ip", "127.0.0.1")).strip() or "127.0.0.1"
    if gm_enabled:
        if not gm_character:
            raise ValueError("gm.character is required when gm.enabled is true")
        changes["gm"] = {"file": str(admin), "line": f"*{gm_character} {gm_ip}"}
        if apply:
            admin.parent.mkdir(parents=True, exist_ok=True)
            existing = admin.read_text(encoding="utf-8") if admin.exists() else ""
            lines = [line for line in existing.splitlines() if not line.strip().endswith(f" {gm_ip}") and gm_character.casefold() not in line.casefold()]
            lines.append(f"*{gm_character} {gm_ip}")
            admin.write_text("\n".join(lines) + "\n", encoding="utf-8")
    changes["dropMultiplier"] = {"files": changed_monsters, "value": drop}
    if apply:
        (runtime / "personal-profile.json").write_text(json.dumps(profile, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"ok": True, "applied": apply, "profile": profile.get("id", profile_path.stem), "changes": changes}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", type=Path, default=DEFAULT_PROFILE)
    parser.add_argument("--runtime", type=Path, default=ROOT / ".runtime")
    parser.add_argument("--apply", action="store_true", help="write the profile; without this flag only print the plan")
    args = parser.parse_args()
    report = apply_profile(args.profile, args.runtime, args.apply)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
