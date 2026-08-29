import fs from "node:fs/promises";

/**
 * Tripo3D multiview-to-model client.
 *
 * WHY THIS EXISTS
 * ---------------
 * The panel-cut proof (components/J180AProof.tsx) places artwork using
 * Augusta's own published panel geometry, which is correct for PLACEMENT but
 * never looked right as a picture: J180A is a set-in-sleeve jersey and most
 * customer artwork is drawn raglan, so the shoulder/sleeve seam never
 * reconciles and those panels stay bare.
 *
 * Tripo solves the opposite half - it generates geometry that already fits the
 * artwork, instead of forcing artwork onto geometry that does not. Measured on
 * the real Thunder jersey:
 *
 *   2 views, texture_quality standard                       140s  30 credits  logos muddy
 *   2 views, texture_quality extreme                         300s  70 credits  logos sharp
 *   4 views, texture_quality standard                        172s  30 credits  logos sharp, front/back seam bleeds
 *   4 views, texture_quality standard, geometry_quality detailed   logos sharp, no bleed  <- default
 *
 * More VIEWS beat higher quality settings, at less than half the time and 43%
 * of the credits. Tripo's own docs say the same ("multiple angles improve
 * geometry accuracy and texture coverage"), so 4 views at standard is the
 * default here. geometry_quality:"detailed" was added on top after the
 * standard-geometry 4-view run showed front artwork bleeding across the
 * shoulder/side seam into the back panel on the real Thunder jersey.
 *
 * WHAT THIS IS NOT
 * ----------------
 * The returned mesh has its texture BAKED IN. There are no named panels, no
 * decoration zones, no per-size rules. It is a proof a customer can look at -
 * it is not a production file, it cannot be re-decorated, and it must never be
 * presented as an approved artwork package. The zone codes from
 * lib/j180a-zones.ts remain the thing production acts on.
 *
 * There is NO text prompt for this endpoint - it is purely image-driven.
 */

/*
 * geometry_quality "detailed" (2026-08-28): with the default (unset)
 * geometry quality, front/back artwork sometimes bled across the
 * shoulder/side seam in the baked texture (confirmed on the real Thunder
 * jersey - "RELENTLESS" showing muddled with "Thunder"/"24" on the same
 * face). Re-ran the identical 4 real session images with
 * geometry_quality:"detailed" added and the bleed was gone on both front
 * and back - now the default.
 */
const BASE = "https://openapi.tripo3d.ai/v3";
/** latest H-series multiview model, confirmed live */
const MODEL = "v3.1-20260211";

export type TripoView = "front" | "left" | "back" | "right";

export interface TripoResult {
  status: "success" | "failed" | "unavailable";
  /** local URL of the downloaded .glb, when successful */
  modelUrl?: string;
  /** Tripo's own preview render */
  previewUrl?: string;
  taskId?: string;
  seconds?: number;
  creditsBefore?: number;
  creditsAfter?: number;
  message: string;
}

function key(): string | undefined {
  return process.env.TRIPO_API_KEY;
}

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key()}`, ...(init?.headers ?? {}) },
  });
  return res.json();
}

export async function balance(): Promise<number | null> {
  if (!key()) return null;
  try {
    const j = await api("/account/balance");
    return typeof j?.data?.balance === "number" ? j.data.balance : null;
  } catch {
    return null;
  }
}

/** Uploads one image and returns its file_token. */
async function uploadFile(bytes: Buffer, filename: string, mime: string): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type: mime }), filename);
  const j = await api("/files", { method: "POST", body: form });
  const token = j?.data?.file_token;
  if (!token) throw new Error(j?.message || "Tripo rejected the image upload.");
  return token;
}

export interface TripoInput {
  view: TripoView;
  path?: string;
  buffer?: Buffer;
  mime: string;
}

/**
 * Runs a full multiview generation and waits for it.
 *
 * `front` is required by the API and at least two views are needed; the more
 * real views supplied, the better the result. Polls rather than using a
 * webhook because this app has no public callback URL in development.
 */
export async function generateProof(
  inputs: TripoInput[],
  opts: { onProgress?: (pct: number) => void; timeoutMs?: number } = {},
): Promise<TripoResult> {
  if (!key()) {
    return { status: "unavailable", message: "TRIPO_API_KEY is not set, so no 3D proof was generated." };
  }
  const front = inputs.find((i) => i.view === "front");
  if (!front) return { status: "failed", message: "A front view is required." };
  if (inputs.length < 2) {
    return { status: "failed", message: "At least two views are required - front plus one more." };
  }

  const started = Date.now();
  const creditsBefore = (await balance()) ?? undefined;

  try {
    // upload every view, then reference them by token
    const tokens: Partial<Record<TripoView, string>> = {};
    for (const input of inputs) {
      const bytes = input.buffer || (input.path ? await fs.readFile(input.path) : null);
      if (!bytes) throw new Error(`No image data for ${input.view}`);
      tokens[input.view] = await uploadFile(bytes, `${input.view}.img`, input.mime);
    }

    // view-key form: order does not matter, the server canonicalises it
    const body = {
      model: MODEL,
      inputs: (["front", "left", "back", "right"] as TripoView[])
        .filter((v) => tokens[v])
        .map((v) => ({ [v]: { file_token: tokens[v]! } })),
      texture_alignment: "original_image",
      // standard, not extreme: with 4 views this matches extreme's sharpness at
      // ~half the time and 43% of the credits (measured, see file header)
      texture_quality: "standard",
      // detailed geometry stops the front/back seam bleed - see file header
      geometry_quality: "detailed",
      pbr: true,
      face_limit: 50000,
    };

    const submit = await api("/generation/multiview-to-model", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const taskId = submit?.data?.task_id;
    if (!taskId) {
      return { status: "failed", message: submit?.message || "Tripo did not accept the generation request." };
    }

    // poll - a 4-view standard run measured ~172s, and it sits at 99% for a
    // while at the end while the texture bakes, so the timeout is generous
    const timeout = opts.timeoutMs ?? 8 * 60 * 1000;
    for (;;) {
      if (Date.now() - started > timeout) {
        return { status: "failed", taskId, message: `Timed out after ${Math.round((Date.now() - started) / 1000)}s.` };
      }
      await new Promise((r) => setTimeout(r, 5000));
      const t = await api(`/tasks/${taskId}`);
      const d = t?.data ?? {};
      if (typeof d.progress === "number") opts.onProgress?.(d.progress);
      if (d.status === "success") {
        return {
          status: "success",
          taskId,
          modelUrl: d.output?.model_url,
          previewUrl: d.output?.rendered_image_url,
          seconds: Math.round((Date.now() - started) / 1000),
          creditsBefore,
          creditsAfter: (await balance()) ?? undefined,
          message: "3D proof generated.",
        };
      }
      if (["failed", "banned", "expired", "cancelled"].includes(d.status)) {
        return { status: "failed", taskId, message: `Tripo reported "${d.status}".` };
      }
    }
  } catch (err) {
    return { status: "failed", message: err instanceof Error ? err.message : "Tripo request failed." };
  }
}
