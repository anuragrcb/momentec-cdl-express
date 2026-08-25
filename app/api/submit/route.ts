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

  const record = saveMockupRequest({
    images: body.images,
    knownStyleNumber: body.knownStyleNumber || undefined,
    analysis: body.analysis,
    chosenStyle: body.chosenStyle,
    bake: body.bake || undefined,
    comments: body.comments || "",
  } as Omit<MockupRequest, "id" | "createdAt" | "status">);

  return NextResponse.json({ request: record }, { status: 201 });
}
