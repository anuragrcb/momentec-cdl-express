"""List candidate light text rows in a prepared hockey back mockup."""
import argparse
import json

import numpy as np
from PIL import Image
from scipy.ndimage import binary_closing, binary_dilation, find_objects, label

parser = argparse.ArgumentParser()
parser.add_argument("image")
args = parser.parse_args()
image = np.asarray(Image.open(args.image).convert("RGB"))
height, width = image.shape[:2]
light = (image.min(axis=2) > 120) & ((image.max(axis=2) - image.min(axis=2)) < 70)
# Ignore transparent/background-like margins and join neighbouring letters into rows.
light[: int(height * 0.08)] = False
light[int(height * 0.72) :] = False
joined = binary_closing(light, structure=np.ones((5, 17), dtype=bool))
joined = binary_dilation(joined, structure=np.ones((3, 9), dtype=bool))
components, count = label(joined)
rows = []
for component_id, item in enumerate(find_objects(components), start=1):
    if item is None:
        continue
    ys, xs = item
    box_width = xs.stop - xs.start
    box_height = ys.stop - ys.start
    if box_width < width * 0.10 or box_height < height * 0.015:
        continue
    rows.append({
        "component": component_id,
        "box": [xs.start, ys.start, xs.stop, ys.stop],
        "normalized": [round(xs.start / width, 4), round(ys.start / height, 4), round(xs.stop / width, 4), round(ys.stop / height, 4)],
        "widthShare": round(box_width / width, 4),
        "heightShare": round(box_height / height, 4),
        "lightPixels": int(light[item].sum()),
    })
print(json.dumps({"width": width, "height": height, "candidates": sorted(rows, key=lambda row: row["normalized"][1])}, indent=2))
