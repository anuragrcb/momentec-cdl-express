import { NextRequest, NextResponse } from "next/server";
import { findStyleBySku, matchStyles } from "@/lib/catalogue";
import type { ArtworkAnalysis } from "@/lib/types";
import { hasApparel3dPreview } from "@/lib/apparel-assets";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const analysis = body?.analysis as ArtworkAnalysis | undefined;
  if (!analysis) {
    return NextResponse.json({ error: "Expected JSON body { analysis }." }, { status: 400 });
  }

  const knownStyleNumber = typeof body?.knownStyleNumber === "string" ? body.knownStyleNumber.trim() : "";
  const matches = matchStyles(analysis, 8);

  // A valid customer-entered style number is an explicit business decision,
  // not a suggestion that the image-matching heuristic may hide. Resolve it
  // directly, then keep AI alternatives below it for optional comparison.
  if (knownStyleNumber) {
    const idx = matches.findIndex((m) => m.style.parentSku === knownStyleNumber);
    if (idx >= 0) {
      const [known] = matches.splice(idx, 1);
      matches.unshift({
        ...known,
        score: 100,
        reasons: ["customer-entered style number was verified against the catalogue", ...known.reasons],
        has3dPreview: hasApparel3dPreview(known.style.parentSku),
      });
    } else {
      const knownStyle = findStyleBySku(knownStyleNumber);
      if (knownStyle) {
        matches.unshift({
          style: knownStyle,
          score: 100,
          reasons: ["customer-entered style number was verified against the catalogue"],
          has3dPreview: hasApparel3dPreview(knownStyle.parentSku),
        });
      }
    }
  }

  return NextResponse.json({ matches });
}
