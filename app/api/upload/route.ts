import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

const ALLOWED_FIELDS = new Set(["front", "back", "left", "right"]);

// Saves the customer's uploaded reference image(s) under data/uploads/<sessionId>/
// (private, outside public/) so later steps (bake, submit) can reference them by
// an API URL. Files are streamed back out through GET /api/uploads/[sessionId]/[filename]
// rather than Next's public/ static file serving - this is a local dev-grade
// store, not a production asset pipeline.
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const sessionId = (form.get("sessionId") as string) || randomUUID().slice(0, 8);

  const dir = path.join(process.cwd(), "data", "uploads", sessionId);
  await fs.mkdir(dir, { recursive: true });

  const urls: Record<string, string> = {};
  for (const field of ALLOWED_FIELDS) {
    const file = form.get(field);
    if (!(file instanceof File)) continue;
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: `${field} must be an image file.` }, { status: 400 });
    }
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const filename = `${field}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(path.join(dir, filename), buffer);
    urls[field] = `/api/uploads/${sessionId}/${filename}`;
  }

  if (!urls.front) {
    return NextResponse.json({ error: "A front image is required (field: front)." }, { status: 400 });
  }

  return NextResponse.json({ sessionId, urls });
}
