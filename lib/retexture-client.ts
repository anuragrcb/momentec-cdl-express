import fs from "node:fs";
import path from "node:path";
import type { BakeStatus } from "./types";

// Thin proxy client for the sibling, standalone 3d-garment-retexture service.
// Treated as a black-box HTTP service - its real contract (read from its own
// server.js / pipeline.js):
//
//   POST /api/jobs   multipart: glb, reference, + mode, gemini, views, tier,
//                     size, colors, keep, backText  ->  202 { id }
//   GET  /api/jobs/:id             -> { id, status, stage, error, stats, log, files }
//   GET  /api/jobs/:id/files/:name -> raw file bytes ("glb" is always the
//                                     baked model's file label when present)
const RETEXTURE_URL = process.env.RETEXTURE_SERVICE_URL || "http://localhost:3000";

const MESH_DIR = path.join(process.cwd(), "assets", "meshes");

export function meshPathForSku(sku: string): string {
  return path.join(MESH_DIR, `${sku}.glb`);
}

export async function startBake(sku: string, referenceImagePath: string): Promise<{ id: string }> {
  const glbPath = meshPathForSku(sku);
  if (!fs.existsSync(glbPath)) {
    throw new Error(`No local mesh for style ${sku}. Only ${MESH_DIR} styles have a real 3D preview.`);
  }

  const form = new FormData();
  const glbBytes = fs.readFileSync(glbPath);
  const refBytes = fs.readFileSync(referenceImagePath);
  form.append("glb", new Blob([new Uint8Array(glbBytes)]), `${sku}.glb`);
  form.append("reference", new Blob([new Uint8Array(refBytes)]), path.basename(referenceImagePath));
  // "match" mode projects the customer's actual uploaded artwork onto the
  // mesh's front panel - no Gemini call required, so it works even without a
  // GEMINI_API_KEY. We do not request generated back/left/right views here.
  form.append("mode", "match");
  form.append("gemini", "false");

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
