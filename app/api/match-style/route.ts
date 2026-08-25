import { NextRequest, NextResponse } from "next/server";
import { matchStyles } from "@/lib/catalogue";
import type { ArtworkAnalysis } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const analysis = body?.analysis as ArtworkAnalysis | undefined;
  if (!analysis) {
    return NextResponse.json({ error: "Expected JSON body { analysis }." }, { status: 400 });
  }

  const knownStyleNumber = typeof body?.knownStyleNumber === "string" ? body.knownStyleNumber.trim() : "";
  const matches = matchStyles(analysis, 8);

  // If the customer already told us their style number, surface it first
  // (if it exists in the catalogue) regardless of how the keyword score lands.
  if (knownStyleNumber) {
    const idx = matches.findIndex((m) => m.style.parentSku === knownStyleNumber);
    if (idx > 0) {
      const [known] = matches.splice(idx, 1);
      matches.unshift(known);
    }
  }

  return NextResponse.json({ matches });
}
