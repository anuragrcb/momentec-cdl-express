// Shared types for the CDL Express flow: analyze -> match -> (bake) -> submit.

export interface ArtworkColor {
  name: string;
  hex: string;
}

/** Output of POST /api/analyze - what the vision model read off the artwork. */
export interface ArtworkAnalysis {
  sport: string;
  garmentType: string;
  colors: ArtworkColor[];
  hasLogo: boolean;
  hasNumber: boolean;
  hasTeamName: boolean;
  summary: string;
}

/** One row from the copied Momentec/Augusta template-library.json. */
export interface CatalogueStyle {
  parentSku: string;
  name: string;
  division: string;
  sport: string;
  garmentType: string;
  category: string;
  sizes: string[];
  coreSizesPresent: boolean;
  colorCount: number;
  msrp: string;
  image: string;
  w2pTemplate: string;
  w2pUrlBase: string;
  renderable: boolean;
  renderBytes: number;
  renderSize: string;
}

/** The 4 style numbers that ship with a real .glb in assets/meshes. */
export const MESH_AVAILABLE_SKUS = ["228108", "228103", "228187", "227132"] as const;
export type MeshAvailableSku = (typeof MESH_AVAILABLE_SKUS)[number];

export function hasMesh(sku: string): sku is MeshAvailableSku {
  return (MESH_AVAILABLE_SKUS as readonly string[]).includes(sku);
}

/** One scored candidate returned by POST /api/match-style. */
export interface StyleMatch {
  style: CatalogueStyle;
  score: number;
  reasons: string[];
  has3dPreview: boolean;
}

/** Status shape relayed from the sibling retexture service. */
export interface BakeStatus {
  id: string;
  status: "queued" | "running" | "done" | "failed";
  stage: string | null;
  error: string | null;
  stats: Record<string, unknown>;
  log: string[];
  files: string[];
  glbUrl?: string;
}

/** A persisted "mockup request" record - the thing /api/submit writes. */
export interface MockupRequest {
  id: string;
  createdAt: string;
  images: {
    front: string;
    back?: string;
    left?: string;
    right?: string;
  };
  knownStyleNumber?: string;
  analysis: ArtworkAnalysis;
  chosenStyle: {
    parentSku: string;
    name: string;
  };
  bake?: {
    jobId: string;
    status: BakeStatus["status"];
    glbUrl?: string;
  };
  comments: string;
  status: "submitted";
}
