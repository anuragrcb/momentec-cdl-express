import { NextRequest, NextResponse } from "next/server";
import { saveMockupRequest } from "@/lib/store";
import type { MockupRequest } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || !body.analysis || !body.chosenStyle || !body.images?.front) {
    return NextResponse.json(
      { error: "Expected JSON body { images, analysis, chosenStyle, comments, knownStyleNumber?, bake? }." },
      { status: 400 },
    );
  }

  const record = await saveMockupRequest({
    images: body.images,
    knownStyleNumber: body.knownStyleNumber || undefined,
    analysis: body.analysis,
    chosenStyle: body.chosenStyle,
    bake: body.bake || undefined,
    artworkIntelligence: body.artworkIntelligence || undefined,
    artworkPackage: body.artworkPackage || undefined,
    orderPayload: {
      version: "cdl-express/v1",
      source: "JourneyAX CDL Express",
      product: {
        styleNumber: body.chosenStyle.parentSku,
        styleName: body.chosenStyle.name,
      },
      artwork: {
        activeViews: body.images,
        originalViews: body.originalImages || undefined,
        generatedViews: body.bake?.generatedViews || [],
        analysis: body.analysis,
        intelligence: body.artworkIntelligence || undefined,
        package: body.artworkPackage || undefined,
      },
      customerInstructions: body.comments || "",
      artistReviewRequired: true,
    },
    comments: body.comments || "",
  } as Omit<MockupRequest, "id" | "createdAt" | "status">);

  return NextResponse.json({ request: record }, { status: 201 });
}
