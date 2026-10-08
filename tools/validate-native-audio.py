#!/usr/bin/env python3
"""Audit native WAV identities, public exports and built copies without changing assets."""
import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# These resource roles name inspected SoundUtil constants; they do not certify
# actor trigger, terrain selection, frame timing, mixer or browser playback.
EFFECT_CONSTANTS = {
    "movement": "s_walk_ground_l", "swing": "s_hit_short", "struck": "s_struck_short",
    "miningStone": "s_strike_stone", "weaponShort": "s_hit_short",
    "weaponWooden": "s_hit_wooden", "weaponSword": "s_hit_sword", "weaponDo": "s_hit_do",
    "weaponAxe": "s_hit_axe", "weaponClub": "s_hit_club", "weaponLong": "s_hit_long",
    "weaponFist": "s_hit_fist", "powerMale": "s_yedo_man", "powerFemale": "s_yedo_woman",
    "thrusting": "s_longhit", "halfMoon": "s_widehit", "fire": "s_firehit",
}
MUSIC_CONSTANTS = {"login": "bmg_intro", "select": "bmg_select"}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def safe_filename(value):
    if not isinstance(value, str) or not value or value != value.strip():
        raise ValueError("Expected an unpadded WAV basename")
    if any(character in value for character in '/\\:\x00') or value in (".", ".."):
        raise ValueError("Audio path must be a basename inside its audio directory")
    if not value.lower().endswith(".wav"):
        raise ValueError("Audio resource must have a WAV extension")
    return value


def native_basename(value):
    normalized = value.replace("\\", "/")
    pieces = normalized.split("/")
    if len(pieces) != 2 or pieces[0].casefold() != "wav":
        raise ValueError("Expected a native wav/filename path")
    return safe_filename(pieces[1])


def parse_sound_list(text):
    """SoundUtil.LoadSoundList accepts only n > idx; duplicates/out-of-order skip."""
    entries, ignored, last = {}, [], 0
    for line_number, line in enumerate(text.splitlines(), 1):
        if not line.strip() or line.lstrip().startswith((";", "//")):
            continue
        match = re.fullmatch(r"\s*(\d+)\s*:\s*(.*?)\s*", line)
        if not match:
            raise ValueError(f"Invalid sound.lst entry at line {line_number}")
        number, raw = int(match[1]), match[2]
        filename = native_basename(raw) if raw else None
        entry = dict(number=number, file=filename, line=line_number)
        if number <= last:
            ignored.append(entry)
        else:
            entries[number] = entry
            last = number
    return entries, ignored


def parse_constants(text):
    numbers, music = {}, {}
    for line in text.splitlines():
        match = re.match(r"\s*(s_\w+)\s*=\s*(\d+)\s*;", line, re.I)
        if match:
            numbers[match[1].casefold()] = int(match[2])
        match = re.match(r"\s*(bmg_\w+)\s*=\s*'([^']+)'\s*;", line, re.I)
        if match:
            music[match[1].casefold()] = native_basename(match[2])
    return numbers, music


def index_wavs(directory):
    if not directory.is_dir():
        raise ValueError(f"Missing audio directory: {directory}")
    indexed = {}
    for path in sorted(directory.iterdir(), key=lambda path: path.name.casefold()):
        if not path.is_file() or path.suffix.casefold() != ".wav":
            continue
        safe_filename(path.name)
        if path.resolve().parent != directory.resolve():
            raise ValueError(f"Audio file escapes directory: {path.name}")
        key = path.name.casefold()
        if key in indexed:
            raise ValueError(f"Ambiguous case-insensitive WAV name: {path.name}")
        indexed[key] = path
    return indexed


def audit(profile_path, native_dir, asset_dir, dist_dir, sound_source):
    started = datetime.now(timezone.utc).isoformat()
    report = dict(schemaVersion=1, status="FAIL", startedAt=started,
                  scope="Native WAV byte/SHA256 identity, audio profile reference mapping, publicDir exports and built copies only; no native/browser playback, timing, volume, trigger or fidelity verification",
                  environment="Local Python stdlib; read-only native/assets/dist audit; Vite publicDir is assets/web, no separate public copy",
                  inputs={"profile": str(profile_path.resolve()), "nativeDir": str(native_dir.resolve()),
                          "publicAudioDir": str(asset_dir.resolve()), "distAudioDir": str(dist_dir.resolve()),
                          "soundSource": str(sound_source.resolve())}, errors=[], mappings=[], files=[])
    errors = report["errors"]
    def error(code, **details): errors.append(dict(code=code, **details))
    try:
        profile = json.loads(profile_path.read_text(encoding="utf-8-sig"))
        if profile.get("schemaVersion") != 1:
            raise ValueError("Unsupported audio profile schema")
        native, assets, built = (index_wavs(directory) for directory in (native_dir, asset_dir, dist_dir))
        if not native:
            raise ValueError("Native directory has no WAV resources")
        listing = native_dir / "sound.lst"
        entries, ignored = parse_sound_list(listing.read_bytes().decode("cp936", errors="replace"))
        constants, music = parse_constants(sound_source.read_bytes().decode("cp936", errors="replace"))
        report["nativeList"] = dict(path=str(listing.resolve()), sha256=digest(listing), acceptedSlots=len(entries), ignoredEntries=ignored,
                                    parserBasis="reference SoundUtil.LoadSoundList: n > idx, duplicate/out-of-order entries ignored; empty slots retained")
        manifest_path = asset_dir / "manifest.json"
        manifest_raw = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
        if not isinstance(manifest_raw, list):
            raise ValueError("Audio manifest must be an array")
        manifest = {}
        for item in manifest_raw:
            name = safe_filename(item.get("file"))
            checksum = item.get("sha256")
            if not isinstance(checksum, str) or not re.fullmatch(r"[0-9a-f]{64}", checksum):
                raise ValueError(f"Invalid manifest SHA256: {name}")
            if name.casefold() in manifest:
                raise ValueError(f"Duplicate manifest filename: {name}")
            manifest[name.casefold()] = item
        for stage, index in (("public", assets), ("dist", built), ("manifest", manifest)):
            for extra in sorted(set(index) - set(native)):
                error("unexpected-resource", stage=stage, file=extra)
        for key, path in native.items():
            expected = digest(path)
            row = dict(file=path.name, nativeBytes=path.stat().st_size, nativeSha256=expected, copies={})
            for stage, index in (("public", assets), ("dist", built)):
                copy = index.get(key)
                if copy is None:
                    error("missing-resource", stage=stage, file=path.name)
                    continue
                checksum = digest(copy)
                row["copies"][stage] = dict(file=copy.name, bytes=copy.stat().st_size, sha256=checksum, matchesNative=checksum == expected)
                if checksum != expected:
                    error("byte-mismatch", stage=stage, file=path.name)
            recorded = manifest.get(key)
            if recorded is None:
                error("missing-manifest-entry", file=path.name)
            elif recorded["sha256"] != expected:
                error("manifest-hash-mismatch", file=path.name)
            report["files"].append(row)
        dist_manifest = dist_dir / "manifest.json"
        if not dist_manifest.is_file():
            error("missing-dist-manifest")
        elif digest(dist_manifest) != digest(manifest_path):
            error("manifest-copy-mismatch")
        report["manifest"] = dict(publicPath=str(manifest_path.resolve()), publicSha256=digest(manifest_path),
                                   distPath=str(dist_manifest.resolve()), distSha256=digest(dist_manifest) if dist_manifest.is_file() else None)
        for section in ("music", "effects"):
            mapped = profile.get(section)
            if not isinstance(mapped, dict) or not mapped:
                raise ValueError(f"Missing {section} mapping")
            for role, configured in mapped.items():
                filename = safe_filename(configured)
                row = dict(section=section, role=role, file=filename, resourceUrl="/audio/" + filename)
                expected, number = None, None
                if section == "music":
                    symbol = MUSIC_CONSTANTS.get(role)
                    if symbol:
                        expected = music.get(symbol)
                        row["referenceConstant"] = symbol
                else:
                    symbol = EFFECT_CONSTANTS.get(role)
                    if symbol:
                        number = constants.get(symbol)
                        row["referenceConstant"] = symbol
                    elif role == "skeletonAttack":
                        number = 402
                        row["referenceConstant"] = "inspected Actor sound number 402; trigger outside audit"
                    if number is not None:
                        expected = entries.get(number, {}).get("file")
                        row["nativeSoundNumber"] = number
                        row["soundListLine"] = entries.get(number, {}).get("line")
                if expected is None:
                    error("unproven-role-mapping", section=section, role=role)
                elif filename.casefold() != expected.casefold():
                    error("role-mapping-mismatch", section=section, role=role, file=filename, expected=expected)
                row["expectedFile"] = expected
                for stage, index in (("native", native), ("public", assets), ("dist", built)):
                    copy = index.get(filename.casefold())
                    if copy is None:
                        error("missing-mapped-resource", section=section, role=role, stage=stage, file=filename)
                    elif stage != "native" and copy.name != filename:
                        # Windows lookup masks casing mistakes that would fail on a Linux web host.
                        error("mapped-url-case-mismatch", section=section, role=role, stage=stage, file=filename, actual=copy.name)
                report["mappings"].append(row)
        report["sourceSha256"] = {str(path.resolve()): digest(path) for path in (profile_path, sound_source, manifest_path, Path(__file__))}
        for path in (ROOT / "apps/web/vite.config.ts", ROOT / "tests/test_native_audio_assets.py"):
            if path.is_file(): report["sourceSha256"][str(path.resolve())] = digest(path)
        report["summary"] = dict(nativeWavs=len(native), publicWavs=len(assets), distWavs=len(built), manifestWavs=len(manifest), mappedRoles=len(report["mappings"]), mappedUniqueFiles=len({row["file"].casefold() for row in report["mappings"]}), errors=len(errors))
    except (OSError, ValueError, TypeError, AttributeError) as exception:
        error("invalid-input", reason=str(exception))
    report["finishedAt"] = datetime.now(timezone.utc).isoformat()
    report["status"] = "PASS" if not errors else "FAIL"
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", type=Path, default=ROOT / "content/classic-176/audio-playback.json")
    parser.add_argument("--native-dir", type=Path, default=ROOT / ".runtime/native-client/Wav")
    parser.add_argument("--asset-dir", type=Path, default=ROOT / "assets/web/audio")
    parser.add_argument("--dist-dir", type=Path, default=ROOT / "dist/web/audio")
    parser.add_argument("--sound-source", type=Path, required=True, help="Pinned Delphi SoundUtil.pas, for resource constants only")
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    report = audit(args.profile, args.native_dir, args.asset_dir, args.dist_dir, args.sound_source)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "summary": report.get("summary"), "errors": report["errors"], "report": str(args.report)}, ensure_ascii=False))
    return 0 if report["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
