import { NextRequest, NextResponse } from "next/server";
import { getApparelAssetDescriptor } from "@/lib/apparel-assets";
import { startBake } from "@/lib/retexture-client";
import path from "node:path";

export const runtime = "nodejs";

// Resolves one of this app's own /api/uploads/<sessionId>/<slot>.<ext> URLs
// (as saved by POST /api/upload) back to the local file it points at. Used
// for front (required) and back/left/right (optional).
function resolveUploadUrl(slot: "front" | "back" | "left" | "right", url: string): string {
  const re = new RegExp(`^/api/uploads/([a-zA-Z0-9_-]+)/(${slot}(?:-prepared)?\\.(?:png|jpg|jpeg|webp))$`);
  const match = url.match(re);
  if (!match) {
    throw new Error(`${slot}ImageUrl must be a path returned by /api/upload.`);
  }
  const [, sessionId, filename] = match;
  return path.join(process.cwd(), "data", "uploads", sessionId, filename);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const sku = body?.sku as string | undefined;
  const frontImageUrl = body?.frontImageUrl as string | undefined; // e.g. /api/uploads/<sessionId>/front.png
  // Optional - same session's back/left/right uploads, if the customer
  // provided them in step 1. Wired through to the retexture service's
  // backImg/leftImg/rightImg fields so they get baked into the atlas too,
  // not just the front panel.
  const backImageUrl = body?.backImageUrl as string | undefined;
  const leftImageUrl = body?.leftImageUrl as string | undefined;
  const rightImageUrl = body?.rightImageUrl as string | undefined;
  const renderMode = body?.renderMode === "transfer" ? "transfer" : "match";
  const sleeveMarks = body?.sleeveMarks as { left?: string; right?: string } | undefined;
  if (!sku || !frontImageUrl) {
    return NextResponse.json({ error: "Expected JSON body { sku, frontImageUrl }." }, { status: 400 });
  }
  const asset = getApparelAssetDescriptor(sku);
  if (asset.previewMode !== "server-baked") {
    return NextResponse.json(
      { error: `Style ${sku} does not have a verified apparel 3D model available yet.` },
      { status: 400 },
    );
  }

  try {
    const localFrontPath = resolveUploadUrl("front", frontImageUrl);
    const missingCustomerViews = (["back", "left", "right"] as const).filter((view) => {
      const supplied = view === "back" ? backImageUrl : view === "left" ? leftImageUrl : rightImageUrl;
      return !supplied;
    });
    const generatedViews = renderMode === "transfer" ? ["front", ...missingCustomerViews] : missingCustomerViews;
    const job = await startBake(sku, localFrontPath, {
      backImagePath: backImageUrl ? resolveUploadUrl("back", backImageUrl) : undefined,
      leftImagePath: leftImageUrl ? resolveUploadUrl("left", leftImageUrl) : undefined,
      rightImagePath: rightImageUrl ? resolveUploadUrl("right", rightImageUrl) : undefined,
      generatedViews: missingCustomerViews,
      mode: renderMode,
      sleeveMarks,
      viewIslandMap: asset.viewIslandMap,
    });
    return NextResponse.json({ ...job, generatedViews }, { status: 202 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start bake.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
