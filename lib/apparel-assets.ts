import { hasAugustaLiveGlb, hasMesh } from "./types";

/**
 * Super Custom CDL apparel assets.
 *
 * This is deliberately SKU-specific. A customer upload must be routed to an
 * actual garment model and its known cut-piece reference, never to a generic
 * jersey texture rule. `server-baked` is preferred because the retexture
 * service can render missing views from the selected GLB silhouette before it
 * bakes the UV atlas. `browser-material` is retained only for the verified
 * direct-material preview fallback.
 */
/**
 * - server-baked     : the Python retexture service paints an atlas server-side
 * - browser-material : legacy in-browser bake that INFERS placement from mesh
 *                      geometry (UV islands + face normals). Guesswork; kept
 *                      only for the 228xxx styles it was tuned against.
 * - browser-mapped   : in-browser, but placement comes from the manufacturer's
 *                      own published panel geometry with a verified SVG->UV
 *                      mapping. Nothing is inferred. This is the J180A path.
 * - unavailable      : no trustworthy preview for this style
 */
export type ApparelPreviewMode =
  | "server-baked"
  | "browser-material"
  | "browser-mapped"
  | "unavailable";

export interface ApparelAssetDescriptor {
  sku: string;
  family: "apparel";
  previewMode: ApparelPreviewMode;
  modelUrl?: string;
  normalMapUrl?: string;
  cutPieceSvgUrl?: string;
  flatReferenceUrl?: string;
  supportsGeneratedMissingViews: boolean;
  supportsCustomerViews: readonly ("front" | "back" | "left" | "right")[];
  mappingStatus: "verified" | "needs-style-validation";
  mappingVersion?: string;
  sizeModelUrls?: Readonly<Record<string, string>>;
  previewSvgUrl?: string;
  logicalParts?: readonly string[];
  placementLocations?: readonly string[];
  /**
   * Generated camera views write only to their compatible outer `main`
   * material UV islands. Customer front/back mockups retain ordinary camera
   * projection because each visibly includes sleeve surfaces; only synthesized
   * sides are restricted so they cannot overwrite body panels.
   */
  viewIslandMap?: Partial<Record<"front" | "back" | "left" | "right", number[]>>;
}

function liveDescriptor(sku: string): ApparelAssetDescriptor {
  const browserMaterial = hasAugustaLiveGlb(sku);
  const serverBaked = hasMesh(sku);
  // The retexture service accepts the selected GLB as multipart input. This
  // lets all verified live Augusta meshes use the same silhouette-aware
  // missing-view generation and UV-atlas bake pipeline, not only the legacy
  // four models that happened to live under assets/meshes originally.
  // 228103 customer artwork baking is quarantined after visual rejection. Its
  // real GLB can still be shown as an untextured construction reference, but
  // no generated/baked output may be approved until the SVG-template mapping
  // passes a complete panel review.
  const previewMode: ApparelPreviewMode = sku === "228103"
    ? "unavailable"
    : serverBaked || browserMaterial
      ? "server-baked"
      : "unavailable";

  return {
    sku,
    family: "apparel",
    previewMode,
    modelUrl: browserMaterial ? `/api/augusta-live/${sku}/${sku}.glb` : undefined,
    normalMapUrl: browserMaterial ? `/api/augusta-live/${sku}/${sku}-NormalMap.png` : undefined,
    cutPieceSvgUrl: browserMaterial ? `/api/augusta-live/${sku}/artwork.svg` : undefined,
    flatReferenceUrl: browserMaterial ? `/api/augusta-live/${sku}/render.png` : undefined,
    supportsGeneratedMissingViews: previewMode === "server-baked",
    supportsCustomerViews: ["front", "back", "left", "right"],
    mappingStatus: browserMaterial ? "verified" : "needs-style-validation",
    viewIslandMap: sku === "228103"
      // 228103 Traditional Lace Up: observed in labelled multi-angle render.
      // left=physical garment left sleeve island 8; right=physical right 7.
      ? { left: [8], right: [7] }
      : sku === "228108"
        ? { left: [5], right: [4] }
        : undefined,
  };
}

/**
 * The models downloaded and checked against the Momentec apparel renderer.
 * Add a SKU only after the exact GLB, normal map and cut-piece reference are
 * available and a labelled front/back/left/right placement test has passed.
 */
export const APPAREL_ASSETS: Record<string, ApparelAssetDescriptor> = Object.fromEntries(
  ["228103", "228108", "228150", "228162", "228203", "228208", "228250", "228262"].map((sku) => [
    sku,
    liveDescriptor(sku),
  ]),
);

APPAREL_ASSETS.J180A = {
  sku: "J180A",
  family: "apparel",
  // The SVG <-> GLB relationship is now measured, not assumed: every Part:*
  // bounding box in prod-J180A-decorations.svg maps onto this mesh's own
  // TEXCOORD_0 ranges under u = x/6485.34, v = y/6485.34, matching on all five
  // fabric panels (worst error 0.032 UV, and the GLB sits inside the SVG by
  // exactly the seam allowance). See lib/j180a-zones.ts for the full table.
  //
  // The browser proof now uses the verified inverse projection and renderer
  // contract for every supported size: source background is removed only when
  // connected to the photo border, centre artwork is baked once across both
  // front meshes, sleeves come from their matching side observations, and the
  // inner shell colour is sampled from the customer's collar fabric. It is
  // still a proof; artist validation remains mandatory downstream.
  previewMode: "browser-mapped",
  modelUrl: "/api/augusta-live/J180A/J180A_S.glb",
  normalMapUrl: "/api/augusta-live/J180A/nmm.jpg",
  cutPieceSvgUrl: "/api/augusta-live/J180A/prod-J180A-decorations.svg",
  previewSvgUrl: "/api/augusta-live/J180A/preview-J180A-decorations.svg",
  sizeModelUrls: {
    S: "/api/augusta-live/J180A/J180A_S.glb",
    M: "/api/augusta-live/J180A/J180A_M.glb",
    L: "/api/augusta-live/J180A/J180A_L.glb",
    XL: "/api/augusta-live/J180A/J180A_XL.glb",
    "2XL": "/api/augusta-live/J180A/J180A_2XL.glb",
    "3XL": "/api/augusta-live/J180A/J180A_3XL.glb",
    "4XL": "/api/augusta-live/J180A/J180A_4XL.glb",
  },
  logicalParts: ["back", "lfront", "rfront", "lsleeve", "rsleeve", "collar", "lplacket", "rplacket"],
  placementLocations: ["BG", "BK", "BL", "BR", "BT", "JH", "LC", "LF", "LG", "LW", "MR", "MS", "RC", "RF", "UB", "UF", "UG", "UL", "UN", "UR", "US"],
  supportsGeneratedMissingViews: false,
  supportsCustomerViews: ["front", "back", "left", "right"],
  mappingStatus: "verified",
  mappingVersion: "j180a-svg-glb-v2",
};

export function getApparelAssetDescriptor(sku: string): ApparelAssetDescriptor {
  return APPAREL_ASSETS[sku] ?? {
    sku,
    family: "apparel",
    previewMode: "unavailable",
    supportsGeneratedMissingViews: false,
    supportsCustomerViews: ["front", "back", "left", "right"],
    mappingStatus: "needs-style-validation",
  };
}

export function hasApparel3dPreview(sku: string): boolean {
  return getApparelAssetDescriptor(sku).previewMode !== "unavailable";
}
