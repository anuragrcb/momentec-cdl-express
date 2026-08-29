import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { saveUpload } from "@/lib/upload-store";

export const runtime = "nodejs";

const ALLOWED_FIELDS = new Set(["front", "back", "left", "right"]);

// Saves the customer's uploaded reference image(s) using the unified upload store
// (Vercel Blob in cloud deployment, local/tmp storage in development) so later steps
// (bake, submit) can reference them by an API URL.
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const sessionId = (form.get("sessionId") as string) || randomUUID().slice(0, 8);

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
    urls[field] = await saveUpload(sessionId, filename, buffer, file.type);
  }

  if (!urls.front) {
    return NextResponse.json({ error: "A front image is required (field: front)." }, { status: 400 });
  }

  return NextResponse.json({ sessionId, urls });
}
