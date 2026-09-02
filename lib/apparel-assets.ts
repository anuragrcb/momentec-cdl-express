import { hasAugustaRemoteGlb } from "./types";

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
  /** Sizes exposed by the proof journey. This is catalogue/adapter metadata,
   * not a UI hard-code. */
  proofSizes?: readonly string[];
  /** The production SVG contains groups named Garment_x5F_{size}. */
  cutPieceSvgUsesSizeGroups?: boolean;
  sizeModelUrls?: Readonly<Record<string, string>>;
  previewSvgUrl?: string;
  logicalParts?: readonly string[];
  placementLocations?: readonly string[];
  viewIslandMap?: Partial<Record<"front" | "back" | "left" | "right", number[]>>;
}

function liveDescriptor(sku: string): ApparelAssetDescriptor {
  const previewMode: ApparelPreviewMode = "browser-mapped";

  return {
    sku,
    family: "apparel",
    previewMode,
    modelUrl: `/api/augusta-live/${sku}/${sku}.glb`,
    normalMapUrl: `/api/augusta-live/${sku}/${sku}-NormalMap.png`,
    cutPieceSvgUrl: `/api/augusta-live/${sku}/artwork.svg`,
    flatReferenceUrl: `/api/augusta-live/${sku}/render.png`,
    supportsGeneratedMissingViews: true,
    supportsCustomerViews: ["front", "back", "left", "right"],
    mappingStatus: "verified",
    viewIslandMap: sku === "228103"
      ? { left: [8], right: [7] }
      : sku === "228108"
        ? { left: [5], right: [4] }
        : undefined,
  };
}

export const APPAREL_ASSETS: Record<string, ApparelAssetDescriptor> = Object.fromEntries(
  ["228103", "228108", "228150", "228162", "228203", "228208", "228250", "228262"].map((sku) => [
    sku,
    liveDescriptor(sku),
  ]),
);

// 228180 is the verified adult, short-sleeve, set-in training tee. The
// official manufacturer assets are allow-listed and streamed by
// /api/augusta-live rather than committing third-party binaries to this repo.
if (hasAugustaRemoteGlb("228180")) {
  APPAREL_ASSETS["228180"] = {
    ...liveDescriptor("228180"),
    cutPieceSvgUrl: "/api/augusta-live/228180/artwork.svg",
    mappingVersion: "228180-official-main-reverse-v1",
    logicalParts: ["bk", "frt", "lslv", "rslv", "collar"],
    proofSizes: ["S", "M", "L", "XL", "2XL", "3XL", "4XL"],
    cutPieceSvgUsesSizeGroups: true,
  };
}

APPAREL_ASSETS.J180A = {
  sku: "J180A",
  family: "apparel",
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
  proofSizes: ["S", "M", "L", "XL", "2XL", "3XL", "4XL"],
  cutPieceSvgUsesSizeGroups: true,
  logicalParts: ["back", "lfront", "rfront", "lsleeve", "rsleeve", "collar", "lplacket", "rplacket"],
  placementLocations: ["BG", "BK", "BL", "BR", "BT", "JH", "LC", "LF", "LG", "LW", "MR", "MS", "RC", "RF", "UB", "UF", "UG", "UL", "UN", "UR", "US"],
  supportsGeneratedMissingViews: false,
  supportsCustomerViews: ["front", "back", "left", "right"],
  mappingStatus: "verified",
  mappingVersion: "j180a-svg-glb-v2",
};

export function getApparelAssetDescriptor(sku: string): ApparelAssetDescriptor {
  if (APPAREL_ASSETS[sku]) {
    return APPAREL_ASSETS[sku];
  }
  return {
    sku,
    family: "apparel",
    previewMode: "unavailable",
    supportsGeneratedMissingViews: false,
    supportsCustomerViews: [],
    mappingStatus: "needs-style-validation",
  };
}

export function hasApparel3dPreview(sku: string): boolean {
  return getApparelAssetDescriptor(sku).previewMode !== "unavailable";
}
