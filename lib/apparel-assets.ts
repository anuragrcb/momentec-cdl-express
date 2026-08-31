import { hasAugustaLiveGlb, hasMesh } from "./types";

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
  viewIslandMap?: Partial<Record<"front" | "back" | "left" | "right", number[]>>;
}

function liveDescriptor(sku: string): ApparelAssetDescriptor {
  const browserMaterial = hasAugustaLiveGlb(sku);
  const serverBaked = hasMesh(sku);
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
    previewMode: "browser-mapped",
    modelUrl: "/api/augusta-live/228108/228108.glb",
    normalMapUrl: "/api/augusta-live/228108/228108-NormalMap.png",
    supportsGeneratedMissingViews: true,
    supportsCustomerViews: ["front", "back", "left", "right"],
    mappingStatus: "verified",
  };
}

export function hasApparel3dPreview(sku: string): boolean {
  return true;
}
