#!/usr/bin/env python3
"""Create artist-reference PNG assets from normalized multi-view detections.

The semantic region labels and normalized boxes are supplied by the vision read.
This script performs deterministic geometry only: validates coordinates, crops
the original upload, preserves existing alpha, and applies a conservative
edge-background alpha estimate to discrete logo/text/number regions. The result
is a review asset, not a vector or production-ready separation.
"""

from __future__ import annotations

import argparse
import json
import math
import re
from pathlib import Path
from typing import Any

from PIL import Image, ImageFilter, ImageStat


DISCRETE_TYPES = {"logo", "wordmark", "player-name", "player-number", "sleeve-mark"}


def clamp(value: Any, low: float = 0.0, high: float = 1.0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return low
    if not math.isfinite(number):
        return low
    return max(low, min(high, number))


def safe_name(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_-]+", "-", value).strip("-").lower()
    return cleaned[:80] or "region"


def median_edge_color(image: Image.Image) -> tuple[int, int, int]:
    rgb = image.convert("RGB")
    width, height = rgb.size
    edge: list[tuple[int, int, int]] = []
    edge.extend(rgb.crop((0, 0, width, 1)).getdata())
    edge.extend(rgb.crop((0, max(0, height - 1), width, height)).getdata())
    edge.extend(rgb.crop((0, 0, 1, height)).getdata())
    edge.extend(rgb.crop((max(0, width - 1), 0, width, height)).getdata())
    edge.sort(key=lambda color: sum(color))
    return edge[len(edge) // 2] if edge else (255, 255, 255)


def conservative_alpha(crop: Image.Image) -> tuple[Image.Image, str]:
    rgba = crop.convert("RGBA")
    if rgba.getextrema()[3][0] < 255:
        return rgba, "Source alpha preserved."

    background = median_edge_color(rgba)
    rgb = rgba.convert("RGB")
    # Estimate edge variation. A noisy edge means the region overlaps a pattern,
    # so do not pretend a clean transparent separation was achieved.
    edge_sample = Image.new("RGB", (rgb.width * 2 + rgb.height * 2, 1))
    samples = []
    samples.extend(rgb.crop((0, 0, rgb.width, 1)).getdata())
    samples.extend(rgb.crop((0, max(0, rgb.height - 1), rgb.width, rgb.height)).getdata())
    samples.extend(rgb.crop((0, 0, 1, rgb.height)).getdata())
    samples.extend(rgb.crop((max(0, rgb.width - 1), 0, rgb.width, rgb.height)).getdata())
    edge_sample.putdata(samples[: edge_sample.width])
    variation = sum(ImageStat.Stat(edge_sample).stddev) / 3
    if variation > 34:
        return rgba, "Reference crop retained; surrounding artwork is too varied for reliable automatic transparency."

    threshold = max(24.0, min(62.0, variation * 2.2 + 20.0))
    alpha = Image.new("L", rgb.size, 0)
    alpha_pixels = []
    for red, green, blue in rgb.getdata():
        distance = math.sqrt(
            (red - background[0]) ** 2
            + (green - background[1]) ** 2
            + (blue - background[2]) ** 2
        )
        alpha_pixels.append(int(max(0.0, min(255.0, (distance - threshold) * 7.0))))
    alpha.putdata(alpha_pixels)
    alpha = alpha.filter(ImageFilter.MedianFilter(3)).filter(ImageFilter.GaussianBlur(0.6))
    rgba.putalpha(alpha)
    return rgba, "Conservative edge-background transparency applied; artist validation required."


def crop_region(image: Image.Image, box: dict[str, Any]) -> tuple[Image.Image, dict[str, int]]:
    width, height = image.size
    x = clamp(box.get("x"))
    y = clamp(box.get("y"))
    region_width = min(clamp(box.get("width")), 1.0 - x)
    region_height = min(clamp(box.get("height")), 1.0 - y)
    if region_width <= 0 or region_height <= 0:
        raise ValueError("Region has an empty normalized box")

    left = max(0, int(round(x * width)))
    top = max(0, int(round(y * height)))
    right = min(width, max(left + 1, int(round((x + region_width) * width))))
    bottom = min(height, max(top + 1, int(round((y + region_height) * height))))
    pad_x = max(2, int((right - left) * 0.035))
    pad_y = max(2, int((bottom - top) * 0.035))
    pixel_box = {
        "left": max(0, left - pad_x),
        "top": max(0, top - pad_y),
        "right": min(width, right + pad_x),
        "bottom": min(height, bottom + pad_y),
    }
    return image.crop((pixel_box["left"], pixel_box["top"], pixel_box["right"], pixel_box["bottom"])), pixel_box


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()

    manifest_path = Path(args.manifest).resolve()
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    payload = json.loads(manifest_path.read_text())
    view_paths = {str(key): Path(value).resolve() for key, value in payload.get("views", {}).items()}
    images = {view: Image.open(path).convert("RGBA") for view, path in view_paths.items()}

    outputs = []
    for index, region in enumerate(payload.get("regions", []), start=1):
        view = str(region.get("view", ""))
        if view not in images:
            continue
        region_id = safe_name(str(region.get("id") or f"{view}-{index}"))
        region_type = str(region.get("type") or "other")
        try:
            crop, pixel_box = crop_region(images[view], region.get("box") or {})
        except ValueError:
            continue
        if region_type in DISCRETE_TYPES:
            result, note = conservative_alpha(crop)
        else:
            result, note = crop.convert("RGBA"), "Reference crop retained with full local artwork context."
        filename = f"{index:02d}-{region_id}.png"
        result.save(output_dir / filename, format="PNG", optimize=True)
        outputs.append({
            "id": region.get("id"),
            "filename": filename,
            "width": result.width,
            "height": result.height,
            "pixelBox": pixel_box,
            "note": note,
        })

    print(json.dumps({"ok": True, "assets": outputs}, separators=(",", ":")))


if __name__ == "__main__":
    main()
