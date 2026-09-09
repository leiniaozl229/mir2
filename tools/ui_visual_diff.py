#!/usr/bin/env python3
"""Compare two UI PNGs in design coordinates and emit a diff artifact.

The tool deliberately compares the 800x600 game surface instead of a full
browser screenshot. It reports pixel error after an optional per-pixel mask and
can be used as a CI gate when a reference capture has been approved.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import struct
import zlib


DESIGN_SIZE = (800, 600)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def parse_rect(value: str) -> tuple[int, int, int, int]:
    """Parse an x,y,width,height mask rectangle."""
    try:
        x, y, width, height = (int(part.strip()) for part in value.split(","))
    except (TypeError, ValueError) as error:
        raise argparse.ArgumentTypeError("mask must be x,y,width,height") from error
    if width < 0 or height < 0:
        raise argparse.ArgumentTypeError("mask width and height must be non-negative")
    return x, y, width, height


def _paeth(left: int, above: int, upper_left: int) -> int:
    estimate = left + above - upper_left
    left_distance = abs(estimate - left)
    above_distance = abs(estimate - above)
    upper_left_distance = abs(estimate - upper_left)
    if left_distance <= above_distance and left_distance <= upper_left_distance:
        return left
    if above_distance <= upper_left_distance:
        return above
    return upper_left


def read_png(path: Path) -> tuple[int, int, bytes]:
    """Read an 8-bit, non-interlaced RGB/RGBA PNG without third-party code."""
    data = path.read_bytes()
    signature = b"\x89PNG\r\n\x1a\n"
    if not data.startswith(signature):
        raise ValueError(f"{path} is not a PNG")
    cursor = len(signature)
    width = height = bit_depth = color_type = interlace = None
    compressed = bytearray()
    while cursor + 12 <= len(data):
        length = struct.unpack_from(">I", data, cursor)[0]
        kind = data[cursor + 4 : cursor + 8]
        payload_start, payload_end = cursor + 8, cursor + 8 + length
        if payload_end + 4 > len(data):
            raise ValueError(f"truncated PNG chunk in {path}")
        payload = data[payload_start:payload_end]
        if kind == b"IHDR":
            if len(payload) != 13:
                raise ValueError("invalid PNG IHDR")
            width, height, bit_depth, color_type, compression, filter_method, interlace = struct.unpack(
                ">IIBBBBB", payload
            )
            if compression or filter_method or interlace:
                raise ValueError("PNG must use standard compression, filters and no interlace")
        elif kind == b"IDAT":
            compressed.extend(payload)
        elif kind == b"IEND":
            break
        cursor = payload_end + 4
    if width is None or height is None or bit_depth != 8 or color_type not in (2, 6):
        raise ValueError(f"unsupported PNG format in {path}")
    channels = 4 if color_type == 6 else 3
    stride = width * channels
    raw = zlib.decompress(bytes(compressed))
    expected = height * (stride + 1)
    if len(raw) != expected:
        raise ValueError(f"PNG pixel data length mismatch in {path}")
    pixels = bytearray(width * height * 4)
    previous = bytearray(stride)
    raw_cursor = 0
    for row in range(height):
        filter_type = raw[raw_cursor]
        raw_cursor += 1
        encoded = raw[raw_cursor : raw_cursor + stride]
        raw_cursor += stride
        decoded = bytearray(stride)
        for index, value in enumerate(encoded):
            left = decoded[index - channels] if index >= channels else 0
            above = previous[index]
            upper_left = previous[index - channels] if index >= channels else 0
            if filter_type == 0:
                predictor = 0
            elif filter_type == 1:
                predictor = left
            elif filter_type == 2:
                predictor = above
            elif filter_type == 3:
                predictor = (left + above) // 2
            elif filter_type == 4:
                predictor = _paeth(left, above, upper_left)
            else:
                raise ValueError(f"unsupported PNG filter {filter_type} in {path}")
            decoded[index] = (value + predictor) & 255
        destination = row * width * 4
        if channels == 4:
            pixels[destination : destination + width * 4] = decoded
        else:
            for pixel in range(width):
                source = pixel * 3
                pixels[destination + pixel * 4 : destination + pixel * 4 + 4] = bytes(
                    (*decoded[source : source + 3], 255)
                )
        previous = decoded
    return width, height, bytes(pixels)


def write_png(width: int, height: int, rgba: bytes) -> bytes:
    """Encode 8-bit RGBA pixels as a deterministic PNG."""
    if len(rgba) != width * height * 4:
        raise ValueError("RGBA byte count mismatch")
    rows = b"".join(b"\0" + rgba[row * width * 4 : (row + 1) * width * 4] for row in range(height))

    def chunk(kind: bytes, payload: bytes) -> bytes:
        return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(rows, 9))
        + chunk(b"IEND", b"")
    )


def compare_images(
    reference_path: Path,
    actual_path: Path,
    *,
    threshold: int = 0,
    masks: list[tuple[int, int, int, int]] | None = None,
    expected_size: tuple[int, int] = DESIGN_SIZE,
) -> tuple[dict, bytes]:
    """Return a JSON-safe report and encoded RGBA diff PNG bytes."""
    if not 0 <= threshold <= 255:
        raise ValueError("threshold must be between 0 and 255")
    masks = masks or []
    reference_width, reference_height, reference_pixels = read_png(reference_path)
    actual_width, actual_height, actual_pixels = read_png(actual_path)
    if (reference_width, reference_height) != expected_size or (actual_width, actual_height) != expected_size:
        raise ValueError(
            f"expected {expected_size[0]}x{expected_size[1]}, "
            f"got reference {reference_width}x{reference_height} and "
            f"actual {actual_width}x{actual_height}"
        )

    width, height = expected_size
    masked = bytearray(width * height)
    for x, y, mask_width, mask_height in masks:
        left, top = max(0, x), max(0, y)
        right, bottom = min(width, x + mask_width), min(height, y + mask_height)
        for row in range(top, bottom):
            start = row * width + left
            masked[start : row * width + right] = b"\x01" * max(0, right - left)

    diff_pixels = bytearray(width * height * 4)
    compared = 0
    changed = 0
    total_error = 0
    max_delta = 0
    for y in range(height):
        for x in range(width):
            index = y * width + x
            if masked[index]:
                continue
            compared += 1
            pixel_offset = index * 4
            before = reference_pixels[pixel_offset : pixel_offset + 4]
            after = actual_pixels[pixel_offset : pixel_offset + 4]
            delta = max(abs(left - right) for left, right in zip(before, after))
            max_delta = max(max_delta, delta)
            total_error += sum(abs(left - right) for left, right in zip(before, after))
            if delta > threshold:
                changed += 1
                intensity = min(255, max(48, delta * 3))
                diff_pixels[pixel_offset : pixel_offset + 4] = bytes((255, 48, 0, intensity))

    report = {
        "reference": str(reference_path),
        "actual": str(actual_path),
        "referenceSha256": _sha256(reference_path),
        "actualSha256": _sha256(actual_path),
        "width": width,
        "height": height,
        "threshold": threshold,
        "maskRectangles": [list(rect) for rect in masks],
        "comparedPixels": compared,
        "maskedPixels": width * height - compared,
        "changedPixels": changed,
        "changedRatio": changed / compared if compared else 0,
        "meanAbsoluteChannelError": total_error / (compared * 4) if compared else 0,
        "maxChannelDelta": max_delta,
    }
    return report, write_png(width, height, bytes(diff_pixels))


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reference", type=Path, required=True, help="approved 800x600 reference PNG")
    parser.add_argument("--actual", type=Path, required=True, help="current 800x600 PNG")
    parser.add_argument("--output-dir", type=Path, required=True, help="directory for diff.png and report.json")
    parser.add_argument("--threshold", type=int, default=0, help="per-channel delta ignored by the gate (0-255)")
    parser.add_argument("--mask", action="append", type=parse_rect, default=[], help="ignore x,y,width,height; repeatable")
    parser.add_argument("--max-changed-ratio", type=float, help="fail when changed ratio exceeds this value")
    parser.add_argument("--max-mean-error", type=float, help="fail when mean channel error exceeds this value")
    return parser


def main(argv=None) -> int:
    args = _build_parser().parse_args(argv)
    result = {"ok": False, "error": None}
    try:
        report, diff = compare_images(args.reference, args.actual, threshold=args.threshold, masks=args.mask)
        report["gates"] = {
            "maxChangedRatio": args.max_changed_ratio,
            "maxMeanAbsoluteChannelError": args.max_mean_error,
        }
        failures = []
        if args.max_changed_ratio is not None and report["changedRatio"] > args.max_changed_ratio:
            failures.append("changedRatio")
        if args.max_mean_error is not None and report["meanAbsoluteChannelError"] > args.max_mean_error:
            failures.append("meanAbsoluteChannelError")
        report["failedGates"] = failures
        report["ok"] = not failures
        args.output_dir.mkdir(parents=True, exist_ok=True)
        (args.output_dir / "diff.png").write_bytes(diff)
        (args.output_dir / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
        result = report
    except (OSError, ValueError) as error:
        result["error"] = str(error)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result.get("ok") else 2


if __name__ == "__main__":
    raise SystemExit(main())
