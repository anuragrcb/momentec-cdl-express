"""Create a labelled contact sheet of each 228103 main-mesh UV island in five views."""
from pathlib import Path
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
SERVICE_PY = ROOT / "Caroma-Poc" / "3d-garment-retexture" / "py"
sys.path.insert(0, str(SERVICE_PY))
from retexture import _raster, islands, load_glb, preview  # noqa: E402

sku = "228103"
glb = ROOT / "momentec-cdl-express" / "assets" / "augusta-live" / "hockey-3d" / sku / f"{sku}.glb"
out = ROOT / "momentec-cdl-express" / ".diagnostics" / "228103-island-contact-sheet.png"
_, meshes = load_glb(glb)
mesh = meshes[sku]
labels = islands(mesh["V"], mesh["F"])
size = 384
points = np.stack([mesh["UV"][:, 0] * (size - 1), mesh["UV"][:, 1] * (size - 1)], axis=1)
coverage, _, attrs = _raster(points, mesh["F"], (size, size), attr={"island": labels.reshape(-1, 1).astype(np.float32)})
pixels = np.rint(attrs["island"][..., 0]).astype(int)
font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 22)
tiles = []
for island_id in range(labels.max() + 1):
    texture = np.full((size, size, 3), 230, dtype=np.uint8)
    texture[coverage & (pixels == island_id)] = (235, 42, 42)
    tile_path = out.parent / f".228103-island-{island_id}.png"
    preview([(mesh, texture[::-1], None)], tile_path, size=(160, 200))
    tile = Image.open(tile_path).convert("RGB")
    ImageDraw.Draw(tile).rectangle((0, 0, 92, 30), fill=(0, 0, 0))
    ImageDraw.Draw(tile).text((8, 5), f"Island {island_id}", fill=(255, 255, 255), font=font)
    tiles.append(tile)
columns = 5
rows = (len(tiles) + columns - 1) // columns
sheet = Image.new("RGB", (columns * 160, rows * 200), (255, 255, 255))
for index, tile in enumerate(tiles):
    sheet.paste(tile, ((index % columns) * 160, (index // columns) * 200))
sheet.save(out)
print(out)
