"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

/**
 * Whether "main"'s own second torso-sized island (the back-panel fallback -
 * see buildAtlasTexture's block comment) needs a full 180-degree rotation
 * relative to the front island's orientation, per SKU.
 *
 * This is a real, per-asset authoring quirk, not something derivable from a
 * general signal: tried gating this on mean face-normal Z magnitude (both
 * SKUs turned out similarly weak, ~0.01-0.09, not a real discriminator) and
 * on whether "reverse"'s own UVs are in-range (228103's "reverse" IS
 * in-range, but disabling the "main" fallback there produced a fully blank
 * back panel, not a correctly-oriented one from "reverse" - proving "main"
 * holds the real visible back panel on 228103 too, "reverse" isn't actually
 * the outward-facing surface there either). With no reliable auto-detect
 * signal found across the two real SKUs verified so far, this stays an
 * explicit, honest lookup instead of a heuristic that's already produced two
 * different wrong guesses on real data. Verified by rendering a real
 * customer photo with readable text (name + number) on the back and
 * confirming it reads right-side-up, not just checking it's present:
 *   - 228108: true (back print rendered upside-down and mirrored without it)
 *   - 228103: false (228108's fix, naively applied here too, produced the
 *     same upside-down symptom on a SKU that had never shown it before)
 * Every other SKU in AUGUSTA_LIVE_GLB_SKUS is untested for this - defaults
 * to false (the more common orientation of the two seen so far) until each
 * is individually checked with a real back photo.
 */
const AUGUSTA_BACK_ROTATE_180: Record<string, boolean> = {
  "228108": true,
};

// Client-side re-implementation of Augusta/Momentec's own real render3d.js
// material-bake algorithm, reverse-engineered against their live production
// JS (not copied - re-derived from behaviour). Only usable for the 8 SKUs in
// AUGUSTA_LIVE_GLB_SKUS (lib/types.ts) where we have real, downloaded GLBs
// whose material naming we've confirmed: any material named/containing
// "reverse" is the back of the garment; everything else is front-facing.
//
// Unlike the sibling 3d-garment-retexture Python service (lib/retexture-
// client.ts), which UV-unwraps and paints an atlas server-side, this assigns
// the customer's cutout photos directly as `map` on the real material slots
// in-browser - no server round trip, no Python dependency, works only for
// these 8 styles.
// --- UV island detection (torso vs. sleeve/collar within one atlas) -------
//
// The "main" material (and, we found, "reverse" too) is a real production
// UV atlas: the torso, both sleeves, and the collar are separate,
// disconnected UV islands packed into different sub-rectangles of one
// texture. Verified against the real GLBs (228103, 228108) by parsing the
// sibling .obj files and running this exact connected-component approach
// offline (scripts/uv-islands.mjs, not shipped - diagnostic only):
//   - 228103 "main": 10 islands. The two largest (7289 and 7201 faces) are
//     centered in X (centerX ~ 0, spanning the full torso width) and are
//     distinguished from each other only by Z sign (front vs. back of the
//     mesh) - these are the torso front/back panels. The next two largest
//     (2793 and 2730 faces) are offset far off-center in X (|centerX|
//     ~0.27, much narrower spanX ~0.17) - these are the sleeves. The
//     remaining six islands (295-1194 faces) sit high on the Y axis
//     (shoulder/neckline) - collar/yoke pieces.
//   - 228108 "main": same pattern - 2 centered/full-width islands (5245,
//     4906 faces) = torso front/back, 2 off-center islands (3826, 3769
//     faces, spanX ~0.21) = sleeves, remainder = collar/shoulder.
//   - "reverse" on 228103 is *also* fragmented (12 islands, not one solid
//     back panel) - the two largest (1765, 1240 faces) are the centered,
//     full-width ones; the rest mirror collar/shoulder sub-pieces almost
//     exactly (same 3D bbox) as "main"'s collar islands. So "reverse" gets
//     the identical torso-isolation treatment as "main", not just "main".
//
// Heuristic used at runtime (mirrors the offline finding): the torso is
// always one of the two largest islands by face count; the two are told
// apart by which one sits toward the camera (+Z, front) vs. away from it
// (-Z, back) in the mesh's local space - front torso is the more +Z of the
// pair, back torso is the more -Z of the pair. Sleeves/collar/everything
// else in the same material never compete for "largest" (they're all
// materially smaller - under 1200 faces vs 2700+ for real torso islands in
// both verified SKUs), so this heuristic is robust without hardcoding
// per-SKU numbers, and degrades gracefully (falls back to "use the whole
// material") for any SKU whose atlas isn't fragmented this way (e.g. 228162,
// whose material names don't even match "main"/"reverse" and thus never
// enters this code path).
interface UvIsland {
  faceCount: number;
  minU: number;
  maxU: number;
  minV: number;
  maxV: number;
  minZ: number;
  maxZ: number;
  meanZ: number;
  meanNormalZ: number;
  meanX: number;
}

/**
 * Some of these GLBs (found on 228108's "reverse" material, absent on
 * 228103's - see computeUvIslands' block comment) use a UDIM-style layout:
 * each UV island sits at a whole-number UV offset (e.g. minU/maxU of
 * 3.597/3.775, minV/maxV of -2.281/-1.880), not packed inside a single
 * [0,1] square - and an island's own span can straddle an integer seam
 * (e.g. minU=1.686, maxU=2.417). Diagnosed via an offline dump of the real
 * 228108 .obj (union-find over its faces, same algorithm as
 * computeUvIslands below, re-run outside the browser - see
 * /tmp/uv-islands-228108.mjs, not shipped): "main"'s islands all stayed
 * inside [0,1] (why the front torso already rendered correctly), every
 * "reverse" island did not. Treating those raw values as already-normalized
 * (the previous behaviour) placed the paint box thousands of pixels outside
 * the 2048x2048 canvas - nothing ever landed there, and clamp-to-edge
 * sampling of that empty space is exactly the flat, un-textured wash
 * reported on the back panel. Fixed in buildTorsoScopedTexture: reduce the
 * box into [0,1) via frac(), paint it tiled at 3x3 +/-resolution offsets so
 * a seam-straddling span still lands fully on-canvas either side, and
 * repeat-wrap the resulting texture so the mesh's own out-of-range UVs
 * sample it periodically, the same way it was painted.
 */

function computeUvIslands(geometry: THREE.BufferGeometry): UvIsland[] {
  const uvAttr = geometry.attributes.uv as THREE.BufferAttribute | undefined;
  const posAttr = geometry.attributes.position as THREE.BufferAttribute | undefined;
  const normAttr = geometry.attributes.normal as THREE.BufferAttribute | undefined;
  if (!uvAttr || !posAttr) return [];

  const triVerts: number[] = [];
  if (geometry.index) {
    for (let i = 0; i < geometry.index.count; i++) triVerts.push(geometry.index.getX(i));
  } else {
    for (let i = 0; i < posAttr.count; i++) triVerts.push(i);
  }

  // Union-Find over vertex indices, connecting the 3 corners of every
  // triangle - the same "grow connected UV triangle groups, disconnected
  // groups are separate islands" approach used for atlas-island detection
  // elsewhere (e.g. the Python retexture service), re-derived here for
  // three.js BufferGeometry instead of a trimesh/pygltflib mesh.
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cur = x;
    while (cur !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const v of triVerts) if (!parent.has(v)) parent.set(v, v);
  for (let i = 0; i + 2 < triVerts.length; i += 3) {
    union(triVerts[i], triVerts[i + 1]);
    union(triVerts[i + 1], triVerts[i + 2]);
  }

  const groups = new Map<
    number,
    { verts: Set<number>; faceCount: number; sumFaceCenterZ: number; sumFaceNormalZ: number; sumFaceCenterX: number }
  >();
  for (let i = 0; i + 2 < triVerts.length; i += 3) {
    const root = find(triVerts[i]);
    let g = groups.get(root);
    if (!g) {
      g = { verts: new Set(), faceCount: 0, sumFaceCenterZ: 0, sumFaceNormalZ: 0, sumFaceCenterX: 0 };
      groups.set(root, g);
    }
    const a = triVerts[i], b = triVerts[i + 1], c = triVerts[i + 2];
    g.verts.add(a);
    g.verts.add(b);
    g.verts.add(c);
    g.faceCount += 1;
    // Average by face centroid/normal (not by vertex set) so a handful of
    // stray triangles bridging two conceptually different panels - the
    // vertex welding across a UV seam we found in the real GLBs merges some
    // adjacent panels into one connected island, unlike the cleaner
    // per-panel split the sibling .obj export shows - can't quietly drag an
    // average toward zero. Each face gets equal weight regardless of how
    // many other faces share its corner vertices.
    g.sumFaceCenterZ += (posAttr.getZ(a) + posAttr.getZ(b) + posAttr.getZ(c)) / 3;
    g.sumFaceCenterX += (posAttr.getX(a) + posAttr.getX(b) + posAttr.getX(c)) / 3;
    if (normAttr) {
      g.sumFaceNormalZ += (normAttr.getZ(a) + normAttr.getZ(b) + normAttr.getZ(c)) / 3;
    }
  }

  const islands: UvIsland[] = [];
  for (const g of groups.values()) {
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const vi of g.verts) {
      const u = uvAttr.getX(vi);
      const v = uvAttr.getY(vi);
      const z = posAttr.getZ(vi);
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    islands.push({
      faceCount: g.faceCount,
      minU, maxU, minV, maxV, minZ, maxZ,
      meanZ: g.sumFaceCenterZ / g.faceCount,
      // meanNormalZ is 0 (never negative) when there's no normal attribute
      // at all, which correctly falls through to the meanZ-based tiebreak
      // in pickTorsoIsland below.
      meanNormalZ: normAttr ? g.sumFaceNormalZ / g.faceCount : 0,
      meanX: g.sumFaceCenterX / g.faceCount,
    });
  }
  return islands;
}

/**
 * Picks the torso island out of a material's UV islands (see block comment
 * above). Pass `preferNegativeNormalZ=true` for the front-facing material
 * ("main"), `false` for the back-facing one ("reverse").
 *
 * Verified empirically against the real 228103 GLB (rendered a labeled test
 * texture per candidate island and screenshotted the result - see the
 * temporary debug harness used for this, since removed): the camera sits at
 * +Z looking toward the origin, but this GLB's front-facing torso surface
 * has *negative* mean face-normal Z, not positive - i.e. this asset's local
 * +Z axis points toward the garment's back, the reverse of the naive "+Z
 * faces the camera" assumption. The two largest islands by face count are
 * reliably the torso front/back (see block comment above); telling them
 * apart by raw position Z is unreliable (a real GLB export welds vertices
 * across some UV seams, which pulls both islands' position-Z ranges toward
 * overlapping - see computeUvIslands' comment), but which way each island's
 * triangles actually face stays a clean, large-magnitude signal even with
 * that merging, so it takes priority over the noisier mean position Z
 * whenever normals are available.
 */
function pickTorsoIsland(islands: UvIsland[], preferNegativeNormalZ: boolean): UvIsland | undefined {
  if (islands.length <= 1) return islands[0];
  const candidates = [...islands].sort((a, b) => b.faceCount - a.faceCount).slice(0, 2);
  candidates.sort((a, b) => {
    const signalA = a.meanNormalZ !== 0 ? a.meanNormalZ : a.meanZ;
    const signalB = b.meanNormalZ !== 0 ? b.meanNormalZ : b.meanZ;
    return preferNegativeNormalZ ? signalA - signalB : signalB - signalA;
  });
  return candidates[0];
}

/**
 * Picks the left and right sleeve islands out of a material's UV islands -
 * the next-largest islands after the two torso candidates (see the block
 * comment on computeUvIslands above: sleeves are consistently smaller than
 * the torso pair - under 1200 faces vs 2700+ on both real SKUs checked so
 * far - but still meaningfully bigger than collar/yoke fragments), split
 * left vs. right by mean face-center X sign. Left/right here means the
 * mesh's own local +X/-X, not yet empirically confirmed against which one
 * is physically the customer's left vs. right sleeve on-screen (unlike
 * pickTorsoIsland's front/back convention, which WAS verified this way) -
 * treat the left/right assignment as a best-effort guess pending that check
 * with real, distinguishably-labelled per-sleeve photos.
 */
function pickSleeveIslands(
  islands: UvIsland[],
  exclude: (UvIsland | undefined)[],
): { left: UvIsland | undefined; right: UvIsland | undefined } {
  const remaining = islands
    .filter((i) => !exclude.includes(i))
    .sort((a, b) => b.faceCount - a.faceCount)
    .slice(0, 2);
  const left = remaining.find((i) => i.meanX < 0);
  const right = remaining.find((i) => i.meanX >= 0);
  return { left, right };
}

/** Samples a rough average/dominant color from an already-loaded image, used
 *  as the fill for sleeve/collar UV regions that don't get the customer's
 *  photo (see buildTorsoScopedTexture). Downsamples to 16x16 first so this
 *  is cheap regardless of the source photo's resolution. */
function dominantColorCss(image: HTMLImageElement): string {
  try {
    const size = 16;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d");
    if (!ctx) return "#808080";
    ctx.drawImage(image, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 16) continue; // skip near-transparent pixels
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n += 1;
    }
    if (n === 0) return "#808080";
    return `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`;
  } catch {
    // Canvas can throw on a cross-origin/tainted image; a neutral grey is a
    // safe, sensible fallback rather than failing the whole render.
    return "#808080";
  }
}

/**
 * Builds one full-atlas-sized canvas texture for a material: the customer's
 * photo is composited ONLY into the real torso island's UV bounding box
 * (cropped to fill the box - see below - rather than stretched/duplicated
 * across the whole atlas); everywhere else in the atlas (sleeves, collar,
 * and any other real garment panels sharing this material) gets a solid
 * color sampled from the photo itself.
 *
 * Fit mode: crop-to-fill (like CSS `object-fit: cover`), not contain/
 * letterbox. An earlier version of this function used contain-fit, which
 * scaled the photo to fit entirely *within* the box and padded any leftover
 * space with the dominant-color fill - for photos whose aspect ratio
 * doesn't match the torso box's aspect ratio (the common case: e.g. the
 * "RATS" motocross jersey test photo is portrait, 936x1272 = 0.74 aspect,
 * against 228108's torso box, which is landscape, ~1.23 aspect), that
 * produced a visibly blank rectangular pad strip on the rendered garment -
 * looking like a photo pasted onto a mannequin rather than a print filling
 * the panel. Crop-to-fill scales the photo so its *shorter* relative
 * dimension matches the box, then center-crops the overflow on the longer
 * dimension, so the box is always fully covered by real photo content.
 *
 * Capped zoom, not unconditional full cover: a severe aspect mismatch (like
 * the RATS case, where cover-fit needs ~1.67x the contain-fit scale) would
 * center-crop away a large fraction of the source photo - fine when the
 * design is centered (verified: "RATS" survives even full cover here), but
 * risky in general for a photo whose important content isn't centered.
 * MAX_ZOOM caps how much bigger than contain-fit the cover scale is allowed
 * to get; past that cap we stop short of full cover and accept a thin
 * residual pad strip on the shorter axis instead of over-cropping the
 * longer one. Below the cap (the common case for reasonably-proportioned
 * jersey photos), this is indistinguishable from full cover-fit.
 */
/**
 * Paints one photo into one island's box on an already-created 2d context -
 * the part of the old buildTorsoScopedTexture that's genuinely per-region,
 * factored out so a single atlas (see buildAtlasTexture below) can paint more
 * than one region: found necessary on 228108, whose "main" material atlas
 * turned out to hold BOTH the front and back torso panels (not just front,
 * as on 228103, where "reverse" cleanly owned the back) - see the block
 * comment on buildAtlasTexture's only call site in the GLTFLoader callback.
 *
 * uv.y=0 is the top row here (CanvasTexture gets flipY=false, same
 * convention as the plain photo/normal textures loaded elsewhere in this
 * component), so U/V map directly onto canvas pixel X/Y with no flip math.
 */
function paintRegion(
  ctx: CanvasRenderingContext2D,
  photoImage: HTMLImageElement,
  island: UvIsland | undefined,
  resolution: number,
  rotate180 = false,
) {
  // Reduce minU/minV into [0,1) via frac() before scaling to pixels, so a
  // raw UDIM-style value like minU=3.6 (see the block comment on
  // buildAtlasTexture's call site) still lands inside the 2048x2048 canvas
  // instead of thousands of pixels off it. This alone isn't sufficient
  // though: an island's span can itself straddle an integer UV seam (found
  // on 228108's real "reverse" island: minU=1.686, maxU=2.417 pre-flip - or,
  // after this component's own U-flip runs first, on the geometry, negated
  // to roughly -1.417..-0.686 - either way the pair sits on opposite sides
  // of an integer boundary), so a single frac(minU) origin still clips part
  // of the box off one edge of the canvas. The draw call below is repeated
  // at 3x3 offsets of +/- one full `resolution` around the reduced box;
  // each is independently clipped to the true 0..resolution canvas, and
  // RepeatWrapping (set on the returned texture) means the GPU samples this
  // canvas the same periodic way this tiling paints it, so whichever copy
  // actually lands in-bounds is the one the real out-of-range mesh UVs pick
  // up. Confirmed necessary, not theoretical: a single-origin version of
  // this function (no tiling) left the real 228108 back panel completely
  // unpainted - the picked island's own box fell just past the canvas edge.
  const frac = (n: number) => n - Math.floor(n);
  const x0 = frac(island?.minU ?? 0) * resolution;
  const y0 = frac(island?.minV ?? 0) * resolution;
  const boxW = Math.max(1, ((island?.maxU ?? 1) - (island?.minU ?? 0)) * resolution);
  const boxH = Math.max(1, ((island?.maxV ?? 1) - (island?.minV ?? 0)) * resolution);

  const imgW = photoImage.naturalWidth || 1;
  const imgH = photoImage.naturalHeight || 1;
  const containScale = Math.min(boxW / imgW, boxH / imgH);
  const coverScale = Math.max(boxW / imgW, boxH / imgH);
  const MAX_ZOOM = 1.6; // cap cover-scale at 1.6x contain-scale - see block comment
  const scale = Math.min(coverScale, containScale * MAX_ZOOM);
  const drawW = imgW * scale;
  const drawH = imgH * scale;
  const dx = x0 + (boxW - drawW) / 2;
  const dy = y0 + (boxH - drawH) / 2;
  // The existing mirror-fix (geometry.attributes.uv, u' = 1 - u, applied
  // once to the whole mesh - see loadTexture's comment) reverses the
  // left-right *direction* of travel within any UV sub-region, not just
  // where that region sits: a mesh point that was physically on the
  // garment's left now has a larger flipped-u than one on the right. Since
  // this canvas is built directly in that already-flipped u-space (no
  // separate conversion - see the comment above), drawing the photo
  // normally would place its own left-hand content at the physically-right
  // mesh point and vice versa, mirroring text/logos. Compensate by drawing
  // the photo pre-flipped into the box (verified visually: without this,
  // "FRONT" rendered backwards on the real 228103 GLB).
  //
  // Crop-to-fill means drawW/drawH can now exceed boxW/boxH (that's the
  // point - the overflow on the longer axis is what gets center-cropped
  // away). Clip to the box rect first so that overflow is actually clipped
  // by the canvas, not painted past the box edge on top of the base-color
  // fill in a neighboring UV island's region of this same shared atlas.
  //
  // Painted at 3x3 offsets of the box/draw position (+/- one `resolution`
  // on each axis) - see the block comment above the frac()-based box
  // computation for why a single placement isn't enough once an island's
  // own span straddles an integer UV seam.
  //
  // rotate180: found necessary for 228108's back-torso island within "main"
  // (see buildAtlasTexture's block comment) - verified visually by rendering
  // the real customer photo (readable "MARNER"/"93" text) both with and
  // without this flag: without it, the print came out rotated a full 180
  // degrees (both mirrored AND upside-down, not just mirrored like every
  // other region here) - this island's own local UV winding runs opposite
  // to the front torso island's, not just the whole-mesh U convention the
  // base horizontal flip already compensates for. Not applied by default -
  // every other region verified so far (front torso on both 228103 and
  // 228108, "reverse" on 228103) only needed the standard horizontal flip.
  for (const ox of [-resolution, 0, resolution]) {
    for (const oy of [-resolution, 0, resolution]) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0 + ox, y0 + oy, boxW, boxH);
      ctx.clip();
      if (rotate180) {
        ctx.translate(dx + ox, dy + drawH + oy);
        ctx.scale(1, -1);
      } else {
        ctx.translate(dx + drawW + ox, dy + oy);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(photoImage, 0, 0, drawW, drawH);
      ctx.restore();
    }
  }
}

/**
 * Builds one full-atlas-sized canvas texture for a material, painting each
 * given (photo, island) region into it via paintRegion, over a base fill of
 * a dominant color sampled from the first region's photo - covers anywhere
 * on the atlas outside the given regions (sleeves, collar, any other real
 * garment panel sharing this material) that doesn't get a customer photo.
 *
 * Originally this only ever took one region ("the torso island"), matching
 * 228103 where "main" holds just the front torso and "reverse" cleanly owns
 * the back. Extended to take multiple regions after 228108 turned out not
 * to fit that assumption: its "reverse" material's islands have near-zero
 * mean face-normal Z (0.014 and -0.037 for the two largest - see the debug
 * capture referenced in pickTorsoIsland's comment), the signature of a
 * curved/hidden surface (a gusset or lining flap), not a flat outward panel
 * - while "main"'s own second-largest island has a strong +0.611 normal,
 * same magnitude as its (correctly-picked) front island's -0.626, just
 * opposite sign. In other words: on 228108, "main" is the atlas that holds
 * BOTH the front and back torso panels, and "reverse" is something else
 * (small, mostly hidden). Painting only "main"'s front island (the original
 * behaviour) left its real back-torso region as flat dominant-color fill -
 * exactly the "back panel has no artwork at all" bug reported live. The
 * caller now always tries both pickTorsoIsland(islands, true) and (...,
 * false) as candidate regions for "main" and paints whichever photos are
 * available into both; this is a no-op improvement on assets like 228103
 * where the second candidate happens to already be covered by "reverse"
 * instead - painting it twice (once here with the front/back photo, once on
 * "reverse" with the back photo) just means both agree.
 */
function buildAtlasTexture(
  regions: { photo: HTMLImageElement; island: UvIsland | undefined; rotate180?: boolean }[],
  resolution = 2048,
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = resolution;
  canvas.height = resolution;
  const ctx = canvas.getContext("2d")!;
  const base = regions[0] ? dominantColorCss(regions[0].photo) : "#808080";
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, resolution, resolution);

  for (const region of regions) {
    paintRegion(ctx, region.photo, region.island, resolution, region.rotate180);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  // RepeatWrapping (not the default ClampToEdge): the mesh's own UVs for a
  // UDIM-tiled material (see paintRegion's comment) still carry their
  // original whole-number tile offset - only the box we painted with was
  // re-expressed relative to it. Sampling those raw UVs against this canvas
  // needs the GPU to wrap (frac) them back down to the tile we actually
  // painted, which only RepeatWrapping does; ClampToEdge would just smear
  // whatever's at the canvas edge across the whole out-of-range island
  // again, reproducing the original bug.
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

export interface AugustaMaterialBakeProps {
  sku: string;
  frontImageUrl: string;
  backImageUrl?: string;
  /** Left/right sleeve photos - already collected by the upload flow
   *  (design/page.tsx's "left"/"right" slots) but previously never passed
   *  in here, so sleeves always fell back to a flat dominant-color fill even
   *  when the customer uploaded real sleeve photos. Optional: sleeves still
   *  degrade to the flat-fill look when these aren't provided. */
  leftImageUrl?: string;
  rightImageUrl?: string;
  /** Defaults to true - the SKU's own downloaded -NormalMap.png, applied to
   *  the front/"main" material only (Augusta's own code never puts it on
   *  reverse - replicated deliberately, not an oversight). */
  useNormalMap?: boolean;
  /** Fires once after the first successful render with a captured PNG data
   *  URL of the current camera view - used for verification/export, not
   *  required for the interactive viewer itself. */
  onCapture?: (dataUrl: string) => void;
  /** Fires if the material-name matching found zero "reverse" materials on
   *  this SKU, or the GLB/texture load failed - surfaced so callers can warn
   *  instead of silently showing an unpainted model. */
  onWarning?: (message: string) => void;
}

export function AugustaMaterialBake({
  sku,
  frontImageUrl,
  backImageUrl,
  leftImageUrl,
  rightImageUrl,
  useNormalMap = true,
  onCapture,
  onWarning,
}: AugustaMaterialBakeProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    let frameId = 0;
    const width = mount.clientWidth;
    const height = mount.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf4f4f2);

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.01, 100);
    camera.position.set(0, 1.2, 2.6);

    // preserveDrawingBuffer + alpha so toDataURL() reliably captures a real
    // frame (including transparent background) on demand, not just whatever
    // happened to be in the buffer at the moment of the call.
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambient);
    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(2, 3, 2);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.5);
    fill.position.set(-2, 1, -1);
    scene.add(fill);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 1, 0);

    const textureLoader = new THREE.TextureLoader();
    let capturedOnce = false;
    let modelReady = false;

    const loadTexture = (url: string): Promise<THREE.Texture> =>
      new Promise((resolve, reject) => {
        textureLoader.load(
          url,
          (tex) => {
            // Critical, easy-to-get-wrong setting: GLTF's UV origin is
            // top-left, three.js defaults to flipped - without this, the
            // customer's artwork renders mirrored vertically on the garment.
            tex.flipY = false;
            // Found by testing, not in the original spec: these 8 GLBs' own
            // U coordinates run the opposite way from a naively-applied
            // photo - without this, artwork mirrors horizontally too (e.g. a
            // sleeve number on the photo's left ends up on the mesh's right
            // sleeve, and reads backwards). Verified by rendering a marked
            // test texture (a lettered glyph + corner marker) both with and
            // without this correction and comparing sleeve placement/glyph
            // direction against the source image.
            //
            // The horizontal flip itself is applied to the mesh's UVs once,
            // in the GLTFLoader callback below (geometry.attributes.uv,
            // u = 1 - u) rather than here via a texture wrapS/repeat/offset
            // transform. A texture-transform flip (repeat.x = -1, offset.x =
            // 1 with RepeatWrapping) was tried first and looked identical in
            // isolation, but real UV data for these GLBs (checked directly
            // against the .obj export of 228103, whose material/UV data
            // matches the .glb) shows every material's U/V stays inside
            // [0,1] (min ~0.005, max ~0.995 across all 4 materials), so
            // RepeatWrapping never actually triggers wrap/tile behaviour
            // here - a repeat.x=-1 sample of u in [0,1] lands at 1-u, still
            // inside [0,1]. Confirmed by A/B rendering the same test texture
            // on the real 228103 GLB with the texture-transform flip on vs.
            // off: the artifact was pixel-identical either way, so it was
            // never caused by the wrap mode. Flipping the geometry UVs
            // instead is mathematically equivalent for this asset and
            // removes the wrap-mode question entirely for any future SKU
            // whose UVs might genuinely fall outside [0,1].
            tex.colorSpace = THREE.SRGBColorSpace;
            resolve(tex);
          },
          undefined,
          reject,
        );
      });

    (async () => {
      try {
        const [frontTex, backTex, leftTex, rightTex, normalTex] = await Promise.all([
          loadTexture(frontImageUrl),
          backImageUrl ? loadTexture(backImageUrl) : Promise.resolve(undefined),
          leftImageUrl ? loadTexture(leftImageUrl) : Promise.resolve(undefined),
          rightImageUrl ? loadTexture(rightImageUrl) : Promise.resolve(undefined),
          useNormalMap
            ? loadTexture(`/api/augusta-live/${sku}/${sku}-NormalMap.png`).catch(() => undefined)
            : Promise.resolve(undefined),
        ]);
        if (normalTex) normalTex.colorSpace = THREE.NoColorSpace;
        if (disposed) return;

        new GLTFLoader().load(
          `/api/augusta-live/${sku}/${sku}.glb`,
          (gltf) => {
            if (disposed) return;
            const model = gltf.scene;
            let reverseCount = 0;
            let frontCount = 0;

            model.traverse((node) => {
              if (!(node instanceof THREE.Mesh)) return;
              // Horizontal mirror-fix (see loadTexture's comment above for
              // why this lives here, on the geometry, rather than as a
              // texture wrapS/repeat/offset transform): flip every UV's U
              // once, in place, so the mesh's own U coordinates line up with
              // a naively-applied photo. Guarded so re-traversal (shouldn't
              // happen here, but cheap to guard) never double-flips.
              const uvAttr = node.geometry.attributes.uv as THREE.BufferAttribute | undefined;
              if (uvAttr && !node.geometry.userData.augustaUvFlipped) {
                for (let i = 0; i < uvAttr.count; i++) {
                  uvAttr.setX(i, 1 - uvAttr.getX(i));
                }
                uvAttr.needsUpdate = true;
                node.geometry.userData.augustaUvFlipped = true;
              }
              // Each mesh node here has exactly one material (confirmed by
              // inspecting the real GLBs: node.material is never an array,
              // geometry.groups is always empty) - so a node's whole
              // geometry belongs to whichever single material it carries,
              // and island detection can run over the full geometry with no
              // per-group slicing.
              const materials = Array.isArray(node.material) ? node.material : [node.material];
              const rebuilt = materials.map((mat) => {
                const originalName = mat.name || "";
                const isReverse = originalName === "reverse" || originalName.includes("reverse");
                const isMain = originalName === "main" || originalName.includes("main");

                if (isReverse) {
                  reverseCount += 1;
                  const backPhoto = (backTex ?? frontTex)?.image as HTMLImageElement | undefined;
                  let map: THREE.Texture | undefined = backTex ?? frontTex;
                  if (backPhoto) {
                    // "reverse" turned out to be fragmented into UV islands
                    // too (verified offline - see block comment above), so
                    // it gets the same torso-isolation treatment as "main",
                    // just picking the opposite-facing one of the two
                    // largest islands (see pickTorsoIsland's comment for why
                    // "front" is the *negative*-normal-Z one on this asset).
                    // On some SKUs (228108 - see buildAtlasTexture's block
                    // comment) this pick is low-confidence (near-zero normal
                    // Z on both top candidates), but it's still the best
                    // available guess for whatever "reverse" actually covers
                    // on that mesh, and harmless when it's wrong since that
                    // surface is typically small/hidden.
                    const islands = computeUvIslands(node.geometry);
                    const torso = pickTorsoIsland(islands, false);
                    map = buildAtlasTexture([{ photo: backPhoto, island: torso }]);
                  }
                  const back = new THREE.MeshStandardMaterial({ map, name: originalName });
                  return back;
                }

                frontCount += 1;
                const frontPhoto = frontTex?.image as HTMLImageElement | undefined;
                let map: THREE.Texture | undefined = frontTex;
                if (isMain && frontPhoto) {
                  // "main" isn't always just the front torso - see
                  // buildAtlasTexture's block comment and
                  // AUGUSTA_BACK_ROTATE_180's comment: on both real SKUs
                  // checked so far, "main"'s own second torso-sized island
                  // turned out to be the real, visible back panel (disabling
                  // this for 228103 to lean on "reverse" instead produced a
                  // fully blank back, not a correct one) - "reverse" isn't
                  // reliably the outward-facing back surface on either SKU.
                  // Always paint it; only the rotation is per-SKU.
                  const islands = computeUvIslands(node.geometry);
                  const frontTorso = pickTorsoIsland(islands, true);
                  const backTorso = pickTorsoIsland(islands, false);
                  const backPhoto = (backTex ?? frontTex)?.image as HTMLImageElement | undefined;
                  const regions: { photo: HTMLImageElement; island: UvIsland | undefined; rotate180?: boolean }[] = [
                    { photo: frontPhoto, island: frontTorso },
                  ];
                  if (backPhoto && backTorso && backTorso !== frontTorso) {
                    regions.push({
                      photo: backPhoto,
                      island: backTorso,
                      rotate180: AUGUSTA_BACK_ROTATE_180[sku] ?? false,
                    });
                  }
                  // Sleeves: were always a flat dominant-color fill (an
                  // explicitly disclosed MVP simplification) even though the
                  // upload flow already collects left/right sleeve photos -
                  // they just never reached this component. Paint them into
                  // the next-largest islands after the torso pair (see
                  // pickSleeveIslands' comment) whenever a sleeve photo is
                  // available; falls back to the flat fill exactly as before
                  // for any island a photo isn't available for.
                  const leftPhoto = leftTex?.image as HTMLImageElement | undefined;
                  const rightPhoto = rightTex?.image as HTMLImageElement | undefined;
                  if (leftPhoto || rightPhoto) {
                    const sleeves = pickSleeveIslands(islands, [frontTorso, backTorso]);
                    if (leftPhoto && sleeves.left) {
                      regions.push({ photo: leftPhoto, island: sleeves.left });
                    }
                    if (rightPhoto && sleeves.right) {
                      regions.push({ photo: rightPhoto, island: sleeves.right });
                    }
                  }
                  map = buildAtlasTexture(regions);
                }
                // Non-"main", non-"reverse" materials (e.g. "laces",
                // "hoops") are small decorative parts, not part of the
                // reported bleeding bug, and keep the original raw-photo
                // behaviour unchanged.
                const front = new THREE.MeshStandardMaterial({
                  map,
                  normalMap: normalTex,
                  name: originalName,
                });
                return front;
              });
              node.material = Array.isArray(node.material) ? rebuilt : rebuilt[0];
            });

            if (reverseCount === 0) {
              onWarning?.(
                `Style ${sku}: no material named "reverse" was found - back artwork could not be isolated from front.`,
              );
            }
            if (frontCount === 0) {
              onWarning?.(`Style ${sku}: no front-facing material was found on this mesh.`);
            }

            const box = new THREE.Box3().setFromObject(model);
            const size = new THREE.Vector3();
            box.getSize(size);
            const center = new THREE.Vector3();
            box.getCenter(center);
            const maxDim = Math.max(size.x, size.y, size.z) || 1;
            const scale = 1.4 / maxDim;
            model.scale.setScalar(scale);
            const scaledCenter = center.clone().multiplyScalar(scale);
            model.position.sub(scaledCenter);
            model.position.y += 0.6;
            controls.target.set(0, 0.6, 0);
            camera.position.set(0, 0.9, 2.2);

            scene.add(model);
            modelReady = true;
            setStatus("ready");
          },
          undefined,
          (err) => {
            console.error("Failed to load Augusta-live GLB", err);
            if (!disposed) {
              setStatus("error");
              onWarning?.(`Failed to load real GLB for style ${sku}.`);
            }
          },
        );
      } catch (err) {
        console.error("Failed to load textures for Augusta material bake", err);
        if (!disposed) {
          setStatus("error");
          onWarning?.(`Failed to load artwork textures for style ${sku}.`);
        }
      }
    })();

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
      if (modelReady && !capturedOnce && !disposed && onCapture) {
        capturedOnce = true;
        // Give the renderer one more frame before capturing so the just-
        // added model is actually in this buffer, not the prior empty one.
        requestAnimationFrame(() => {
          try {
            onCapture(renderer.domElement.toDataURL("image/png"));
          } catch (e) {
            console.error("Failed to capture bake PNG", e);
          }
        });
      }
    };
    animate();

    const onResize = () => {
      if (!mount) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", onResize);
      controls.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sku, frontImageUrl, backImageUrl, leftImageUrl, rightImageUrl, useNormalMap]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
      {status === "loading" && (
        <div className="viewer-status" style={{ position: "absolute", top: 8, left: 8, right: 8 }}>
          <strong>Baking materials in your browser…</strong>
          <span>Loading the real style {sku} mesh and your artwork.</span>
        </div>
      )}
    </div>
  );
}
