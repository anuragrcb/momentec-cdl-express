import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { generateProof, type TripoInput, type TripoView } from "@/lib/tripo";

export const runtime = "nodejs";
// a 4-view standard run measured ~172s, and it lingers near 99% while the
// texture bakes, so allow well beyond the observed worst case
export const maxDuration = 600;

const VIEWS: TripoView[] = ["front", "left", "back", "right"];

/**
 * POST /api/tripo-proof
 *   { sessionId, views: { front: "/api/uploads/.../front.webp", ... } }
 *
 * Generates a photoreal 3D proof from the customer's views via Tripo and
 * stores the .glb beside the uploads.
 *
 * This SPENDS CREDITS (~30 per run). It is fired automatically, once per
 * session, right after upload lands (see runTripoProof in app/design/page.tsx) -
 * the caller there guards against re-firing on re-render.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
    return NextResponse.json({ error: "A valid sessionId is required." }, { status: 400 });
  }
  const dir = path.join(process.cwd(), "data", "uploads", sessionId);

  const inputs: TripoInput[] = [];
  for (const view of VIEWS) {
    const url = body?.views?.[view];
    if (typeof url !== "string") continue;
    // only accept a URL this pipeline issued for this session. "-generated" is
    // allowed: a model-invented view is still a legitimate input here, and it
    // stays labelled as generated everywhere the customer sees it.
    const m = url.match(
      new RegExp(`^/api/uploads/${sessionId}/(${view}(?:-generated|-prepared)?\\.(png|jpg|jpeg|webp))$`),
    );
    if (!m) continue;
    const ext = m[2];
    const file = path.join(dir, m[1]);
    try {
      await fs.access(file);
      inputs.push({
        view,
        path: file,
        mime: ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg",
      });
    } catch {
      /* view not on disk - skip it rather than fail the whole run */
    }
  }

  if (!inputs.some((i) => i.view === "front")) {
    return NextResponse.json({ error: "A front view is required." }, { status: 400 });
  }
  if (inputs.length < 2) {
    return NextResponse.json(
      { error: "At least two views are required. Upload or generate the missing ones first." },
      { status: 400 },
    );
  }

  const result = await generateProof(inputs);
  if (result.status !== "success" || !result.modelUrl) {
    return NextResponse.json({ error: result.message, status: result.status }, { status: 502 });
  }

  // pull the glb local so the viewer is not dependent on Tripo's CDN link,
  // which is time-limited
  const glb = Buffer.from(await (await fetch(result.modelUrl)).arrayBuffer());
  await fs.writeFile(path.join(dir, "tripo-proof.glb"), glb);

  let previewUrl: string | undefined;
  if (result.previewUrl) {
    try {
      const png = Buffer.from(await (await fetch(result.previewUrl)).arrayBuffer());
      await fs.writeFile(path.join(dir, "tripo-preview.webp"), png);
      previewUrl = `/api/uploads/${sessionId}/tripo-preview.webp`;
    } catch {
      /* preview is a nicety, not required */
    }
  }

  return NextResponse.json({
    status: "success",
    glbUrl: `/api/uploads/${sessionId}/tripo-proof.glb`,
    previewUrl,
    viewsUsed: inputs.map((i) => i.view),
    seconds: result.seconds,
    creditsUsed:
      result.creditsBefore != null && result.creditsAfter != null
        ? result.creditsBefore - result.creditsAfter
        : undefined,
    creditsRemaining: result.creditsAfter,
    bytes: glb.length,
  });
}
