import { NextRequest, NextResponse } from "next/server";
import { prepareArtwork } from "@/lib/magnific";
import type { PreparedArtwork } from "@/lib/types";
import { listUploads, readUpload, saveUpload, uploadUrl } from "@/lib/upload-store";

export const runtime = "nodejs";

const SLOT_RE = /^(front|back|left|right)$/;

// Runs the "Prepare artwork" step (Magnific background removal + optional
// precision upscale) on an already-uploaded reference image and persists the
// result next to the original as data/uploads/<sessionId>/<slot>-prepared.<ext>,
// served back through the same GET /api/uploads/... route as everything else.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const sessionId = body?.sessionId;
  const rawSlot = body?.slot;
  const slot = typeof rawSlot === "string" && SLOT_RE.test(rawSlot) ? rawSlot : "front";

  if (typeof sessionId !== "string" || !/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
    return NextResponse.json({ error: "A valid sessionId is required." }, { status: 400 });
  }

  const entries = await listUploads(sessionId);
  const originalFilename = entries.find((f) => f.startsWith(`${slot}.`) && !f.includes("-prepared"));
  if (!originalFilename) {
    return NextResponse.json({ error: `No uploaded ${slot} image found for session ${sessionId}.` }, { status: 404 });
  }

  const original = await readUpload(sessionId, originalFilename);
  if (!original) return NextResponse.json({ error: "Uploaded artwork is no longer available." }, { status: 404 });
  const buffer = original.buffer;
  const ext = originalFilename.split(".").pop()!.toLowerCase();
  const mimeType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  const originalUrl = uploadUrl(sessionId, originalFilename);

  let result;
  try {
    result = await prepareArtwork(buffer, mimeType);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Artwork prep failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  let preparedUrl = originalUrl;
  if (result.status === "prepared") {
    const preparedExt = result.mimeType === "image/png" ? "png" : ext;
    const preparedFilename = `${slot}-prepared.${preparedExt}`;
    preparedUrl = await saveUpload(sessionId, preparedFilename, result.buffer, result.mimeType);
  }

  const prepared: PreparedArtwork = {
    status: result.status,
    originalUrl,
    preparedUrl,
    backgroundRemoved: result.backgroundRemoved,
    upscaled: result.upscaled,
    originalDimensions: result.originalDimensions,
    preparedDimensions: result.finalDimensions,
    message: result.message,
  };

  return NextResponse.json({ prepared });
}
