import { NextRequest, NextResponse } from "next/server";
import { suggestGarmentFit } from "@/lib/suggest-fit";

export const runtime = "nodejs";
export const maxDuration = 60;

const MIME: Record<string, string> = {
  "image/png": "image/png",
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/webp": "image/webp",
};

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const value = form?.get("reference");
  if (!(value instanceof File) || value.size === 0) {
    return NextResponse.json({ error: "Upload an image." }, { status: 400 });
  }
  const mimeType = MIME[value.type];
  if (!mimeType) return NextResponse.json({ error: "Use a jpg, png, or webp image." }, { status: 400 });
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "Could not read the garment." }, { status: 503 });
  }

  try {
    const suggestion = await suggestGarmentFit(Buffer.from(await value.arrayBuffer()), mimeType);
    if (!suggestion) return NextResponse.json({ error: "Could not read the garment." }, { status: 422 });
    return NextResponse.json(suggestion);
  } catch (error) {
    console.error("suggest fit failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Could not read the garment." }, { status: 502 });
  }
}
