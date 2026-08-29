import { NextRequest, NextResponse } from "next/server";
import { generateMissingViews, type SuppliedView } from "@/lib/view-generation";
import type { ArtworkView } from "@/lib/types";
import { readUpload, saveUpload } from "@/lib/upload-store";

export const runtime = "nodejs";
// image generation is slow; well under Next's default but worth being explicit
export const maxDuration = 120;

const VIEWS: ArtworkView[] = ["front", "back", "left", "right"];

/**
 * POST /api/generate-views
 *   { sessionId, views: { front: "/api/uploads/.../front.jpg", ... } }
 *
 * Generates the views the customer did NOT upload, using the ones they did as
 * reference, and writes them alongside the uploads.
 *
 * Generated files are named `<view>-generated.png`, deliberately NOT
 * `<view>.png`. That keeps them distinguishable from a real upload on disk, in
 * the URL, and in anything that later reads the session directory - a
 * fabricated view should never be able to pass as a photograph of the real
 * garment just because it sits in the same folder.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
    return NextResponse.json({ error: "A valid sessionId is required." }, { status: 400 });
  }
  const supplied: SuppliedView[] = [];
  const missing: ArtworkView[] = [];

  for (const view of VIEWS) {
    const url = body?.views?.[view];
    if (typeof url !== "string") {
      missing.push(view);
      continue;
    }
    // only accept a URL this pipeline itself issued for this session
    const match = url.match(new RegExp(`^/api/uploads/${sessionId}/(${view}\\.(png|jpg|jpeg|webp))$`));
    if (!match) {
      missing.push(view);
      continue;
    }
    const ext = match[2];
    try {
      const file = await readUpload(sessionId, match[1]);
      if (!file) throw new Error("missing upload");
      supplied.push({
        view,
        buffer: file.buffer,
        mimeType: file.contentType || (ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg"),
      });
    } catch {
      missing.push(view);
    }
  }

  if (supplied.length === 0) {
    return NextResponse.json({ error: "At least one uploaded view is required." }, { status: 400 });
  }

  const result = await generateMissingViews(supplied, missing);

  const urls: Partial<Record<ArtworkView, string>> = {};
  const notes: Partial<Record<ArtworkView, string>> = {};
  for (const g of result.generated) {
    const filename = `${g.view}-generated.png`;
    urls[g.view] = await saveUpload(sessionId, filename, g.buffer, "image/png");
    notes[g.view] = g.note;
  }

  return NextResponse.json({
    status: result.status,
    message: result.message,
    generatedViews: result.generated.map((g) => g.view),
    stillMissing: result.stillMissing,
    urls,
    notes,
  });
}
