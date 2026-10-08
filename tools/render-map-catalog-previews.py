#!/usr/bin/env python3
"""Render offline, source-bound viewport previews for the exported map catalog.

This follows the production map view's grid, layer order, tile placeholder rule,
object-area mapping, and map-hash candidate bindings. It is a visual audit aid,
not a replacement for browser/GPU or original-client screenshot comparison.
"""
import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import re
import struct
import sys

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
CELL = struct.Struct("<HHHBBBBBB")
MAP_LIBRARIES = ("Tiles", "SmTiles", "Objects", "Objects2", "Objects3",
                 "Objects4", "Objects5", "Objects6", "Objects7")
OBJECT_CANDIDATES = ("Objects8", "Objects9", "Objects10", "Objects13", "Objects14")
AREA_LIBRARY = {0: "Objects", 1: "Objects2", 2: "Objects3", 3: "Objects4",
                4: "Objects5", 5: "Objects6", 6: "Objects7", 7: "Objects8",
                8: "Objects9", 9: "Objects10", 12: "Objects13", 13: "Objects14"}


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def frame_path(namespace, frame):
    prefix = {
        "/libraries/": ROOT / "assets/web/libraries",
        "/libraries/reference-ga0/": ROOT / "assets/web/libraries/reference-ga0",
        "/libraries/reference-map-candidates/": ROOT / "assets/web/libraries/reference-map-candidates",
    }
    for key, base in prefix.items():
        if namespace.startswith(key):
            suffix = namespace[len(key):]
            return base / suffix / frame["file"] if key == "/libraries/" else base / suffix / frame["file"]
    return None


class Catalog:
    def __init__(self):
        self.native = {name: read_json(ROOT / f"assets/web/libraries/{name}/library.json")
                       for name in MAP_LIBRARIES}
        self.native_root = ROOT / "assets/web/libraries"
        self.map_candidate_contract = read_json(ROOT / "content/classic-176/map-tile-candidates.json")
        self.object_candidate_contract = read_json(ROOT / "content/classic-176/map-object-bank-candidates.json")
        self.ga0_contract = read_json(ROOT / "content/classic-176/map-asset-bindings.json")
        self.candidates = {}
        self.tile_bindings = defaultdict(set)
        for binding in self.map_candidate_contract.get("bindings", []):
            self.tile_bindings[(binding["mapId"], binding["mapSourceSha256"])].update(binding["indices"])
        self.object_bindings = defaultdict(set)
        for binding in self.object_candidate_contract.get("bindings", []):
            self.object_bindings[(binding["mapId"], binding["mapSourceSha256"], binding["library"])].update(binding["indices"])
        for name in ("Tiles", *OBJECT_CANDIDATES):
            path = ROOT / f"assets/web/libraries/reference-map-candidates/{name}/library.json"
            if path.is_file():
                self.candidates[f"/libraries/reference-map-candidates/{name}"] = read_json(path)
        ga0_namespace = self.ga0_contract.get("candidate", {}).get("namespace")
        if not ga0_namespace:
            ga0_namespace = "/libraries/reference-ga0/Tiles"
        ga0_path = ROOT / "assets/web/libraries/reference-ga0/Tiles/library.json"
        if ga0_path.is_file():
            self.candidates[ga0_namespace] = read_json(ga0_path)
        self.ga0_binding = next((b for b in self.ga0_contract.get("bindings", [])
                                 if b.get("status") == "enabled"), None)
        self.image_cache = {}

    def image(self, namespace, frame):
        key = (namespace, frame.get("file"))
        if key not in self.image_cache:
            path = frame_path(namespace, frame)
            if not path or not path.is_file():
                self.image_cache[key] = None
            else:
                with Image.open(path) as source:
                    self.image_cache[key] = source.convert("RGBA")
        return self.image_cache[key]

    @staticmethod
    def real_frame(library, index):
        if not library or index in library.get("empty", []) or index in library.get("missing", []):
            return None
        frame = library.get("frames", {}).get(str(index))
        return frame if frame and frame.get("width", 0) > 0 and frame.get("height", 0) > 0 else None

    def resolve_tile(self, map_id, map_hash, index):
        native = self.native["Tiles"]
        frame = self.real_frame(native, index)
        if frame and (frame["width"] != 1 or frame["height"] != 1):
            return "/libraries/Tiles", frame, "native"
        tile_binding = self.tile_bindings.get((map_id, map_hash), set())
        ga0 = self.ga0_binding
        candidate_namespace = None
        selected = False
        if index in tile_binding:
            candidate_namespace = "/libraries/reference-map-candidates/Tiles"
            selected = True
        elif (ga0 and ga0.get("mapId") == map_id and ga0.get("mapSourceSha256") == map_hash
              and index in ga0.get("indices", [])):
            candidate_namespace = ga0.get("namespace", "/libraries/reference-ga0/Tiles")
            selected = True
        if selected:
            candidate = self.candidates.get(candidate_namespace, {})
            replacement = self.real_frame(candidate, index)
            if replacement:
                return candidate_namespace, replacement, "candidate"
            if index in candidate.get("empty", []):
                return None, None, "empty"
            return None, None, "unresolved"
        if frame:
            return "/libraries/Tiles", frame, "native-tiny"
        if index >= native.get("sourceFrameCount", 0):
            return None, None, "reference-nil"
        return None, None, "unresolved"

    def resolve(self, map_id, map_hash, layer, index, area=0):
        if layer == 0:
            return self.resolve_tile(map_id, map_hash, index)
        if layer == 1:
            library = self.native["SmTiles"]
            frame = self.real_frame(library, index)
            if frame:
                return "/libraries/SmTiles", frame, "native"
            if index >= library.get("sourceFrameCount", 0):
                return None, None, "reference-nil"
            return None, None, "unresolved"

        name = AREA_LIBRARY.get(area, "Objects" if area > 14 else None)
        if not name:
            return None, None, "unsupported-area"
        if name in OBJECT_CANDIDATES:
            if index not in self.object_bindings.get((map_id, map_hash, name), set()):
                return None, None, "unresolved"
            namespace = f"/libraries/reference-map-candidates/{name}"
            candidate = self.candidates.get(namespace, {})
            frame = self.real_frame(candidate, index)
            if frame:
                return namespace, frame, "candidate"
            return (None, None, "empty") if index in candidate.get("empty", []) else (None, None, "unresolved")

        library = self.native.get(name)
        if not library:
            return None, None, "unresolved"
        frame = self.real_frame(library, index)
        if frame:
            return f"/libraries/{name}", frame, "native"
        if index >= library.get("sourceFrameCount", 0):
            return None, None, "reference-nil"
        return None, None, "unresolved"


def paste_clipped(target, source, x, y):
    left, top = max(0, x), max(0, y)
    right, bottom = min(target.width, x + source.width), min(target.height, y + source.height)
    if left >= right or top >= bottom:
        return
    crop = source.crop((left - x, top - y, right - x, bottom - y))
    target.alpha_composite(crop, (left, top))


def render_map(catalog, map_dir, center=None):
    manifest_path = map_dir / "map.json"
    manifest_bytes = manifest_path.read_bytes()
    world = json.loads(manifest_bytes)
    map_id, map_hash = world["id"], world["sourceSha256"]
    width, height = world["width"], world["height"]
    cx, cy = center or (width // 2, height // 2)
    cx, cy = max(0, min(width - 1, round(cx))), max(0, min(height - 1, round(cy)))
    left, right = max(0, cx - 12), min(width - 1, cx + 12)
    top, bottom = max(0, cy - 14), min(height - 1, cy + 24)
    canvas_x, canvas_y = 400 - cx * 48, 300 - cy * 32

    cells = {}
    missing_chunks = []
    for chunk in world.get("chunks", []):
        if (chunk["x"] > right or chunk["y"] > bottom or chunk["x"] + chunk["width"] <= left
                or chunk["y"] + chunk["height"] <= top):
            continue
        chunk_path = map_dir / chunk["file"]
        try:
            payload = chunk_path.read_bytes()
        except OSError:
            missing_chunks.append(chunk["file"])
            continue
        if (len(payload) != chunk["width"] * chunk["height"] * CELL.size
                or sha256(payload) != chunk["sha256"]):
            missing_chunks.append(chunk["file"])
            continue
        x0, x1 = max(left, chunk["x"]), min(right, chunk["x"] + chunk["width"] - 1)
        y0, y1 = max(top, chunk["y"]), min(bottom, chunk["y"] + chunk["height"] - 1)
        for x in range(x0, x1 + 1):
            lx = x - chunk["x"]
            for y in range(y0, y1 + 1):
                ly = y - chunk["y"]
                offset = (lx * chunk["height"] + ly) * CELL.size
                cells[(x, y)] = CELL.unpack_from(payload, offset)

    background = Image.new("RGBA", (800, 600), (0, 0, 0, 0))
    middle = Image.new("RGBA", (800, 600), (0, 0, 0, 0))
    flat = Image.new("RGBA", (800, 600), (0, 0, 0, 0))
    depth = Image.new("RGBA", (800, 600), (0, 0, 0, 0))
    objects = []
    stats = Counter()
    tiny_indices = set()
    unresolved_samples = []

    def draw_layer(target, x, y, layer, index, area=0, animation=0):
        namespace, frame, result = catalog.resolve(map_id, map_hash, layer, index, area)
        stats[result] += 1
        if result == "native-tiny" and layer == 0:
            tiny_indices.add(index)
            stats["tinyBackgroundRefs"] += 1
        if not frame or not namespace:
            if result in ("unresolved", "unsupported-area") and len(unresolved_samples) < 100:
                unresolved_samples.append({"x": x, "y": y, "layer": layer, "index": index,
                                          "area": area, "result": result})
            return
        image = catalog.image(namespace, frame)
        if image is None:
            stats["missingPng"] += 1
            if len(unresolved_samples) < 100:
                unresolved_samples.append({"x": x, "y": y, "layer": layer, "index": index,
                                          "area": area, "result": "missing-png"})
            return
        px, py = canvas_x + x * 48, canvas_y + y * 32
        floor_tile = layer < 2 or (frame["width"] == 48 and frame["height"] == 32)
        draw_y = py if floor_tile else py + 32 - frame["height"]
        if layer == 2 and animation & 128 and 2723 <= index <= 2732:
            px += frame.get("offsetX", 0)
            draw_y += frame.get("offsetY", 0)
        if layer == 0:
            target_layer = background
        elif layer == 1:
            target_layer = middle
        elif floor_tile:
            target_layer = flat
        else:
            target_layer = None
        if target_layer is not None:
            paste_clipped(target_layer, image, px, draw_y)
        else:
            objects.append((y * 10000 + x, image, px, draw_y))
        stats["drawn"] += 1
        count = max(1, animation & 127) if layer == 2 else 1
        for extra in range(1, count):
            _, next_frame, next_result = catalog.resolve(map_id, map_hash, layer, index + extra, area)
            stats[f"animation_{next_result}"] += 1

    # Same visible grid and painter order as map-view.ts. Background is only on even cells.
    for y in range(top, bottom + 1):
        for x in range(left, right + 1):
            cell = cells.get((x, y))
            if not cell:
                continue
            px0, py0 = canvas_x + x * 48, canvas_y + y * 32
            for layer in range(3):
                if layer == 0 and (x % 2 or y % 2):
                    continue
                raw = cell[layer] & 0x7fff
                if not raw:
                    continue
                index = raw - 1
                area = cell[7]
                animation = cell[5] if layer == 2 else 0
                draw_layer(None, x, y, layer, index, area, animation)

    for _, image, x, y in sorted(objects, key=lambda item: item[0]):
        paste_clipped(depth, image, x, y)
    image = Image.new("RGBA", (800, 600), (0, 0, 0, 255))
    for layer_image in (background, middle, flat, depth):
        image.alpha_composite(layer_image)
    stats["missingChunks"] = len(missing_chunks)
    return image, {"id": map_id, "sourceSha256": map_hash, "width": width, "height": height,
                   "center": [cx, cy], "viewport": [left, top, right, bottom],
                   "stats": dict(stats), "uniqueTinyBackgroundIndices": sorted(tiny_indices),
                   "missingChunks": missing_chunks, "unresolvedSamples": unresolved_samples}


def read_center_sources(map_dirs):
    """Prefer authored world-guide routes, then server spawns and generated starts."""
    guide = defaultdict(Counter)
    for path in (ROOT / "content/classic-176/p0").glob("*.txt"):
        text = path.read_text(encoding="utf-8", errors="replace")
        for match in re.finditer(r"(?i)\bMAPMOVE\s+([A-Za-z0-9_-]+)\s+(\d+)\s+(\d+)", text):
            guide[match.group(1).casefold()][(int(match.group(2)), int(match.group(3)))] += 1

    spawns = defaultdict(Counter)
    mongen = ROOT / "vendor/mirserver-data/Mir200/Envir/MonGen.txt"
    if mongen.is_file():
        text = mongen.read_bytes().decode("gbk", errors="replace")
        for line in text.splitlines():
            fields = re.split(r"\s+", line.strip())
            if len(fields) >= 3 and fields[1].isdigit() and fields[2].isdigit():
                spawns[fields[0].casefold()][(int(fields[1]), int(fields[2]))] += 1

    generated = {}
    extension_path = ROOT / "content/classic-176/map-server-extensions.json"
    if extension_path.is_file():
        extension = read_json(extension_path)
        for item in extension.get("maps", []):
            start = item.get("generatedRoute", {}).get("start")
            if isinstance(start, list) and len(start) == 2:
                generated[item["id"].casefold()] = (int(start[0]), int(start[1]))

    centers = {}
    for map_dir in map_dirs:
        key = map_dir.name.casefold()
        if guide.get(key):
            centers[key] = (*guide[key].most_common(1)[0][0], "world-guide")
        elif spawns.get(key):
            centers[key] = (*spawns[key].most_common(1)[0][0], "MonGen")
        elif key in generated:
            centers[key] = (*generated[key], "generated-route")
    return centers


def densest_ground_center(catalog, map_dir):
    """Find a walkable viewport with the greatest amount of visible native ground."""
    world = read_json(map_dir / "map.json")
    map_id, map_hash = world["id"], world["sourceSha256"]
    width, height = world["width"], world["height"]
    ground = np.zeros((width, height), dtype=np.float32)
    walkable = np.zeros((width, height), dtype=np.uint8)
    tile_weight_cache = {}
    missing = 0
    for chunk in world.get("chunks", []):
        path = map_dir / chunk["file"]
        try:
            payload = path.read_bytes()
        except OSError:
            missing += 1
            continue
        if len(payload) != chunk["width"] * chunk["height"] * CELL.size or sha256(payload) != chunk["sha256"]:
            missing += 1
            continue
        raw = np.frombuffer(payload, dtype=np.dtype([
            ("background", "<u2"), ("middle", "<u2"), ("object", "<u2"), ("rest", "V6")
        ])).reshape((chunk["width"], chunk["height"]))
        background = raw["background"]
        x, y = chunk["x"], chunk["y"]
        usable = np.zeros(background.shape, dtype=np.float32)
        references = np.unique(background & 0x7fff)
        for reference in references:
            if not reference:
                continue
            if reference not in tile_weight_cache:
                namespace, frame, _ = catalog.resolve_tile(map_id, map_hash, int(reference) - 1)
                weight = 0.0
                if frame and namespace and frame["width"] > 1 and frame["height"] > 1:
                    image = catalog.image(namespace, frame)
                    if image is not None:
                        pixels = np.asarray(image, dtype=np.uint8)
                        visible = pixels[:, :, 3] > 0
                        if visible.any():
                            rgb = pixels[:, :, :3][visible].astype(np.float32)
                            brightness = float(rgb.mean())
                            variation = float(rgb.std())
                            # A low-color black placeholder must not outrank real ground.
                            weight = max(0.0, min(1.0, (brightness - 8.0) / 48.0))
                            weight *= 0.5 + 0.5 * min(1.0, variation / 24.0)
                tile_weight_cache[reference] = weight
            usable[(background & 0x7fff) == reference] = tile_weight_cache[reference]
        # Background tiles are placed on even/even cells in map-view.ts.
        usable[1::2, :] = 0
        usable[:, 1::2] = 0
        ground[x:x + chunk["width"], y:y + chunk["height"]] = usable
        collision = ((raw["background"] | raw["object"]) & 0x8000) != 0
        walkable[x:x + chunk["width"], y:y + chunk["height"]] = ~collision

    # Prefix sums make the 25x39 production viewport score cheap even for 1000x1000 maps.
    summed = np.pad(ground.astype(np.uint32), ((1, 0), (1, 0))).cumsum(0).cumsum(1)
    if width < 25 or height < 39:
        return (width // 2, height // 2), missing
    x0 = np.arange(12, width - 12, 4, dtype=np.int32)
    y0 = np.arange(14, height - 24, 4, dtype=np.int32)
    x1, x2 = x0 - 12, x0 + 12
    y1, y2 = y0 - 14, y0 + 24
    scores = (summed[x2[:, None] + 1, y2[None, :] + 1]
              - summed[x1[:, None], y2[None, :] + 1]
              - summed[x2[:, None] + 1, y1[None, :]]
              + summed[x1[:, None], y1[None, :]]).astype(np.float32)
    center_walkable = walkable[x0[:, None], y0[None, :]] != 0
    scores[~center_walkable] = -1
    if scores.max() <= 0:
        return (width // 2, height // 2), missing
    best = np.argwhere(scores == scores.max())[0]
    return (int(x0[best[0]]), int(y0[best[1]])), missing


def render_catalog(args):
    catalog = Catalog()
    map_root = ROOT / "assets/web/maps"
    map_dirs = sorted((p for p in map_root.iterdir() if p.is_dir() and (p / "map.json").is_file()),
                      key=lambda p: p.name)
    if args.map_id:
        map_dirs = [map_root / name for name in args.map_id]
    center_sources = read_center_sources(map_dirs)
    output = Path(args.output) if args.output else ROOT / ".runtime/reports/map-catalog-previews-2026-10-02"
    if not output.is_absolute():
        output = ROOT / output
    output.mkdir(parents=True, exist_ok=True)
    records = []
    thumbs = []
    for map_dir in map_dirs:
        world = read_json(map_dir / "map.json")
        key = map_dir.name.casefold()
        if args.center:
            center, center_source = tuple(args.center), "manual"
        elif key in center_sources:
            center, center_source = center_sources[key][:2], center_sources[key][2]
        else:
            center, _ = densest_ground_center(catalog, map_dir)
            center_source = "densest-ground-window"
        preview, record = render_map(catalog, map_dir, center)
        filename = f"map-{map_dir.name}-{record['center'][0]}-{record['center'][1]}.png"
        preview.save(output / filename, optimize=True)
        thumb = preview.resize((160, 120), Image.Resampling.LANCZOS)
        thumbs.append((map_dir.name, thumb, record["stats"].get("unresolved", 0),
                       record["stats"].get("native-tiny", 0), record["stats"].get("missingPng", 0)))
        record["preview"] = filename
        record["centerSource"] = center_source
        records.append(record)
        print(f"{map_dir.name}: center={record['center']} drawn={record['stats'].get('drawn', 0)} "
              f"unresolved={record['stats'].get('unresolved', 0)} "
              f"tiny-ground={record['stats'].get('native-tiny', 0)}")

    per_page = 30
    columns, rows = 6, 5
    cell_w, cell_h = 164, 140
    font = ImageDraw.Draw(Image.new("RGB", (1, 1))).font
    for page_start in range(0, len(thumbs), per_page):
        page = Image.new("RGB", (columns * cell_w, rows * cell_h), (24, 22, 20))
        draw = ImageDraw.Draw(page)
        for offset, (name, thumb, unresolved, tiny, missing_png) in enumerate(thumbs[page_start:page_start + per_page]):
            x, y = (offset % columns) * cell_w, (offset // columns) * cell_h
            page.paste(thumb.convert("RGB"), (x + 2, y + 18))
            label = f"{name}  U{unresolved} T{tiny} P{missing_png}"
            draw.text((x + 3, y + 2), label[:30], fill=(245, 235, 215), font=font)
        page.save(output / f"catalog-{page_start // per_page + 1:02d}.jpg", quality=88)

    report = {"schemaVersion": 1, "id": "map-catalog-preview-audit-2026-10-02",
              "status": "offline-preview", "mapCount": len(records),
              "renderModel": "map-view grid/layer order and exact asset resolver; no animation timing, GPU, browser, or native comparison",
              "maps": records}
    (output / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Rendered {len(records)} maps into {output}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--map-id", action="append", help="Render one map ID; may be repeated.")
    parser.add_argument("--center", nargs=2, type=int, metavar=("X", "Y"), help="Center for selected maps.")
    parser.add_argument("--output", help="Output directory; defaults to .runtime/reports/map-catalog-previews-2026-10-02.")
    args = parser.parse_args()
    render_catalog(args)


if __name__ == "__main__":
    main()
