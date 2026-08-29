"""Deterministic cut-piece compositor for the 228103 Traditional Lace Up jersey.

This does not project a full garment photograph over a 3D mesh. It writes the
customer's front, back, and sleeve regions only into the observed printable
`main` mesh UV islands, leaving physical lace and hoop materials untouched.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps
from scipy.ndimage import binary_dilation, distance_transform_edt

SERVICE_PY = Path(__file__).resolve().parents[2] / "Caroma-Poc" / "3d-garment-retexture" / "py"
sys.path.insert(0, str(SERVICE_PY))
from retexture import _raster, flat_colour, islands, load_glb, preview, write_glb  # noqa: E402

LAYOUT_VERSION = "228103-traditional-lace-up-panel-v1"
# Physical player direction. The front photo's viewer-left sleeve is player-right.
PRIMARY_ISLANDS = {"front_body": 3, "back_body": 16, "left_sleeve": 8, "right_sleeve": 7}


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--glb", required=True)
    parser.add_argument("--front", required=True)
    parser.add_argument("--back")
    parser.add_argument("--out-glb", required=True)
    parser.add_argument("--out-atlas", required=True)
    parser.add_argument("--out-preview", required=True)
    parser.add_argument("--size", type=int, default=2048)
    parser.add_argument("--back-name", default="")
    parser.add_argument("--back-number", default="")
    parser.add_argument("--left-sleeve-mark", default="")
    parser.add_argument("--right-sleeve-mark", default="")
    return parser.parse_args()


def image_content(path: str) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    bounds = image.getchannel("A").getbbox()
    return image.crop(bounds).convert("RGB") if bounds else image.convert("RGB")


def crop_ratio(image: Image.Image, rect: tuple[float, float, float, float]) -> Image.Image:
    width, height = image.size
    x0, y0, x1, y1 = rect
    return image.crop((round(x0 * width), round(y0 * height), round(x1 * width), round(y1 * height)))


def base_colour(image: Image.Image) -> np.ndarray:
    pixels = np.asarray(image).reshape(-1, 3)
    blue = pixels[(pixels[:, 2] > pixels[:, 0] * 1.18) & (pixels[:, 2] > pixels[:, 1] * 1.05) & (pixels.max(1) < 235)]
    if len(blue) == 0:
        blue = pixels[(pixels.max(1) - pixels.min(1) > 24) & (pixels.max(1) < 235)]
    return np.median(blue, axis=0).astype(np.uint8) if len(blue) else np.array([10, 69, 132], dtype=np.uint8)


def apply_panel(
    atlas: np.ndarray,
    panel_mask: np.ndarray,
    source: Image.Image,
    base: np.ndarray,
    centering: tuple[float, float] = (0.5, 0.5),
    inset: float = 0.0,
) -> None:
    ys, xs = np.where(panel_mask)
    if not len(xs):
        raise ValueError("A required calibrated UV island was not found")
    left, top, right, bottom = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    panel_size = (right - left, bottom - top)
    if inset > 0:
        inner_size = (max(1, int(panel_size[0] * (1.0 - inset * 2))), max(1, int(panel_size[1] * (1.0 - inset * 2))))
        inner = ImageOps.fit(source, inner_size, Image.Resampling.LANCZOS, centering=centering)
        canvas = Image.new("RGB", panel_size, tuple(int(value) for value in base))
        canvas.paste(inner, ((panel_size[0] - inner.width) // 2, (panel_size[1] - inner.height) // 2))
        pixels = np.asarray(canvas)
    else:
        pixels = np.asarray(ImageOps.fit(source, panel_size, Image.Resampling.LANCZOS, centering=centering))
    local_mask = panel_mask[top:bottom, left:right]
    patch = atlas[top:bottom, left:right]
    patch[local_mask] = pixels[local_mask]
    distance = distance_transform_edt(panel_mask)
    seam = panel_mask & (distance < 2.0)
    if seam.any():
        weight = (distance[seam] / 2.0)[:, None]
        atlas[seam] = (atlas[seam] * weight + base * (1.0 - weight)).astype(np.uint8)


def draw_confirmed_text(texture: np.ndarray, panel_mask: np.ndarray, value: str, y_ratio: float, size_ratio: float) -> np.ndarray:
    """Add a confirmed value only inside the exact UV panel mask.

    This is intentionally a preview-only placement aid. The artist package
    retains the value and panel name for final typography/production review.
    """
    if not value:
        return texture
    ys, xs = np.where(panel_mask)
    if not len(xs):
        return texture
    left, top, right, bottom = xs.min(), ys.min(), xs.max(), ys.max()
    font_size = max(26, int((bottom - top) * size_ratio))
    font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", font_size)
    layer = Image.new("RGBA", (texture.shape[1], texture.shape[0]), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    x = (left + right) // 2
    y = int(top + (bottom - top) * y_ratio)
    draw.text((x, y), value, font=font, anchor="mm", fill="white", stroke_width=max(2, font_size // 18), stroke_fill="black")
    composite = np.asarray(Image.alpha_composite(Image.fromarray(texture).convert("RGBA"), layer).convert("RGB")).copy()
    composite[~panel_mask] = texture[~panel_mask]
    return composite


def paste_source_artwork(texture: np.ndarray, panel_mask: np.ndarray, source: Image.Image, y_ratio: float) -> np.ndarray:
    """Move exact customer raster artwork into a panel safe area without OCR."""
    ys, xs = np.where(panel_mask)
    if not len(xs):
        return texture
    left, top, right, bottom = xs.min(), ys.min(), xs.max(), ys.max()
    max_size = (max(1, int((right - left) * 0.48)), max(1, int((bottom - top) * 0.10)))
    overlay = ImageOps.contain(source, max_size, Image.Resampling.LANCZOS)
    x0 = int((left + right - overlay.width) / 2)
    y0 = int(top + (bottom - top) * y_ratio)
    result = texture.copy()
    source_pixels = np.asarray(overlay)
    light_ink = (source_pixels.min(axis=2) > 120) & ((source_pixels.max(axis=2) - source_pixels.min(axis=2)) < 65)
    outline = binary_dilation(light_ink, iterations=max(1, overlay.height // 28)) & ~light_ink
    target = result[y0:y0 + overlay.height, x0:x0 + overlay.width]
    local_mask = panel_mask[y0:y0 + overlay.height, x0:x0 + overlay.width]
    target[local_mask & outline] = (0, 0, 0)
    target[local_mask & light_ink] = source_pixels[local_mask & light_ink]
    return result


def main() -> None:
    args = arguments()
    _, meshes = load_glb(args.glb)
    mesh = meshes.get("228103")
    if mesh is None:
        raise ValueError("The selected GLB is not the verified 228103 printable mesh")
    size = max(512, min(args.size, 4096))
    labels = islands(mesh["V"], mesh["F"])
    points = np.stack([mesh["UV"][:, 0] * (size - 1), mesh["UV"][:, 1] * (size - 1)], axis=1)
    coverage, _, attrs = _raster(points, mesh["F"], (size, size), attr={"island": labels.reshape(-1, 1).astype(np.float32)})
    island = np.rint(attrs["island"][..., 0]).astype(int)

    front = image_content(args.front)
    back = image_content(args.back) if args.back else front
    base = base_colour(front)
    atlas = np.empty((size, size, 3), dtype=np.uint8)
    atlas[:] = base
    sources = {
        "front_body": crop_ratio(front, (0.22, 0.06, 0.78, 1.00)),
        "back_body": crop_ratio(back, (0.20, 0.06, 0.80, 1.00)),
        "right_sleeve": crop_ratio(front, (0.00, 0.10, 0.33, 1.00)),
        "left_sleeve": crop_ratio(front, (0.67, 0.10, 1.00, 1.00)),
    }
    for name, island_id in PRIMARY_ISLANDS.items():
        apply_panel(
            atlas,
            coverage & (island == island_id),
            sources[name],
            base,
            centering=(0.5, 0.30) if name == "back_body" else (0.5, 0.5),
            inset=0.07 if name == "front_body" else 0.0,
        )

    texture = atlas[::-1]
    reversed_islands = island[::-1]
    reversed_coverage = coverage[::-1]
    # The prepared customer back image's light-text component detector locates
    # the player-name row at x=.252-.739, y=.293-.398. Keep modest padding so
    # the original outline/letter spacing survives the move into the safe area.
    back_name_art = crop_ratio(back, (0.23, 0.275, 0.76, 0.415))
    texture = paste_source_artwork(
        texture,
        reversed_coverage & (reversed_islands == PRIMARY_ISLANDS["back_body"]),
        back_name_art,
        0.12,
    )
    texture = draw_confirmed_text(texture, reversed_coverage & (reversed_islands == PRIMARY_ISLANDS["back_body"]), args.back_name.upper(), 0.28, 0.10)
    texture = draw_confirmed_text(texture, reversed_coverage & (reversed_islands == PRIMARY_ISLANDS["back_body"]), args.back_number, 0.58, 0.28)
    texture = draw_confirmed_text(texture, reversed_coverage & (reversed_islands == PRIMARY_ISLANDS["left_sleeve"]), args.left_sleeve_mark, 0.45, 0.22)
    texture = draw_confirmed_text(texture, reversed_coverage & (reversed_islands == PRIMARY_ISLANDS["right_sleeve"]), args.right_sleeve_mark, 0.45, 0.22)
    atlas_path = Path(args.out_atlas)
    atlas_path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(texture).save(atlas_path)
    # The external front, back, and sleeves all live in `main`.  `reverse` is
    # only the inner collar/hem trim; preserve it along with the real laces and
    # hoops instead of putting customer print data onto the interior surface.
    texture_bytes = atlas_path.read_bytes()
    write_glb(args.glb, args.out_glb, texture_bytes, mat_name="main")
    extra_draws = [
        (other, None, flat_colour(other["geom"]))
        for key, other in meshes.items()
        if key != "228103"
    ]
    preview([(mesh, texture, None), *extra_draws], args.out_preview)
    print(json.dumps({"ok": True, "layoutVersion": LAYOUT_VERSION, "islands": PRIMARY_ISLANDS, "atlas": str(atlas_path), "glb": args.out_glb, "preview": args.out_preview, "secondaryColour": base.tolist()}))


if __name__ == "__main__":
    main()
