import { NextRequest, NextResponse } from "next/server";
import { analyzeArtwork } from "@/lib/gemini";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("front");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A front image is required (field: front)." }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "front must be an image file." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const analysis = await analyzeArtwork(buffer, file.type);
    return NextResponse.json({ analysis });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
