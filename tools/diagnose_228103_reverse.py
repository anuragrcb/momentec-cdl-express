"""Render the 228103 materials in distinct colours to locate the real rear surface."""
from pathlib import Path
import sys

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SERVICE_PY = ROOT / "Caroma-Poc" / "3d-garment-retexture" / "py"
sys.path.insert(0, str(SERVICE_PY))
from retexture import _raster, load_glb, preview  # noqa: E402

sku = "228103"
glb = ROOT / "momentec-cdl-express" / "assets" / "augusta-live" / "hockey-3d" / sku / f"{sku}.glb"
out = ROOT / "momentec-cdl-express" / ".diagnostics" / "228103-reverse-material.preview.png"
_, meshes = load_glb(glb)
size = 2048
reverse = meshes["228103_3"]
points = np.stack([reverse["UV"][:, 0] * (size - 1), reverse["UV"][:, 1] * (size - 1)], axis=1)
mask, _, _ = _raster(points, reverse["F"], (size, size))
texture = np.full((size, size, 3), (255, 69, 0), dtype=np.uint8)
texture[~mask] = (255, 255, 255)
preview([
    (meshes["228103"], None, np.array([25, 100, 180], dtype=np.uint8)),
    (meshes["228103_1"], None, np.array([240, 240, 240], dtype=np.uint8)),
    (meshes["228103_2"], None, np.array([30, 30, 30], dtype=np.uint8)),
    (reverse, texture[::-1], None),
], out)
print(out)
