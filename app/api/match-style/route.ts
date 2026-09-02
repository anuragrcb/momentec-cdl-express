import { NextRequest, NextResponse } from "next/server";
import { findStyleBySku, matchStyles } from "@/lib/catalogue";
import type { ArtworkAnalysis } from "@/lib/types";
import { hasApparel3dPreview } from "@/lib/apparel-assets";
import { normalizeStyleNumber } from "@/lib/style-identity";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const analysis = body?.analysis as ArtworkAnalysis | undefined;
  if (!analysis) {
    return NextResponse.json({ error: "Expected JSON body { analysis }." }, { status: 400 });
  }

  const knownStyleNumber = typeof body?.knownStyleNumber === "string" ? normalizeStyleNumber(body.knownStyleNumber) : "";
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

  const first = matches[0];
  const second = matches[1];
  const scoreMargin = first ? first.score - (second?.score ?? 0) : 0;
  const enteredStyleIsValid = Boolean(knownStyleNumber && first?.style.parentSku === knownStyleNumber);
  const decisiveImageMatch = Boolean(
    !knownStyleNumber &&
    first?.has3dPreview &&
    first.score >= 90 &&
    scoreMargin >= 35,
  );
  const mediumImageMatch = Boolean(
    !knownStyleNumber &&
    first?.has3dPreview &&
    first.score >= 60 &&
    scoreMargin >= 20,
  );

  return NextResponse.json({
    matches,
    normalizedKnownStyleNumber: knownStyleNumber || null,
    recommendation: {
      sku: enteredStyleIsValid || decisiveImageMatch || mediumImageMatch ? first?.style.parentSku ?? null : null,
      confidence: enteredStyleIsValid || decisiveImageMatch ? "high" : mediumImageMatch ? "medium" : "low",
      // An explicit verified SKU and a decisive image match are safe defaults.
      // Ambiguous candidates stay unselected for a human decision.
      autoSelected: enteredStyleIsValid || decisiveImageMatch,
      scoreMargin,
      reason: enteredStyleIsValid
        ? "The supplied style number was verified against the configured catalogue."
        : decisiveImageMatch
          ? "The uploaded garment construction decisively matches this verified 3D style."
          : mediumImageMatch
            ? "This is the strongest construction match, but confirmation is required."
            : "The uploaded image does not distinguish one verified garment strongly enough for automatic selection.",
    },
  });
}
