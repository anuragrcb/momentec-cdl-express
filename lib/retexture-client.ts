import fs from "node:fs";
import path from "node:path";
import type { ArtworkView, BakeStatus } from "./types";

// Thin proxy client for the sibling, ACTIVELY-DEVELOPED 3d-garment-retexture
// service that lives at Caroma-Poc/3d-garment-retexture (NOT the stale,
// untouched-since-Aug-13 copy that used to sit directly under JourneyAX/ - do
// not point this at that one, it no longer matches this contract). Treated as
// a black-box HTTP service - its real contract (read from its own current
// server.js / pipeline.js):
//
//   POST /api/jobs   multipart: glb, reference, + optional backImg, leftImg,
//                     rightImg files, plus mode ('match'|'transfer'|'augusta'),
//                     gemini, views, tier, size, colors, keep, backText
//                     ->  202 { id }
//   GET  /api/jobs/:id             -> { id, status, stage, error, stats, log, files }
//   GET  /api/jobs/:id/files/:name -> raw file bytes ("glb" is always the
//                                     baked model's file label when present)
//
// backImg/leftImg/rightImg are prepped (background-cut) and baked into the UV
// atlas unconditionally in 'match' mode - they do not require gemini=true.
// Only Gemini-*synthesized* views (when a view isn't supplied manually)
// require GEMINI_API_KEY on the retexture service's side.
const RETEXTURE_URL = process.env.RETEXTURE_SERVICE_URL || "http://localhost:4000";

const MESH_DIR = path.join(process.cwd(), "assets", "meshes");
const AUGUSTA_LIVE_MESH_DIR = path.join(process.cwd(), "assets", "augusta-live", "hockey-3d");

export function meshPathForSku(sku: string): string {
  const legacyMesh = path.join(MESH_DIR, `${sku}.glb`);
  // The original four service meshes remain supported. For verified Augusta
  // styles such as 228108, use the exact production GLB downloaded from the
  // same 3D-Sublimation asset family that Momentec's renderer loads.
  return fs.existsSync(legacyMesh)
    ? legacyMesh
    : path.join(AUGUSTA_LIVE_MESH_DIR, sku, `${sku}.glb`);
}

export interface StartBakeOptions {
  backImagePath?: string;
  leftImagePath?: string;
  rightImagePath?: string;
  /** Views the customer did not upload and the service should synthesize from
   * the selected garment silhouette. Customer-supplied images always win. */
  generatedViews?: Array<"back" | "left" | "right">;
  /** match projects a garment-shaped customer mockup; transfer redraws flat
   * artwork onto the selected model's own front silhouette before baking. */
  mode?: "match" | "transfer";
  sleeveMarks?: { left?: string; right?: string };
  viewIslandMap?: Partial<Record<ArtworkView, number[]>>;
}

function appendFileField(form: FormData, field: string, filePath: string) {
  const bytes = fs.readFileSync(filePath);
  form.append(field, new Blob([new Uint8Array(bytes)]), path.basename(filePath));
}

export async function startBake(
  sku: string,
  referenceImagePath: string,
  opts: StartBakeOptions = {},
): Promise<{ id: string }> {
  const glbPath = meshPathForSku(sku);
  if (!fs.existsSync(glbPath)) {
    throw new Error(`No local mesh for style ${sku}. Only ${MESH_DIR} styles have a real 3D preview.`);
  }

  const form = new FormData();
  appendFileField(form, "glb", glbPath);
  appendFileField(form, "reference", referenceImagePath);
  if (opts.backImagePath) appendFileField(form, "backImg", opts.backImagePath);
  if (opts.leftImagePath) appendFileField(form, "leftImg", opts.leftImagePath);
  if (opts.rightImagePath) appendFileField(form, "rightImg", opts.rightImagePath);

  // "match" mode projects artwork onto the selected GLB. When a back or side
  // was not uploaded, the dependent service first renders that exact GLB view
  // and synthesizes artwork against its silhouette. It therefore never
  // invents a generic jersey cut. When customer views are supplied they are
  // sent as manual views and take precedence over generation.
  const generatedViews = opts.generatedViews ?? [];
  const mode = opts.mode ?? "match";
  form.append("mode", mode);
  form.append("gemini", generatedViews.length > 0 || mode === "transfer" ? "true" : "false");
  if (generatedViews.length > 0) form.append("views", generatedViews.join(","));
  if (opts.sleeveMarks?.left || opts.sleeveMarks?.right) {
    form.append("sleeveMarks", JSON.stringify(opts.sleeveMarks));
  }
  if (opts.viewIslandMap) form.append("viewIslandMap", JSON.stringify(opts.viewIslandMap));

  const res = await fetch(`${RETEXTURE_URL}/api/jobs`, { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(body.error || `Retexture service returned ${res.status}`);
  }
  return res.json();
}

export async function getBakeStatus(id: string): Promise<BakeStatus> {
  const res = await fetch(`${RETEXTURE_URL}/api/jobs/${id}`, { cache: "no-store" });
  if (!res.ok) {
    if (res.status === 404) throw new Error("No such bake job (the retexture service may have restarted).");
    throw new Error(`Retexture service returned ${res.status}`);
  }
  const status = (await res.json()) as BakeStatus;
  if (status.status === "done" && status.files.includes("glb")) {
    status.glbUrl = `/api/bake/${id}/file/glb`;
  }
  return status;
}

export async function fetchBakeFile(id: string, name: string): Promise<Response> {
  const res = await fetch(`${RETEXTURE_URL}/api/jobs/${id}/files/${name}`);
  if (!res.ok) throw new Error(`Retexture service returned ${res.status} for file ${name}`);
  return res;
}

export function isRetextureServiceUrlConfigured(): boolean {
  return Boolean(RETEXTURE_URL);
}

export { RETEXTURE_URL };
