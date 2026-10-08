#!/usr/bin/env python3
"""Read-only identity/pixel/layout checks for the national system/auth contracts.

An asset-scope pass does not verify native-client interactions or browser rendering.
No exported image, source WIL, runtime overlay, service or database is modified.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from wil_lib import WeMadeLibrary
from crystal_lib import png_rgba
from PIL import Image

PINNED_SOURCE = {
    "data": {"path": "Prguse.wil", "bytes": 4313717,
             "sha256": "88a12492138bc85ba0429dce3cbd857efcea5b7659cdd8d85a4f2f4db68d5ef2"},
    "index": {"path": "Prguse.WIX", "bytes": 2088,
              "sha256": "e3c60272e6493fb8c409a8bc90834f01b61f37647152865c9125827e82514531"},
    "sourceFrameCount": 510,
}
EXPECTED_GEOMETRY = {
    50: (420, 299), 53: (128, 33), 54: (296, 253), 64: (16, 23),
    65: (800, 600), 360: (452, 179), 380: (256, 359), 381: (188, 105),
    **{index: (80, 34) for index in range(361, 369)},
}
CONTRACTS = ("content/classic-176/system-dialog.json", "content/classic-176/auth-actions.json")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def _rect(rect, width, height, scope):
    values = [rect.get(key) for key in ("left", "top", "width", "height")]
    if any(type(value) is not int for value in values):
        raise ValueError(f"{scope}: integer rectangle required")
    left, top, rect_width, rect_height = values
    if left < 0 or top < 0 or rect_width <= 0 or rect_height <= 0 or left + rect_width > width or top + rect_height > height:
        raise ValueError(f"{scope}: rectangle outside native panel")


def _overlap(a, b):
    return (a["left"] < b["left"] + b["width"] and b["left"] < a["left"] + a["width"]
            and a["top"] < b["top"] + b["height"] and b["top"] < a["top"] + a["height"])


def validate_layouts(system, auth):
    """Validate safe proposed hotzones separately from historical proof."""
    for contract, domain in ((system, "system-dialog"), (auth, "auth-actions")):
        if contract.get("schemaVersion") != 1 or contract.get("domain") != domain:
            raise ValueError(f"{domain}: schema/domain mismatch")
        if contract.get("canvas", {}).get("width") != 800 or contract["canvas"].get("height") != 600:
            raise ValueError(f"{domain}: 800x600 canvas required")
        if (contract.get("nativeSameVersion") != "unknown" or contract.get("historicalLayoutVerified") is not False
                or contract.get("browserVisualComparisonVerified") is not False or contract.get("complete") is not False):
            raise ValueError(f"{domain}: unmeasured parity must remain open")
    if system.get("buttonOrder") != ["cancel", "no", "yes", "ok"]:
        raise ValueError("system: reference right-to-left button order mismatch")
    for key, normal in (("ok", 361), ("yes", 363), ("cancel", 365), ("no", 367)):
        spec = system["buttons"][key]
        if (spec.get("normalFrame"), spec.get("pressedFrame"), spec.get("width"), spec.get("height")) != (normal, normal + 1, 80, 34):
            raise ValueError(f"system: {key} native frame pair mismatch")
        if spec.get("hoverFrame") != normal or spec.get("hoverPolicy") != "reuse_normal_no_independent_hover_evidence":
            raise ValueError(f"system: {key} hover evidence must remain explicit")
    for size, index in (("horizontal", 360), ("vertical", 380), ("small", 381)):
        variant = system["variants"][size]
        width, height = EXPECTED_GEOMETRY[index]
        if (variant.get("frame"), variant.get("width"), variant.get("height")) != (index, width, height):
            raise ValueError(f"system {size}: native geometry mismatch")
        _rect(variant["text"], width, height, f"system {size} text")
        expected_count = 1 if size == "small" else 4
        if variant.get("maxButtons") != expected_count or set(variant["buttonPositionsByCount"]) != {str(i) for i in range(1, expected_count + 1)}:
            raise ValueError(f"system {size}: every supported button count required")
        if size == "small" and variant.get("fallbackSizeForOverflow") != "horizontal":
            raise ValueError("system small: multiple buttons require explicit horizontal fallback")
        for count, positions in variant["buttonPositionsByCount"].items():
            if len(positions) != int(count):
                raise ValueError(f"system {size}: count/position mismatch")
            rectangles = [{**position, "width": 80, "height": 34} for position in positions]
            for rectangle in rectangles:
                _rect(rectangle, width, height, f"system {size} button")
                if _overlap(rectangle, variant["text"]):
                    raise ValueError(f"system {size}: button overlaps text area")
            if any(_overlap(a, b) for i, a in enumerate(rectangles) for b in rectangles[i + 1:]):
                raise ValueError(f"system {size}: overlapping button hotzones")
    panel = auth["changePassword"]
    if (panel.get("backgroundFrame"), panel.get("width"), panel.get("height")) != (50, 420, 299):
        raise ValueError("auth: native frame-50 backdrop required")
    if panel.get("center") != {"left": 190, "top": 150, "rule": "integer-div", "provenance": "reference_source"}:
        raise ValueError("auth: integer-div 800x600 center mismatch")
    order = ["account", "oldPassword", "newPassword", "repeatPassword"]
    if panel.get("inputOrder") != order or set(panel["inputs"]) != set(order):
        raise ValueError("auth: four ordered inputs required")
    for name in order:
        entry = panel["inputs"][name]
        _rect(entry, 420, 299, f"auth {name}")
        if entry.get("maxLength") != 10 or entry.get("masked") is not (name != "account"):
            raise ValueError(f"auth {name}: reference edit policy mismatch")
        if entry.get("layoutEvidence") != "proposed_native_pixel_measurement":
            raise ValueError(f"auth {name}: unverified hotzone cannot be upgraded")
        border = entry["measuredBorder"]
        if (entry["left"] <= border["left"] or entry["top"] <= border["top"]
                or entry["left"] + entry["width"] > border["right"]
                or entry["top"] + entry["height"] > border["bottom"]):
            raise ValueError(f"auth {name}: proposed edit must fit measured border")
    for name in ("agree", "cancel"):
        entry = panel["buttons"][name]
        _rect(entry, 420, 299, f"auth {name}")
        if entry.get("embeddedInBackground") is not True or entry.get("layoutEvidence") != "proposed_native_pixel_measurement":
            raise ValueError(f"auth {name}: preserve baked native pixels and proposed hotzone")
    if _overlap(panel["buttons"]["agree"], panel["buttons"]["cancel"]):
        raise ValueError("auth: overlapping embedded-button hotzones")
    for name, normal, rejected in (("loginEntry", 53, 54), ("closeCandidate", 64, 65)):
        entry = panel[name]
        if (entry.get("normalFrame"), entry.get("pressedFrame"), entry.get("rejectedAdjacentFrame")) != (normal, normal, rejected):
            raise ValueError(f"auth {name}: adjacent frame is a backdrop, not a pressed button")
        if (entry.get("width"), entry.get("height")) != EXPECTED_GEOMETRY[normal] or entry.get("pressedPolicy") != "reuse_normal_unverified":
            raise ValueError(f"auth {name}: normal-only reuse must remain explicit")


def audit(root=ROOT, data_dir=None, expected_source=None):
    """Verify independently pinned source bytes and real exported PNG/pixels.

    expected_source is a fixture seam. CLI always uses the production pins.
    """
    root = Path(root).resolve()
    explicit_data_dir = data_dir is not None
    pins = expected_source or PINNED_SOURCE
    active = read_json(root / "content/classic-176/active-asset-sources.json")
    assets = [item for item in active["assets"] if item.get("id") == "national:ui:prguse"]
    if len(assets) != 1:
        raise ValueError("one active national:ui:prguse source required")
    active_source = assets[0]
    if (active_source.get("role"), active_source.get("provenance"), active_source.get("namespace")) != ("active_required", "native_pixels", "/ui-national/prguse"):
        raise ValueError("active source role/provenance/namespace mismatch")
    if data_dir is None:
        configured = active["roots"]["nationalData"]
        if not isinstance(configured, str) or not configured.strip():
            raise ValueError("active roots.nationalData must name the original source directory")
        data_dir = Path(configured)
        if not data_dir.is_absolute():
            data_dir = root / data_dir
    data_dir = Path(data_dir).resolve()
    contracts = [read_json(root / path) for path in CONTRACTS]
    validate_layouts(*contracts)
    reference_checks = []
    for reference in (contracts[0]["referenceLayout"], contracts[1]["changePassword"]["reference"]):
        if reference.get("kind") != "reference_source":
            raise ValueError("reference implementation cannot become native runtime evidence")
        reference_path = Path(reference["path"])
        reference_bytes = reference_path.read_bytes()
        if sha(reference_bytes) != reference.get("sha256"):
            raise ValueError("reference implementation source hash mismatch")
        reference_checks.append({"path": str(reference_path), "bytes": len(reference_bytes), "sha256": sha(reference_bytes), "kind": "reference_source"})
    source_files = {item["purpose"]: item for item in active_source["sourceFiles"]}
    source_paths, source_checks = {}, {}
    for purpose in ("data", "index"):
        pin, registered = pins[purpose], source_files[purpose]
        if any(registered.get(key) != pin[key] for key in ("path", "bytes", "sha256")) or registered.get("root") != "nationalData":
            raise ValueError(f"{purpose}: active source differs from independent pin")
        path = data_dir / pin["path"]
        data = path.read_bytes()
        if len(data) != pin["bytes"] or sha(data) != pin["sha256"]:
            raise ValueError(f"{purpose}: original source hash/size mismatch")
        source_paths[purpose] = path
        source_checks[purpose] = {"path": str(path), "bytes": len(data), "sha256": sha(data)}
    if active_source["library"].get("sourceFrameCount") != pins["sourceFrameCount"]:
        raise ValueError("active source frame-count mismatch")
    manifest_path = root / "assets/web/ui-national/prguse/library.json"
    manifest_data = manifest_path.read_bytes()
    manifest = json.loads(manifest_data)
    for contract in contracts:
        if contract.get("family") != "prguse" or contract.get("namespace") != "/ui-national/prguse":
            raise ValueError("contract source family/namespace mismatch")
        if contract.get("sourceSha256") != pins["data"]["sha256"] or contract.get("indexSha256") != pins["index"]["sha256"]:
            raise ValueError("contract source identity mismatch")
        source = contract["source"]
        if (source.get("sourceId"), source.get("provenance"), source.get("root"), source.get("sourceFrameCount")) != ("national:ui:prguse", "native_pixels", "nationalData", pins["sourceFrameCount"]):
            raise ValueError("contract original source provenance/count mismatch")
        if any(source[purpose] != pins[purpose] for purpose in ("data", "index")):
            raise ValueError("contract original source pins mismatch")
        if source.get("manifest") != "assets/web/ui-national/prguse/library.json" or source.get("manifestSha256") != sha(manifest_data):
            raise ValueError("contract full manifest hash mismatch")
    if (manifest.get("sourceSha256"), manifest.get("indexSha256"), manifest.get("sourceFrameCount")) != (pins["data"]["sha256"], pins["index"]["sha256"], pins["sourceFrameCount"]):
        raise ValueError("exported manifest identity mismatch")
    library = WeMadeLibrary(source_paths["data"], source_paths["index"])
    if library.count != pins["sourceFrameCount"]:
        raise ValueError("original source decoded frame-count mismatch")
    frames = {}
    for contract in contracts:
        expected = set(range(360, 369)) | {380, 381} if contract["domain"] == "system-dialog" else {50, 53, 54, 64, 65}
        if set(contract["frames"]) != {str(index) for index in expected}:
            raise ValueError("contract required original frame set mismatch")
        for index in sorted(expected):
            locked = contract["frames"][str(index)]
            exported = manifest["frames"].get(str(index))
            original = library.frame(index)
            if original is None or exported is None or locked.get("index") != index:
                raise ValueError(f"frame {index}: missing original/exported frame")
            if (original["width"], original["height"]) != EXPECTED_GEOMETRY[index]:
                raise ValueError(f"frame {index}: original geometry differs from target")
            for key in ("index", "width", "height", "offsetX", "offsetY"):
                if locked.get(key) != original[key] or exported.get(key) != original[key]:
                    raise ValueError(f"frame {index}: {key} mismatch")
            if locked.get("sourceSha256") != pins["data"]["sha256"] or locked.get("indexSha256") != pins["index"]["sha256"] or locked.get("provenance") != "native_pixels":
                raise ValueError(f"frame {index}: original source identity mismatch")
            relative = Path(locked["file"])
            if relative.is_absolute() or len(relative.parts) != 1 or relative.suffix != ".png" or exported.get("file") != locked["file"]:
                raise ValueError(f"frame {index}: invalid exported PNG path")
            png_path = manifest_path.parent / relative
            png = png_path.read_bytes()
            rebuilt = png_rgba(original["width"], original["height"], original["pixels"])
            if png != rebuilt or sha(png) != locked.get("sha256") or sha(png) != exported.get("sha256"):
                raise ValueError(f"frame {index}: PNG bytes differ from original source pixels")
            bgra = original["pixels"]
            rgba = bytearray(bgra)
            rgba[0::4], rgba[2::4] = bgra[2::4], bgra[0::4]
            with Image.open(png_path) as image:
                decoded = image.convert("RGBA")
                if decoded.size != EXPECTED_GEOMETRY[index] or decoded.tobytes() != rgba:
                    raise ValueError(f"frame {index}: decoded PNG pixels mismatch")
                alpha = decoded.getchannel("A")
                histogram = alpha.histogram()
                alpha_stats = {"transparent": histogram[0], "opaque": histogram[255], "partial": sum(histogram[1:255]), "bbox": list(alpha.getbbox()) if alpha.getbbox() else None}
            if sha(rgba) != locked.get("pixelSha256") or sha(bgra) != locked.get("bgraSha256") or locked.get("alpha") != alpha_stats:
                raise ValueError(f"frame {index}: pixel/alpha lock mismatch")
            source_offset = library.offsets[index]
            pixel_start = source_offset + library.image_header_size
            frames[str(index)] = {"index": index, "width": original["width"], "height": original["height"], "offsetX": original["offsetX"], "offsetY": original["offsetY"], "sourceOffset": source_offset,
                                  "sourceIndexedPixelSha256": sha(library.data[pixel_start:pixel_start + original["width"] * original["height"]]),
                                  "sourceIndexedOrientation": "bottom-up" if library.flip_y else "top-down", "png": str(png_path.relative_to(root)).replace("\\", "/"), "pngBytes": len(png), "sha256": sha(png), "rgbaSha256": sha(rgba), "bgraSha256": sha(bgra), "alpha": alpha_stats, "rebuiltPngByteEqual": True, "decodedPngPixelEqual": True}
    return {"schemaVersion": 1, "domain": "system-auth-native-assets", "finishedAt": datetime.now(timezone.utc).isoformat(),
            "assetValidationPassed": True, "complete": False, "nativeSameVersion": "unknown",
            "scope": "Original pinned WIL/WIX bytes, 16 deterministic PNG byte rebuilds/RGBA/alpha comparisons and safe proposed layout bounds. No native-client/browser interactive or visual comparison.",
            "sourceSelection": "explicit-data-dir" if explicit_data_dir else "active-asset-sources.roots.nationalData",
            "sources": source_checks, "sourceFrameCount": library.count,
            "sourcePalette": {"byteOffset": 56, "bytes": 1024, "sha256": sha(library.data[56:1080]), "transparentIndex": 0},
            "manifest": {"path": str(manifest_path.relative_to(root)).replace("\\", "/"), "bytes": len(manifest_data), "sha256": sha(manifest_data)},
            "contracts": [{"path": path, "sha256": sha((root / path).read_bytes())} for path in CONTRACTS],
            "references": reference_checks,
            "frames": frames, "checkedFrames": len(frames),
            "layoutChecks": {"canvas": [800, 600], "systemVariants": 3, "buttonCounts": {"horizontal": [1, 2, 3, 4], "vertical": [1, 2, 3, 4], "small": [1]}, "smallMultipleFallback": "horizontal", "authInputs": 4, "embeddedButtons": 2, "layoutProvenance": "reference_source plus explicitly proposed safe fitting choices"},
            "rejectedAdjacentPairs": [{"normal": 53, "rejectedPressed": 54, "normalGeometry": [128, 33], "rejectedGeometry": [296, 253]}, {"normal": 64, "rejectedPressed": 65, "normalGeometry": [16, 23], "rejectedGeometry": [800, 600]}],
            "evidenceKinds": ["native_pixels", "reference_source", "source_review"],
            "gaps": ["same-version native-client layout/state/interaction", "browser rendering and source image comparison", "native font rasterization", "independent hover/disabled/login-entry pressed-state evidence"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, help="Explicit original Data directory; source hashes still required")
    parser.add_argument("--report", type=Path, help="New asset-scope report path; no assets are written")
    args = parser.parse_args()
    try:
        report = audit(data_dir=args.data_dir)
    except (ValueError, OSError, KeyError, TypeError, IndexError) as error:
        report = {"schemaVersion": 1, "domain": "system-auth-native-assets", "assetValidationPassed": False, "complete": False, "error": str(error)}
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: report.get(key) for key in ("assetValidationPassed", "checkedFrames", "complete", "nativeSameVersion", "error")}, ensure_ascii=False))
    return 0 if report["assetValidationPassed"] else 1


if __name__ == "__main__":
    sys.exit(main())
