"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const ATLAS_SIZE = 2048;
const SVG_SPAN = 6485.3398438;
const PANEL_KEYS = {
  back: "2664.003",
  lfront: "2664.004",
  rfront: "2664.005",
  lsleeve: "2670.002",
  rsleeve: "2670.003",
} as const;

type PanelName = keyof typeof PANEL_KEYS;
type ProofView = "front" | "back" | "left" | "right" | "collar";
type Drawable = HTMLImageElement | HTMLCanvasElement;
type Rect = { x: number; y: number; w: number; h: number };
type UvBounds = { u0: number; v0: number; u1: number; v1: number };
type Point = { x: number; y: number };

interface GarmentAnalysis {
  box: Rect;
  torso: Rect;
  trimmed: boolean;
  torsoMeasured: boolean;
}

interface J180AProofProps {
  frontImageUrl: string;
  backImageUrl?: string;
  leftImageUrl?: string;
  rightImageUrl?: string;
  modelUrls: Readonly<Record<string, string>>;
  cutSvgUrl: string;
  normalMapUrl?: string;
  size: string;
  onReady?: (ready: boolean) => void;
  onWarning?: (message: string) => void;
}

const VIEW_POSITIONS: Record<ProofView, [number, number, number]> = {
  front: [0, 0, 2.4],
  back: [0, 0, -2.4],
  left: [-1.55, 0, 1.83],
  right: [1.55, 0, 1.83],
  collar: [0, 1.75, 1.55],
};

function mediaWidth(image: Drawable): number {
  return image instanceof HTMLImageElement ? image.naturalWidth : image.width;
}

function mediaHeight(image: Drawable): number {
  return image instanceof HTMLImageElement ? image.naturalHeight : image.height;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load artwork image: ${src}`));
    image.src = src;
  });
}

function loadGlb(src: string): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(src, (gltf) => resolve(gltf.scene), undefined, reject);
  });
}

async function readPanelBoxes(
  svgUrl: string,
  size: string,
  host: HTMLDivElement,
): Promise<Partial<Record<PanelName, Rect>>> {
  const response = await fetch(svgUrl);
  if (!response.ok) throw new Error(`Could not load J180A cut SVG (${response.status}).`);
  host.innerHTML = await response.text();
  const group = host.querySelector<SVGGElement>(`[id="Garment_x5F_${size}"]`);
  if (!group) throw new Error(`Augusta's SVG has no verified ${size} cut group.`);
  group.setAttribute("display", "inline");
  group.style.display = "inline";

  const scale = ATLAS_SIZE / SVG_SPAN;
  const boxes: Partial<Record<PanelName, Rect>> = {};
  (Object.keys(PANEL_KEYS) as PanelName[]).forEach((name) => {
    const element = group.querySelector<SVGGraphicsElement>(`[id="Part:${name}"]`);
    const matrix = element?.getCTM();
    if (!element || !matrix) return;
    const bounds = element.getBBox();
    const points: [number, number][] = [
      [bounds.x, bounds.y],
      [bounds.x + bounds.width, bounds.y],
      [bounds.x, bounds.y + bounds.height],
      [bounds.x + bounds.width, bounds.y + bounds.height],
    ];
    const xs = points.map(([x, y]) => (matrix.a * x + matrix.c * y + matrix.e) * scale);
    const ys = points.map(([x, y]) => (matrix.b * x + matrix.d * y + matrix.f) * scale);
    boxes[name] = {
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    };
  });
  return boxes;
}

function analyseGarment(image: HTMLImageElement): GarmentAnalysis {
  const sampleScale = Math.min(1, 700 / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.round(image.naturalWidth * sampleScale);
  const height = Math.round(image.naturalHeight * sampleScale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas is unavailable for garment analysis.");
  context.drawImage(image, 0, 0, width, height);
  const data = context.getImageData(0, 0, width, height).data;
  const pixel = (x: number, y: number): [number, number, number, number] => {
    const index = (y * width + x) * 4;
    return [data[index], data[index + 1], data[index + 2], data[index + 3]];
  };
  const corners = [pixel(0, 0), pixel(width - 1, 0), pixel(0, height - 1), pixel(width - 1, height - 1)];
  const background = [0, 1, 2].map((channel) => corners.reduce((sum, value) => sum + value[channel], 0) / 4);
  const isBackground = (x: number, y: number) => {
    const [r, g, b, a] = pixel(x, y);
    return a < 24 || (
      Math.abs(r - background[0]) < 26 &&
      Math.abs(g - background[1]) < 26 &&
      Math.abs(b - background[2]) < 26
    );
  };

  let x0 = width, y0 = height, x1 = -1, y1 = -1, backgroundCount = 0, count = 0;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      count += 1;
      if (isBackground(x, y)) {
        backgroundCount += 1;
        continue;
      }
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  if (x1 <= x0 || y1 <= y0 || backgroundCount / count <= 0.04) {
    const full = { x: 0, y: 0, w: 1, h: 1 };
    return { box: full, torso: full, trimmed: false, torsoMeasured: false };
  }

  const box = { x: x0 / width, y: y0 / height, w: (x1 - x0) / width, h: (y1 - y0) / height };
  const rows: { l: number; r: number; w: number }[] = [];
  for (let y = y0; y <= y1; y += 2) {
    let left = -1, right = -1;
    for (let x = x0; x <= x1; x += 2) if (!isBackground(x, y)) { left = x; break; }
    for (let x = x1; x >= x0; x -= 2) if (!isBackground(x, y)) { right = x; break; }
    if (left >= 0 && right > left) rows.push({ l: left, r: right, w: right - left });
  }
  const widths = rows.map((row) => row.w).sort((a, b) => a - b);
  const percentile = (value: number) => widths[Math.min(widths.length - 1, Math.floor(widths.length * value))];
  const bodyWidth = widths.length ? percentile(0.3) : 0;
  const maxWidth = widths.length ? percentile(0.95) : 0;
  const bodyRows = rows.filter((row) => bodyWidth > 0 && row.w <= bodyWidth * 1.12);
  if (!bodyWidth || !maxWidth || bodyWidth / maxWidth > 0.88 || bodyRows.length < 4) {
    return { box, torso: box, trimmed: true, torsoMeasured: false };
  }
  const center = bodyRows.reduce((sum, row) => sum + (row.l + row.r) / 2, 0) / bodyRows.length;
  const torsoX0 = Math.max(x0, center - bodyWidth / 2);
  const torsoX1 = Math.min(x1, center + bodyWidth / 2);
  return {
    box,
    torso: { x: torsoX0 / width, y: box.y, w: (torsoX1 - torsoX0) / width, h: box.h },
    trimmed: true,
    torsoMeasured: true,
  };
}

function subRect(rect: Rect, x0: number, x1: number, y0 = 0, y1 = 1): Rect {
  return { x: rect.x + x0 * rect.w, y: rect.y + y0 * rect.h, w: (x1 - x0) * rect.w, h: (y1 - y0) * rect.h };
}

function expandX(rect: Rect, factor: number): Rect {
  const center = rect.x + rect.w / 2;
  const width = Math.min(1, rect.w * factor);
  return { x: Math.max(0, Math.min(1 - width, center - width / 2)), y: rect.y, w: width, h: rect.h };
}

function sideSleeve(analysis: GarmentAnalysis): Rect {
  return subRect(analysis.box, 0.2, 0.94, 0.06, 0.45);
}

function frontSleeve(analysis: GarmentAnalysis, side: "left" | "right"): Rect {
  return side === "left"
    ? subRect(analysis.box, 0.62, 1, 0.03, 0.46)
    : subRect(analysis.box, 0, 0.38, 0.03, 0.46);
}

function drawMapped(context: CanvasRenderingContext2D, image: Drawable, source: Rect, x: number, y: number, w: number, h: number) {
  const width = mediaWidth(image), height = mediaHeight(image);
  context.drawImage(
    image,
    source.x * width,
    source.y * height,
    Math.max(1, source.w * width),
    Math.max(1, source.h * height),
    x,
    y,
    w,
    h,
  );
}

function drawSingleSleeve(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  source: Rect,
  width: number,
  height: number,
) {
  const layer = document.createElement("canvas");
  layer.width = width;
  layer.height = height;
  const layerContext = layer.getContext("2d", { willReadFrequently: true });
  if (!layerContext) return;
  drawMapped(layerContext, image, source, 0, 0, width, height);

  const pixels = layerContext.getImageData(0, 0, width, height);
  const data = pixels.data, total = width * height;
  const seen = new Uint8Array(total), queue = new Int32Array(total);
  let head = 0, tail = 0;
  const pale = (index: number) => data[index * 4] > 235 && data[index * 4 + 1] > 235 && data[index * 4 + 2] > 235;
  const push = (index: number) => {
    if (index >= 0 && index < total && !seen[index] && pale(index)) {
      seen[index] = 1;
      queue[tail++] = index;
    }
  };
  for (let x = 0; x < width; x++) { push(x); push((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { push(y * width); push(y * width + width - 1); }
  while (head < tail) {
    const index = queue[head++], x = index % width, y = Math.floor(index / width);
    data[index * 4 + 3] = 0;
    if (x) push(index - 1);
    if (x < width - 1) push(index + 1);
    if (y) push(index - width);
    if (y < height - 1) push(index + width);
  }
  layerContext.putImageData(pixels, 0, 0);

  type PaletteColor = { n: number; r: number; g: number; b: number; lum: number; sat: number };
  const bins = new Map<string, { n: number; r: number; g: number; b: number }>();
  for (let index = 0; index < total; index++) {
    if (data[index * 4 + 3] < 24) continue;
    const r = data[index * 4], g = data[index * 4 + 1], b = data[index * 4 + 2];
    if (r > 245 && g > 245 && b > 245) continue;
    const key = `${r >> 4},${g >> 4},${b >> 4}`;
    const value = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    value.n += 1; value.r += r; value.g += g; value.b += b; bins.set(key, value);
  }
  const palette: PaletteColor[] = [...bins.values()].sort((a, b) => b.n - a.n).slice(0, 16).map((color) => {
    const r = color.r / color.n, g = color.g / color.n, b = color.b / color.n;
    return { n: color.n, r, g, b, lum: 0.2126 * r + 0.7152 * g + 0.0722 * b, sat: (Math.max(r, g, b) - Math.min(r, g, b)) / 255 };
  });
  const fallback: PaletteColor = palette[0] ?? { n: 1, r: 20, g: 20, b: 24, lum: 20, sat: 0.02 };
  const dark = palette.reduce((best, color) => color.lum < best.lum ? color : best, fallback);
  const vivid = palette.reduce((best, color) => color.n * (0.4 + color.sat) > best.n * (0.4 + best.sat) ? color : best, fallback);
  const middle = palette.find((color) => Math.hypot(color.r - vivid.r, color.g - vivid.g, color.b - vivid.b) > 42 && color !== dark) ?? vivid;
  const css = (color: PaletteColor) => `rgb(${Math.round(color.r)},${Math.round(color.g)},${Math.round(color.b)})`;
  const gradient = context.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, css(dark));
  gradient.addColorStop(0.34, css(middle));
  gradient.addColorStop(0.52, css(vivid));
  gradient.addColorStop(0.72, css(middle));
  gradient.addColorStop(1, css(dark));
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  context.drawImage(layer, 0, 0);
}

function paintRenderBox(context: CanvasRenderingContext2D, image: HTMLImageElement, source: Rect, box: Rect, sleeve = false) {
  const width = Math.max(2, Math.ceil(box.w)), height = Math.max(2, Math.ceil(box.h));
  const layer = document.createElement("canvas");
  layer.width = width;
  layer.height = height;
  const layerContext = layer.getContext("2d", { willReadFrequently: sleeve });
  if (!layerContext) return;
  if (sleeve) drawSingleSleeve(layerContext, image, source, width, height);
  else drawMapped(layerContext, image, source, 0, 0, width, height);
  context.drawImage(layer, box.x, box.y, box.w, box.h);
}

function blendSideGutter(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  sideBody: Rect,
  box: Rect,
  options: { edge: "left" | "right"; half: "front" | "back"; flip?: boolean; widthFraction: number; topFraction: number },
) {
  const source = options.half === "front" ? subRect(sideBody, 0, 0.5) : subRect(sideBody, 0.5, 1);
  const width = Math.max(2, Math.ceil(box.w * options.widthFraction));
  const y = box.y + box.h * options.topFraction;
  const height = Math.max(2, Math.ceil(box.h * (1 - options.topFraction)));
  const layer = document.createElement("canvas");
  layer.width = width;
  layer.height = height;
  const layerContext = layer.getContext("2d");
  if (!layerContext) return;
  if (options.flip) {
    layerContext.save(); layerContext.translate(width, 0); layerContext.scale(-1, 1);
    drawMapped(layerContext, image, source, 0, 0, width, height); layerContext.restore();
  } else drawMapped(layerContext, image, source, 0, 0, width, height);
  layerContext.globalCompositeOperation = "destination-in";
  const feather = layerContext.createLinearGradient(0, 0, width, 0);
  if (options.edge === "left") {
    feather.addColorStop(0, "rgba(0,0,0,1)"); feather.addColorStop(0.62, "rgba(0,0,0,.92)"); feather.addColorStop(1, "rgba(0,0,0,0)");
  } else {
    feather.addColorStop(0, "rgba(0,0,0,0)"); feather.addColorStop(0.38, "rgba(0,0,0,.92)"); feather.addColorStop(1, "rgba(0,0,0,1)");
  }
  layerContext.fillStyle = feather;
  layerContext.fillRect(0, 0, width, height);
  context.drawImage(layer, options.edge === "left" ? box.x : box.x + box.w - width, y, width, height);
}

function materialList(material: THREE.Material | THREE.Material[]): THREE.Material[] {
  return Array.isArray(material) ? material : [material];
}

function materialUvBounds(root: THREE.Object3D, matcher: (name: string) => boolean): UvBounds | null {
  const bounds = { u0: Infinity, v0: Infinity, u1: -Infinity, v1: -Infinity };
  let found = false;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const uv = object.geometry.attributes.uv as THREE.BufferAttribute | undefined;
    if (!uv || !materialList(object.material).some((material) => matcher(material.name || ""))) return;
    found = true;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      bounds.u0 = Math.min(bounds.u0, u); bounds.u1 = Math.max(bounds.u1, u);
      bounds.v0 = Math.min(bounds.v0, v); bounds.v1 = Math.max(bounds.v1, v);
    }
  });
  return found ? bounds : null;
}

function meshWorldBounds(root: THREE.Object3D, matcher: (materialNames: string[]) => boolean): THREE.Box3 | null {
  root.updateMatrixWorld(true);
  const result = new THREE.Box3();
  let found = false;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (!matcher(materialList(object.material).map((material) => material.name || ""))) return;
    const box = new THREE.Box3().setFromObject(object);
    if (!found) { result.copy(box); found = true; } else result.union(box);
  });
  return found ? result : null;
}

function drawImageTriangle(context: CanvasRenderingContext2D, image: Drawable, source: Point[], destination: Point[]) {
  const [s0, s1, s2] = source, [d0, d1, d2] = destination;
  const denominator = s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);
  if (Math.abs(denominator) < 1e-5) return;
  const a = (d0.x * (s1.y - s2.y) + d1.x * (s2.y - s0.y) + d2.x * (s0.y - s1.y)) / denominator;
  const c = (d0.x * (s2.x - s1.x) + d1.x * (s0.x - s2.x) + d2.x * (s1.x - s0.x)) / denominator;
  const e = (d0.x * (s1.x * s2.y - s2.x * s1.y) + d1.x * (s2.x * s0.y - s0.x * s2.y) + d2.x * (s0.x * s1.y - s1.x * s0.y)) / denominator;
  const b = (d0.y * (s1.y - s2.y) + d1.y * (s2.y - s0.y) + d2.y * (s0.y - s1.y)) / denominator;
  const d = (d0.y * (s2.x - s1.x) + d1.y * (s0.x - s2.x) + d2.y * (s1.x - s0.x)) / denominator;
  const f = (d0.y * (s1.x * s2.y - s2.x * s1.y) + d1.y * (s2.x * s0.y - s0.x * s2.y) + d2.y * (s0.x * s1.y - s1.x * s0.y)) / denominator;
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.beginPath(); context.moveTo(d0.x, d0.y); context.lineTo(d1.x, d1.y); context.lineTo(d2.x, d2.y); context.closePath(); context.clip();
  context.setTransform(a, b, c, d, e, f); context.drawImage(image, 0, 0); context.restore();
}

function bakeFrontObservation(context: CanvasRenderingContext2D, root: THREE.Object3D, image: Drawable, source: Rect): number {
  const isFront = (name: string) => name.includes("_FRONT_") && (name.includes(PANEL_KEYS.lfront) || name.includes(PANEL_KEYS.rfront));
  const body = meshWorldBounds(root, (names) => names.some(isFront));
  if (!body) return 0;
  const bodySize = new THREE.Vector3(); body.getSize(bodySize);
  const imageWidth = mediaWidth(image), imageHeight = mediaHeight(image);
  const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3();
  let triangles = 0;
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (!materialList(object.material).some((material) => isFront(material.name || ""))) return;
    const position = object.geometry.attributes.position as THREE.BufferAttribute | undefined;
    const uv = object.geometry.attributes.uv as THREE.BufferAttribute | undefined;
    if (!position || !uv) return;
    const index = object.geometry.index, count = index ? index.count : position.count;
    for (let i = 0; i + 2 < count; i += 3) {
      const i0 = index ? index.getX(i) : i, i1 = index ? index.getX(i + 1) : i + 1, i2 = index ? index.getX(i + 2) : i + 2;
      p0.fromBufferAttribute(position, i0).applyMatrix4(object.matrixWorld);
      p1.fromBufferAttribute(position, i1).applyMatrix4(object.matrixWorld);
      p2.fromBufferAttribute(position, i2).applyMatrix4(object.matrixWorld);
      const src = [p0, p1, p2].map((point) => ({
        x: (source.x + (point.x - body.min.x) / bodySize.x * source.w) * imageWidth,
        y: (source.y + (body.max.y - point.y) / bodySize.y * source.h) * imageHeight,
      }));
      const dst = [i0, i1, i2].map((vertex) => ({ x: uv.getX(vertex) * ATLAS_SIZE, y: uv.getY(vertex) * ATLAS_SIZE }));
      if (src.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))) {
        drawImageTriangle(context, image, src, dst);
        triangles += 1;
      }
    }
  });
  return triangles;
}

function sampleInnerFabricColour(image: HTMLImageElement, region: Rect): THREE.Color {
  const canvas = document.createElement("canvas"); canvas.width = 96; canvas.height = 96;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return new THREE.Color(0x18131f);
  context.drawImage(image, region.x * image.naturalWidth, region.y * image.naturalHeight, region.w * image.naturalWidth, region.h * image.naturalHeight, 0, 0, 96, 96);
  const data = context.getImageData(0, 0, 96, 96).data;
  const pixels: [number, number, number, number][] = [];
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (a > 220 && luminance < 115 && Math.max(r, g, b) < 170) pixels.push([r, g, b, luminance]);
  }
  if (!pixels.length) return new THREE.Color(0x18131f);
  pixels.sort((a, b) => a[3] - b[3]);
  const middle = pixels.slice(Math.floor(pixels.length * 0.3), Math.max(1, Math.ceil(pixels.length * 0.7)));
  const rgb = middle.reduce<[number, number, number]>((sum, pixel) => [sum[0] + pixel[0], sum[1] + pixel[1], sum[2] + pixel[2]], [0, 0, 0]);
  return new THREE.Color(rgb[0] / middle.length / 255, rgb[1] / middle.length / 255, rgb[2] / middle.length / 255);
}

function closeOpenPhotoBackground(image: HTMLImageElement, replacement: THREE.Color): HTMLCanvasElement {
  const width = image.naturalWidth, height = image.naturalHeight;
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return canvas;
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, width, height), data = pixels.data, total = width * height;
  const corners = [0, width - 1, (height - 1) * width, total - 1];
  const background = [0, 1, 2].map((channel) => corners.reduce((sum, index) => sum + data[index * 4 + channel], 0) / corners.length);
  const connected = new Uint8Array(total), queue = new Int32Array(total);
  let head = 0, tail = 0;
  const isBackground = (index: number) => {
    const i = index * 4, dr = data[i] - background[0], dg = data[i + 1] - background[1], db = data[i + 2] - background[2];
    return data[i + 3] < 24 || Math.hypot(dr, dg, db) < 52;
  };
  const push = (index: number) => {
    if (index >= 0 && index < total && !connected[index] && isBackground(index)) {
      connected[index] = 1; queue[tail++] = index;
    }
  };
  for (let x = 0; x < width; x++) { push(x); push((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { push(y * width); push(y * width + width - 1); }
  while (head < tail) {
    const index = queue[head++], x = index % width, y = Math.floor(index / width);
    if (x) push(index - 1); if (x < width - 1) push(index + 1); if (y) push(index - width); if (y < height - 1) push(index + width);
  }
  const r = Math.round(replacement.r * 255), g = Math.round(replacement.g * 255), b = Math.round(replacement.b * 255);
  for (let index = 0; index < total; index++) if (connected[index]) {
    const i = index * 4; data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  return canvas;
}

function validateCoupling(root: THREE.Object3D, boxes: Partial<Record<PanelName, Rect>>): string[] {
  return (Object.keys(PANEL_KEYS) as PanelName[]).map((name) => {
    const actual = materialUvBounds(root, (material) => material.includes(PANEL_KEYS[name]));
    const box = boxes[name];
    if (!actual || !box) throw new Error(`Missing ${name} UV or SVG cut.`);
    const expected = { u0: box.x / ATLAS_SIZE, v0: box.y / ATLAS_SIZE, u1: (box.x + box.w) / ATLAS_SIZE, v1: (box.y + box.h) / ATLAS_SIZE };
    const centerDelta = Math.max(
      Math.abs((expected.u0 + expected.u1) / 2 - (actual.u0 + actual.u1) / 2),
      Math.abs((expected.v0 + expected.v1) / 2 - (actual.v0 + actual.v1) / 2),
    );
    const seam = Math.max(Math.abs(actual.u0 - expected.u0), Math.abs(actual.v0 - expected.v0), Math.abs(actual.u1 - expected.u1), Math.abs(actual.v1 - expected.v1));
    if (centerDelta > 0.006 || seam > 0.016) throw new Error(`${name} failed SVG/GLB size coupling.`);
    return `${name}: PASS`;
  });
}

export function J180AProof({
  frontImageUrl,
  backImageUrl,
  leftImageUrl,
  rightImageUrl,
  modelUrls,
  cutSvgUrl,
  normalMapUrl,
  size,
  onReady,
  onWarning,
}: J180AProofProps) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const mountRef = useRef<HTMLDivElement | null>(null);
  const svgHostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current, svgHost = svgHostRef.current, modelUrl = modelUrls[size];
    if (!mount || !svgHost || !modelUrl) return;
    let disposed = false, frameId = 0, model: THREE.Object3D | null = null;
    let atlasTexture: THREE.CanvasTexture | null = null, fabricNormal: THREE.Texture | null = null;
    setStatus("loading"); onReady?.(false);

    const scene = new THREE.Scene(); scene.background = new THREE.Color(0xffffff);
    const width = Math.max(320, mount.clientWidth), height = Math.max(420, mount.clientHeight);
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.01, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height); renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);
    scene.add(new THREE.AmbientLight(0xffffff, 0.8), new THREE.HemisphereLight(0xffffff, 0x444444, 0.75));
    const key = new THREE.DirectionalLight(0xffffff, 1); key.position.set(2, 3, 2); scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.45); fill.position.set(-2, 1, -2); scene.add(fill);
    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = false;
    const applyView = (next: ProofView) => {
      camera.position.set(...VIEW_POSITIONS[next]); camera.lookAt(0, 0, 0); controls.target.set(0, 0, 0); controls.update();
    };
    applyView("front");

    const resizeObserver = new ResizeObserver(() => {
      const nextWidth = Math.max(320, mount.clientWidth), nextHeight = Math.max(420, mount.clientHeight);
      camera.aspect = nextWidth / nextHeight; camera.updateProjectionMatrix(); renderer.setSize(nextWidth, nextHeight);
    });
    resizeObserver.observe(mount);

    (async () => {
      try {
        const [front, optionalBack, optionalLeft, optionalRight, boxes, loadedModel] = await Promise.all([
          loadImage(frontImageUrl),
          backImageUrl ? loadImage(backImageUrl) : Promise.resolve(undefined),
          leftImageUrl ? loadImage(leftImageUrl) : Promise.resolve(undefined),
          rightImageUrl ? loadImage(rightImageUrl) : Promise.resolve(undefined),
          readPanelBoxes(cutSvgUrl, size, svgHost),
          loadGlb(modelUrl),
        ]);
        if (disposed) return;
        model = loadedModel;
        validateCoupling(loadedModel, boxes);
        const back = optionalBack ?? front, left = optionalLeft ?? front, right = optionalRight ?? front;
        if (!optionalBack) onWarning?.("Back view is missing; the front artwork is being used as a proof-only fallback.");
        if (!optionalLeft || !optionalRight) onWarning?.("One or both side views are missing; visible front-sleeve artwork is being used as a proof-only fallback.");

        const frontAnalysis = analyseGarment(front), backAnalysis = analyseGarment(back);
        const leftAnalysis = analyseGarment(left), rightAnalysis = analyseGarment(right);
        const silhouetteRatio = frontAnalysis.box.w / frontAnalysis.torso.w;
        const perspectiveFactor = 1 + Math.min(0.18, Math.max(0.1, (silhouetteRatio - 1) * 0.2));
        const torso = expandX(frontAnalysis.torso, perspectiveFactor);
        const rightFrontSource = subRect(torso, 0, 0.5), leftFrontSource = subRect(torso, 0.5, 1);
        const rightSleeveSource = optionalRight ? sideSleeve(rightAnalysis) : frontSleeve(frontAnalysis, "right");
        const leftSleeveSource = optionalLeft ? sideSleeve(leftAnalysis) : frontSleeve(frontAnalysis, "left");
        const sideBody = (analysis: GarmentAnalysis, sleeve: Rect): Rect => {
          const y = Math.max(analysis.torso.y, sleeve.y + sleeve.h * 0.62), bottom = analysis.torso.y + analysis.torso.h;
          return { x: analysis.torso.x, y, w: analysis.torso.w, h: Math.max(0.01, bottom - y) };
        };
        const rightSideBody = sideBody(rightAnalysis, rightSleeveSource), leftSideBody = sideBody(leftAnalysis, leftSleeveSource);
        const gutterWidth = Math.min(0.25, Math.max(0.14, perspectiveFactor - 1));
        const gutterTop = Math.min(0.34, Math.max(0.24, (perspectiveFactor - 1) * 1.5));
        const innerColour = sampleInnerFabricColour(front, subRect(frontAnalysis.torso, 0.32, 0.68, 0, 0.16));
        const frontProjectionSource = closeOpenPhotoBackground(front, innerColour);

        const canvas = document.createElement("canvas"); canvas.width = ATLAS_SIZE; canvas.height = ATLAS_SIZE;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas is unavailable for the J180A atlas.");
        context.fillStyle = `#${innerColour.getHexString()}`; context.fillRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);
        const renderBox = (name: PanelName): Rect => {
          const uv = materialUvBounds(loadedModel, (material) => material.includes(PANEL_KEYS[name]));
          if (!uv) throw new Error(`Missing ${name} UVs.`);
          const pad = ATLAS_SIZE * 0.006;
          return { x: uv.u0 * ATLAS_SIZE - pad, y: uv.v0 * ATLAS_SIZE - pad, w: (uv.u1 - uv.u0) * ATLAS_SIZE + 2 * pad, h: (uv.v1 - uv.v0) * ATLAS_SIZE + 2 * pad };
        };
        const rFrontBox = renderBox("rfront"), lFrontBox = renderBox("lfront"), backBox = renderBox("back");
        paintRenderBox(context, front, rightFrontSource, rFrontBox);
        paintRenderBox(context, front, leftFrontSource, lFrontBox);
        paintRenderBox(context, back, backAnalysis.torso, backBox);
        paintRenderBox(context, right, rightSleeveSource, renderBox("rsleeve"), true);
        paintRenderBox(context, left, leftSleeveSource, renderBox("lsleeve"), true);

        const projection = document.createElement("canvas"); projection.width = ATLAS_SIZE; projection.height = ATLAS_SIZE;
        const projectionContext = projection.getContext("2d");
        if (!projectionContext || !bakeFrontObservation(projectionContext, loadedModel, frontProjectionSource, torso)) {
          throw new Error("The front observation could not be projected onto the verified mesh.");
        }
        context.drawImage(projection, 0, 0);
        blendSideGutter(context, right, rightSideBody, rFrontBox, { edge: "left", half: "front", flip: true, widthFraction: gutterWidth, topFraction: gutterTop });
        blendSideGutter(context, left, leftSideBody, lFrontBox, { edge: "right", half: "front", widthFraction: gutterWidth, topFraction: gutterTop });
        blendSideGutter(context, left, leftSideBody, backBox, { edge: "left", half: "back", widthFraction: gutterWidth, topFraction: gutterTop });
        blendSideGutter(context, right, rightSideBody, backBox, { edge: "right", half: "back", flip: true, widthFraction: gutterWidth, topFraction: gutterTop });

        atlasTexture = new THREE.CanvasTexture(canvas);
        atlasTexture.flipY = false; atlasTexture.colorSpace = THREE.SRGBColorSpace;
        atlasTexture.wrapS = THREE.RepeatWrapping; atlasTexture.wrapT = THREE.RepeatWrapping;
        atlasTexture.minFilter = THREE.LinearMipmapLinearFilter; atlasTexture.magFilter = THREE.LinearFilter;
        atlasTexture.generateMipmaps = true; atlasTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        if (normalMapUrl) {
          fabricNormal = await new THREE.TextureLoader().loadAsync(normalMapUrl);
          fabricNormal.flipY = false; fabricNormal.colorSpace = THREE.NoColorSpace;
          fabricNormal.wrapS = THREE.RepeatWrapping; fabricNormal.wrapT = THREE.RepeatWrapping; fabricNormal.repeat.set(25, 25);
          fabricNormal.minFilter = THREE.LinearMipmapLinearFilter; fabricNormal.magFilter = THREE.LinearFilter;
          fabricNormal.generateMipmaps = true; fabricNormal.anisotropy = renderer.capabilities.getMaxAnisotropy();
        }
        if (disposed) return;

        loadedModel.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          const wasArray = Array.isArray(object.material);
          const materials = materialList(object.material).map((material) => {
            const name = material.name || "", isButton = name.toLowerCase().includes("button"), isInterior = name.includes("_BACK_");
            const isPanel = Object.values(PANEL_KEYS).some((key) => name.includes(key));
            if (isButton) {
              material.side = THREE.FrontSide; material.transparent = false; material.opacity = 1; material.depthWrite = true;
              return material;
            }
            if (isInterior) {
              return new THREE.MeshStandardMaterial({
                color: innerColour,
                normalMap: fabricNormal,
                normalScale: new THREE.Vector2(2, 2),
                name,
                roughness: 0.78,
                metalness: 0,
                side: THREE.DoubleSide,
              });
            }
            if (isPanel) {
              return new THREE.MeshStandardMaterial({
                map: atlasTexture,
                normalMap: fabricNormal,
                normalScale: new THREE.Vector2(3, 3),
                name,
                roughness: material instanceof THREE.MeshStandardMaterial ? material.roughness : 0.72,
                metalness: 0,
                side: THREE.DoubleSide,
              });
            }
            return material;
          });
          object.material = wasArray ? materials : materials[0];
        });

        const bounds = new THREE.Box3().setFromObject(loadedModel), dimensions = new THREE.Vector3(), center = new THREE.Vector3();
        bounds.getSize(dimensions); bounds.getCenter(center);
        const scale = 1.4 / (Math.max(dimensions.x, dimensions.y, dimensions.z) || 1);
        loadedModel.scale.setScalar(scale); loadedModel.position.sub(center.multiplyScalar(scale));
        scene.add(loadedModel); applyView("front");
        setStatus("ready"); onReady?.(true);
      } catch (error) {
        if (disposed) return;
        const message = error instanceof Error ? error.message : "J180A proof failed.";
        console.error("J180A proof failed", error); setStatus("error"); onReady?.(false); onWarning?.(message);
      }
    })();

    const animate = () => { frameId = requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); };
    animate();
    return () => {
      disposed = true; onReady?.(false); cancelAnimationFrame(frameId); resizeObserver.disconnect(); controls.dispose();
      if (model) model.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        materialList(object.material).forEach((material) => material.dispose());
        object.geometry.dispose();
      });
      atlasTexture?.dispose(); fabricNormal?.dispose(); renderer.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
      svgHost.innerHTML = "";
    };
    // All inputs are stable URLs/configuration. View changes use the camera
    // controller and deliberately do not rebuild textures or reload the GLB.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, frontImageUrl, backImageUrl, leftImageUrl, rightImageUrl, modelUrls, cutSvgUrl, normalMapUrl, onReady, onWarning]);

  return (
    <div className="garment-proof">
      <div ref={mountRef} className="garment-proof-canvas" />
      <div ref={svgHostRef} aria-hidden="true" style={{ position: "absolute", left: -100000, top: 0, width: 1, height: 1, overflow: "hidden" }} />
      {status !== "ready" && (
        <div className="viewer-status garment-proof-status">
          <strong>{status === "loading" ? "Preparing your 3D garment preview…" : "The garment preview could not be built."}</strong>
        </div>
      )}
    </div>
  );
}
