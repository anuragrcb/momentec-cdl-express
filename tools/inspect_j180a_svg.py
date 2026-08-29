#!/usr/bin/env python3
"""Inventory the authoritative J180A Illustrator SVG without rendering it.

The SVG intentionally contains hidden garment-size groups and many named design
layouts. This report preserves the upstream structure and records location boxes
used by the builder for text/logo placement and UV hit testing.
"""

from __future__ import annotations

import json
import re
import xml.etree.ElementTree as ET
import argparse
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument(
    "--svg",
    default=str(ROOT / "assets" / "augusta-live" / "baseball" / "J180A" / "prod-J180A-decorations.svg"),
)
parser.add_argument("--output", default=str(ROOT / ".diagnostics" / "j180a-svg-report.json"))
args = parser.parse_args()
SVG_PATH = Path(args.svg).resolve()
OUT_PATH = Path(args.output).resolve()
NS = "{http://www.w3.org/2000/svg}"


def decode_id(value: str) -> str:
    return re.sub(r"_x([0-9A-Fa-f]{2})_", lambda match: chr(int(match.group(1), 16)), value.replace("_x5F_", "_"))


def numeric(element: ET.Element, name: str) -> float | None:
    raw = element.attrib.get(name)
    if raw is None:
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def element_id(element: ET.Element) -> str:
    return decode_id(element.attrib.get("id", ""))


def descendant_ids(element: ET.Element, prefix: str) -> list[str]:
    return [element_id(item) for item in element.iter() if element_id(item).startswith(prefix)]


root = ET.parse(SVG_PATH).getroot()
groups = list(root.iter(f"{NS}g"))
size_groups = [group for group in groups if element_id(group).startswith("Garment_")]

sizes = []
for group in size_groups:
    size_id = element_id(group)
    sizes.append({
        "id": size_id,
        "size": size_id.removeprefix("Garment_"),
        "display": group.attrib.get("display", "inline"),
        "parts": sorted(set(descendant_ids(group, "Part:"))),
        "paths": sum(1 for item in group.iter() if item.tag == f"{NS}path"),
    })

decoration_sets = [
    group for group in groups
    if element_id(group) == "Decorations" or element_id(group).endswith("_Decorations")
]
designs = []
location_counter: Counter[str] = Counter()
for design in decoration_sets:
        design_id = element_id(design)
        locations = []
        for item in design.iter():
            item_id = element_id(item)
            if not item_id.startswith("location:"):
                continue
            location_id = item_id.split(":", 1)[1]
            if "_" in location_id and location_id.rsplit("_", 1)[-1] in {"XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"}:
                base_location = location_id.rsplit("_", 1)[0]
                size = location_id.rsplit("_", 1)[1]
            else:
                base_location = location_id
                size = None
            location_counter[base_location] += 1
            locations.append({
                "id": location_id,
                "baseLocation": base_location,
                "size": size,
                "tag": item.tag.removeprefix(NS),
                "x": numeric(item, "x"),
                "y": numeric(item, "y"),
                "width": numeric(item, "width"),
                "height": numeric(item, "height"),
                "transform": item.attrib.get("transform"),
                "display": item.attrib.get("display") or item.attrib.get("style"),
            })
        designs.append({
            "id": design_id,
            "display": design.attrib.get("display", "inline"),
            "parts": sorted(set(descendant_ids(design, "Part:"))),
            "locations": locations,
            "clipPaths": sorted(set(descendant_ids(design, "deco_clip_"))),
        })

report = {
    "source": str(SVG_PATH),
    "root": {
        "width": root.attrib.get("width"),
        "height": root.attrib.get("height"),
        "viewBox": root.attrib.get("viewBox"),
    },
    "counts": {
        "groups": len(groups),
        "paths": sum(1 for item in root.iter() if item.tag == f"{NS}path"),
        "rects": sum(1 for item in root.iter() if item.tag == f"{NS}rect"),
        "clipPaths": sum(1 for item in root.iter() if item.tag == f"{NS}clipPath"),
        "sizeGroups": len(sizes),
        "designGroups": len(designs),
    },
    "sizes": sizes,
    "designs": designs,
    "baseLocationFrequency": dict(sorted(location_counter.items())),
}

OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
OUT_PATH.write_text(json.dumps(report, indent=2))
print(json.dumps({
    "ok": True,
    "output": str(OUT_PATH),
    "sizes": [item["size"] for item in sizes],
    "designGroupCount": len(designs),
    "locations": sorted(location_counter),
}, separators=(",", ":")))
