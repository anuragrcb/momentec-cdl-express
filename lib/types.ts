// Shared types for the CDL Express flow: analyze -> match -> (bake) -> submit.

export interface ArtworkColor {
  name: string;
  hex: string;
}

/**
 * Output of POST /api/prepare-artwork - the "Prepare artwork" step that runs
 * Magnific background-removal (and a precision upscale if the source is
 * low-res) on the customer's uploaded photo before style matching. Touches
 * the 2D reference photo only - not vectorization, not cut-piece geometry.
 */
export interface PreparedArtwork {
  status: "prepared" | "skipped_no_key" | "skipped_error";
  originalUrl: string;
  preparedUrl: string;
  backgroundRemoved: boolean;
  upscaled: boolean;
  originalDimensions: { width: number; height: number } | null;
  preparedDimensions: { width: number; height: number } | null;
  message: string;
}

export type ArtworkView = "front" | "back" | "left" | "right";

/** Physical garment signals used to select a manufacturer model. These are
 * deliberately separate from printed artwork, team branding and colors. */
export interface GarmentConstruction {
  sleeveLength: "short" | "long" | "sleeveless" | "unknown";
  neckline: "crew" | "v-neck" | "collared" | "hooded" | "unknown";
  sleeveConstruction: "set-in" | "raglan" | "unknown";
  audience: "adult" | "youth" | "ladies" | "girls" | "unknown";
  frontClosure: "pullover" | "full-button" | "partial-button" | "zip" | "unknown";
}

export interface NormalizedArtworkBox {
  /** Left edge as a fraction of the source image width. */
  x: number;
  /** Top edge as a fraction of the source image height. */
  y: number;
  /** Box width as a fraction of the source image width. */
  width: number;
  /** Box height as a fraction of the source image height. */
  height: number;
}

export type ArtworkRegionType =
  | "logo"
  | "wordmark"
  | "player-name"
  | "player-number"
  | "sleeve-mark"
  | "pattern"
  | "trim"
  | "other";

/** A visible, spatially located element detected in one supplied customer view. */
export interface ArtworkRegion {
  id: string;
  view: ArtworkView;
  type: ArtworkRegionType;
  /** Exact visible text/number when present, otherwise a concise visual label. */
  value: string;
  placement: string;
  /** Augusta's own decoration-location code for this region (e.g. "LC", "BK",
   *  "US"), chosen from the matched style's real published zone list. null
   *  when unmapped or when the style publishes no zones - `placement` above is
   *  always still populated, so an unmapped region degrades to prose, never to
   *  nothing. */
  locationCode?: string | null;
  locationLabel?: string | null;
  box: NormalizedArtworkBox;
  /** Model confidence from 0 to 1. */
  confidence: number;
  /** Private PNG reference crop generated from the original customer upload. */
  extractedAssetUrl?: string;
  extractionNote?: string;
}

export interface ArtworkViewRead {
  view: ArtworkView;
  summary: string;
  regionCount: number;
}

/** Output of POST /api/analyze - what the vision model read off every supplied view. */
export interface ArtworkAnalysis {
  sport: string;
  garmentType: string;
  /** Visible construction signals used for physical-style matching. These
   *  describe the garment silhouette, never the printed artwork. */
  construction?: GarmentConstruction;
  /** Whether the customer uploaded a garment-shaped mockup that can be
   * projected directly, or flat artwork that must first be painted onto the
   * selected style's model silhouette. */
  artworkKind: "garment-mockup" | "flat-artwork" | "unknown";
  colors: ArtworkColor[];
  hasLogo: boolean;
  hasNumber: boolean;
  hasTeamName: boolean;
  sleeveMarks?: { left?: string; right?: string };
  backName?: string;
  backNumber?: string;
  views: ArtworkViewRead[];
  regions: ArtworkRegion[];
  summary: string;
}

/**
 * Post-approval information extracted from the customer-approved artwork.
 * It supports an artist/COMS handoff but deliberately does not claim that a
 * raster image has become final vector production art.
 */
export interface ArtworkElement {
  type: "logo" | "team-name" | "player-name" | "player-number" | "pattern" | "other";
  view: ArtworkView;
  content: string;
  /** free-text description of where the mark sits, e.g. "centre chest" */
  placement: string;
  /**
   * Augusta's own decoration-location code for this mark (e.g. "LC" left
   * chest, "BK" the big back number, "US" upper left sleeve), chosen from the
   * real zone list published in the style's decorations SVG.
   *
   * `null` when the model could not confidently map the mark to a zone, or
   * when the matched style has no published zone list - the free-text
   * `placement` above is always still present, so an unmapped mark degrades
   * to "we know what it is, not which zone", never to silence.
   */
  locationCode: string | null;
  /** human label for locationCode, carried so the UI never has to guess */
  locationLabel: string | null;
  dynamic: boolean;
  confidence: "high" | "medium" | "low";
  artistValidationRequired: boolean;
}

export interface ArtworkIntelligence {
  status: "complete" | "unavailable" | "failed";
  summary: string;
  dominantColors: ArtworkColor[];
  logos: ArtworkElement[];
  textAndNumbers: ArtworkElement[];
  typography: Array<{
    view: ArtworkView;
    text: string;
    visualStyle: string;
    exactFontIdentified: false;
    artistValidationRequired: true;
  }>;
  productionNotes: string[];
  message: string;
}

/** A reviewable crop cut from one of the customer-supplied garment views. */
export interface SourceArtworkAsset {
  id: string;
  view: ArtworkView;
  type: ArtworkRegionType;
  name: string;
  content: string;
  placement: string;
  locationCode?: string | null;
  locationLabel?: string | null;
  previewUrl?: string;
  confidence: number;
  dynamic: boolean;
}

export type VectorAssetKind = "assets-sheet" | "font-sheet" | "background-texture" | "primary-logo";

/** One Illustrator-compatible output produced by the Magnific MCP pipeline. */
export interface VectorPackageAsset {
  id: string;
  kind: VectorAssetKind;
  name: string;
  description: string;
  filename: string;
  previewUrl: string;
  downloadUrl: string;
}

/** Complete Step 5 handoff: deterministic crops plus optional AI vector sheets. */
export interface ArtworkPackage {
  status: "complete" | "metadata_only" | "failed";
  provider: "magnific-mcp" | "local-analysis";
  sourceAssets: SourceArtworkAsset[];
  vectorAssets: VectorPackageAsset[];
  zipDownloadUrl?: string;
  generatedAt: string;
  message: string;
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
  /** Verified physical construction metadata. New manufacturer styles should
   * provide this through catalogue configuration instead of code branches. */
  construction?: GarmentConstruction;
}

/** The 4 style numbers that ship with a real .glb in assets/meshes. */
export const MESH_AVAILABLE_SKUS = ["228108", "228103", "228187", "227132"] as const;
export type MeshAvailableSku = (typeof MESH_AVAILABLE_SKUS)[number];

export function hasMesh(sku: string): sku is MeshAvailableSku {
  return (MESH_AVAILABLE_SKUS as readonly string[]).includes(sku);
}

/**
 * The 8 real Augusta/Momentec hockey styles we have genuine, downloaded
 * production 3D-Sublimation assets for (GLB + OBJ/MTL + normal map), under
 * assets/augusta-live/hockey-3d/{sku}/{sku}.glb - see download-report.csv in
 * that folder. Every material in these 8 GLBs follows one confirmed real
 * naming rule: a material literally named/containing "reverse" is the back
 * of the garment, every other material (main, plus construction-specific
 * extras like laces/hoops on 228103) is a front-facing surface. This is a
 * DIFFERENT, smaller set than MESH_AVAILABLE_SKUS above (which points at the
 * sibling Python retexture service's assets/meshes/*.glb) - a SKU can be in
 * one list, both, or neither. To add a future SKU here, download its real
 * GLB to assets/augusta-live/hockey-3d/{sku}/{sku}.glb and confirm it has the
 * same "reverse" vs. everything-else material naming before adding it.
 */
export const AUGUSTA_LIVE_GLB_SKUS = [
  "228103",
  "228108",
  "228162",
  "228150",
  "228203",
  "228208",
  "228250",
  "228262",
] as const;
export type AugustaLiveGlbSku = (typeof AUGUSTA_LIVE_GLB_SKUS)[number];

export function hasAugustaLiveGlb(sku: string): sku is AugustaLiveGlbSku {
  return (AUGUSTA_LIVE_GLB_SKUS as readonly string[]).includes(sku);
}

/** Manufacturer-hosted assets that have been checked individually but are
 *  intentionally streamed through our allow-listed API instead of copied
 *  into the repository. */
export const AUGUSTA_REMOTE_GLB_SKUS = ["228180"] as const;
export type AugustaRemoteGlbSku = (typeof AUGUSTA_REMOTE_GLB_SKUS)[number];

export function hasAugustaRemoteGlb(sku: string): sku is AugustaRemoteGlbSku {
  return (AUGUSTA_REMOTE_GLB_SKUS as readonly string[]).includes(sku);
}

/** One scored candidate returned by POST /api/match-style. */
export interface StyleMatch {
  style: CatalogueStyle;
  score: number;
  reasons: string[];
  has3dPreview: boolean;
}

/** Server decision accompanying ranked candidates. Auto-selection is allowed
 * only when the best verified 3D style has a decisive score margin. */
export interface StyleRecommendation {
  sku: string | null;
  confidence: "high" | "medium" | "low";
  autoSelected: boolean;
  scoreMargin: number;
  reason: string;
}

/**
 * One view's camera-fit diagnostic, as parsed by the retexture service's
 * parseDiagnostics() from retexture.py's stdout. `iou` is the silhouette
 * overlap the fitted camera achieved against that view's reference cutout --
 * low IoU means the view never aligned with the model and its UV islands
 * were left to fall back to a flat placeholder colour instead of the
 * customer's photo.
 */
export interface BakeViewStat {
  view: string;
  file?: string;
  iou: number;
  locked?: boolean;
}

/** The subset of `stats` this app actually reads, on top of the raw bag. */
export interface BakeStats {
  views?: BakeViewStat[];
  coverage?: number;
  verdict?: "good" | "usable" | "poor" | "unknown";
  warnings?: string[];
  [key: string]: unknown;
}

/** Status shape relayed from the sibling retexture service. */
export interface BakeStatus {
  id: string;
  status: "queued" | "running" | "done" | "failed";
  stage: string | null;
  error: string | null;
  stats: BakeStats;
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
    generatedViews?: ArtworkView[];
  };
  artworkIntelligence?: ArtworkIntelligence;
  artworkPackage?: ArtworkPackage;
  orderPayload: {
    version: "cdl-express/v1";
    source: "JourneyAX CDL Express";
    product: { styleNumber: string; styleName: string };
    artwork: {
      activeViews: MockupRequest["images"];
      originalViews?: MockupRequest["images"];
      generatedViews: ArtworkView[];
      analysis: ArtworkAnalysis;
      intelligence?: ArtworkIntelligence;
      package?: ArtworkPackage;
    };
    customerInstructions: string;
    artistReviewRequired: true;
  };
  comments: string;
  status: "submitted";
}
