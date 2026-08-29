"""Render a diagnostic GLB with a different color for every SKU UV island.

Run with the sibling retexturing service's virtual environment:
  ../Caroma-Poc/3d-garment-retexture/.venv/bin/python tools/render-228108-island-map.py 228103

This is a calibration artifact only. It prevents a human-readable SVG label or
a raw centroid guess from being used as evidence that a UV island is a sleeve.
"""

from pathlib import Path
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
SERVICE_PY = ROOT / "Caroma-Poc" / "3d-garment-retexture" / "py"
sys.path.insert(0, str(SERVICE_PY))

from retexture import _raster, islands, load_glb, preview, write_glb  # noqa: E402

SKU = sys.argv[1] if len(sys.argv) > 1 else "228108"
GLB = ROOT / "momentec-cdl-express" / "assets" / "augusta-live" / "hockey-3d" / SKU / f"{SKU}.glb"
OUT_DIR = ROOT / "momentec-cdl-express" / ".diagnostics"
OUT_DIR.mkdir(exist_ok=True)
OUT_GLB = OUT_DIR / f"{SKU}-uv-islands.glb"
OUT_PREVIEW = OUT_DIR / f"{SKU}-uv-islands.preview.png"

PALETTE = np.array([
    [228, 26, 28], [55, 126, 184], [77, 175, 74], [152, 78, 163],
    [255, 127, 0], [255, 255, 51], [166, 86, 40], [247, 129, 191],
    [153, 153, 153], [0, 191, 196], [255, 105, 180],
], dtype=np.uint8)

scene, meshes = load_glb(str(GLB))
mesh = meshes[SKU]
size = 2048
labels = islands(mesh["V"], mesh["F"])
points = np.stack([mesh["UV"][:, 0] * (size - 1), mesh["UV"][:, 1] * (size - 1)], 1)
coverage, _, attrs = _raster(
    points,
    mesh["F"],
    (size, size),
    attr={"island": labels.reshape(-1, 1).astype(np.float32)},
)
atlas = np.full((size, size, 3), 245, dtype=np.uint8)
label_pixels = np.round(attrs["island"][..., 0]).astype(int)
atlas[coverage] = PALETTE[label_pixels[coverage] % len(PALETTE)]
labelled_atlas = Image.fromarray(atlas)
draw = ImageDraw.Draw(labelled_atlas)
font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 42)
for island_id in range(labels.max() + 1):
    ys, xs = np.where(coverage & (label_pixels == island_id))
    if len(xs) < 1500:
        continue
    x, y = int(np.median(xs)), int(np.median(ys))
    bbox = draw.textbbox((x, y), str(island_id), font=font, anchor="mm", stroke_width=3)
    draw.rectangle(bbox, fill=(255, 255, 255))
    draw.text((x, y), str(island_id), fill=(0, 0, 0), font=font, anchor="mm", stroke_width=1, stroke_fill=(255, 255, 255))
atlas = np.asarray(labelled_atlas)
atlas_path = OUT_DIR / f"{SKU}-uv-islands.png"
Image.fromarray(atlas[::-1]).save(atlas_path)
write_glb(str(GLB), str(OUT_GLB), atlas_path.read_bytes(), mat_name="main")
preview([(mesh, atlas[::-1], None)], OUT_PREVIEW)
print(f"islands={labels.max() + 1}")
print(f"atlas={atlas_path}")
print(f"glb={OUT_GLB}")
print(f"preview={OUT_PREVIEW}")
