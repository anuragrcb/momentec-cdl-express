"""Report 228103 main-mesh connected UV islands with stable geometric facts."""
from pathlib import Path
import json
import sys

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "Caroma-Poc" / "3d-garment-retexture" / "py"))
from retexture import islands, load_glb  # noqa: E402

glb = ROOT / "momentec-cdl-express" / "assets" / "augusta-live" / "hockey-3d" / "228103" / "228103.glb"
_, meshes = load_glb(glb)
mesh = meshes["228103"]
labels = islands(mesh["V"], mesh["F"])
rows = []
for island_id in sorted(np.unique(labels)):
    selected = labels == island_id
    points = mesh["V"][selected]
    uv = mesh["UV"][selected]
    rows.append({
        "id": int(island_id),
        "vertices": int(selected.sum()),
        "centroid": np.round(points.mean(axis=0), 5).tolist(),
        "uvMin": np.round(uv.min(axis=0), 5).tolist(),
        "uvMax": np.round(uv.max(axis=0), 5).tolist(),
    })
print(json.dumps(sorted(rows, key=lambda row: -row["vertices"]), indent=2))
