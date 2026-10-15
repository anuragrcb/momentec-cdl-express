import { NextRequest, NextResponse } from "next/server";
import { CatalogMatchError, matchCatalogGarment } from "@/lib/catalog-match";

export const runtime = "nodejs";
export const maxDuration = 180;

const MIME: Record<string, string> = {
  "image/png": "image/png",
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/webp": "image/webp",
};

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const photo = form?.get("photo");
  if (!(photo instanceof File) || photo.size === 0) {
    return NextResponse.json({ error: "Upload a design photo first." }, { status: 400 });
  }
  const mimeType = MIME[photo.type];
  if (!mimeType) return NextResponse.json({ error: "Use a jpg, png, or webp image." }, { status: 400 });

  const genderValue = form?.get("gender");
  const gender = typeof genderValue === "string" ? genderValue : "";
  const categoryValue = form?.get("category");
  const category = typeof categoryValue === "string" ? categoryValue : "";

  try {
    const photoBytes = Buffer.from(await photo.arrayBuffer());
    const matched = await matchCatalogGarment(photoBytes, mimeType, { gender, category });
    return NextResponse.json({
      query: matched.query,
      style: matched.style,
      matches: matched.matches,
      plan: matched.plan,
    });
  } catch (error) {
    if (error instanceof CatalogMatchError) {
      return NextResponse.json(
        {
          error: error.message,
          query: error.query,
          style: null,
          matches: error.matches,
        },
        { status: error.status },
      );
    }
    console.error("upload-ai-design match failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Could not find a closest garment." }, { status: 502 });
  }
}
