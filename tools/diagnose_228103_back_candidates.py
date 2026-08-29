"""Render only the two competing 228103 back UV-island candidates."""
from pathlib import Path
import sys

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "Caroma-Poc" / "3d-garment-retexture" / "py"))
from retexture import _raster, islands, load_glb, preview  # noqa: E402

glb = ROOT / "momentec-cdl-express" / "assets" / "augusta-live" / "hockey-3d" / "228103" / "228103.glb"
out = ROOT / "momentec-cdl-express" / ".diagnostics" / "228103-back-candidates.preview.png"
_, meshes = load_glb(glb)
mesh = meshes["228103"]
labels = islands(mesh["V"], mesh["F"])
size = 768
points = np.stack([mesh["UV"][:, 0] * (size - 1), mesh["UV"][:, 1] * (size - 1)], axis=1)
coverage, _, attrs = _raster(points, mesh["F"], (size, size), attr={"island": labels.reshape(-1, 1).astype(np.float32)})
ids = np.rint(attrs["island"][..., 0]).astype(int)
texture = np.full((size, size, 3), (35, 105, 175), dtype=np.uint8)
texture[coverage & (ids == 1)] = (240, 50, 50)
texture[coverage & (ids == 10)] = (45, 210, 80)
preview([(mesh, texture[::-1], None)], out)
print(out)
