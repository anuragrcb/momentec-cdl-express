import { NextRequest, NextResponse } from "next/server";
import { analyzeArtwork } from "@/lib/gemini";
import { J180A_ZONES } from "@/lib/j180a-zones";
import type { ArtworkRegion, ArtworkView } from "@/lib/types";
import sharp from "sharp";
import { readUpload, saveUpload } from "@/lib/upload-store";
import { normalizeStyleNumber } from "@/lib/style-identity";

export const runtime = "nodejs";
const VIEWS: ArtworkView[] = ["front", "back", "left", "right"];

function contentTypeFromFilename(filename: string): string {
  if (filename.endsWith(".png")) return "image/png";
  if (filename.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

async function readUploadedView(slot: ArtworkView, imageUrl: string): Promise<{
  buffer: Buffer;
  mimeType: string;
  filename: string;
  sessionId: string;
}> {
  const match = imageUrl.match(
    new RegExp(`^/api/uploads/([a-zA-Z0-9_-]+)/(${slot}\\.(?:png|jpg|jpeg|webp))$`),
  );
  if (!match) throw new Error(`${slot}ImageUrl must be the original ${slot} image returned by /api/upload.`);
  const [, sessionId, filename] = match;
  const file = await readUpload(sessionId, filename);
  if (!file) throw new Error(`${slot} artwork is no longer available.`);
  return { buffer: file.buffer, mimeType: file.contentType || contentTypeFromFilename(filename), filename, sessionId };
}

async function extractRegionAssets(
  sessionId: string,
  views: Array<{ view: ArtworkView; buffer: Buffer; filename: string }>,
  regions: ArtworkRegion[],
): Promise<ArtworkRegion[]> {
  if (!regions.length) return regions;
  await saveUpload(sessionId, "region-manifest.json", JSON.stringify({
    views: Object.fromEntries(views.map((asset) => [asset.view, asset.filename])),
    regions,
  }, null, 2), "application/json");

  const viewByName = new Map(views.map((asset) => [asset.view, asset]));
  const output: ArtworkRegion[] = [];
  for (const [index, region] of regions.entries()) {
    const source = viewByName.get(region.view);
    if (!source) {
      output.push({ ...region, extractionNote: "The matching source view was unavailable; use the full view for artist review." });
      continue;
    }
    try {
      const metadata = await sharp(source.buffer).metadata();
      const width = metadata.width ?? 0;
      const height = metadata.height ?? 0;
      if (!width || !height) throw new Error("Image dimensions are unavailable.");
      const bleedX = Math.max(4, Math.round(width * 0.012));
      const bleedY = Math.max(4, Math.round(height * 0.012));
      const left = Math.max(0, Math.floor(region.box.x * width) - bleedX);
      const top = Math.max(0, Math.floor(region.box.y * height) - bleedY);
      const right = Math.min(width, Math.ceil((region.box.x + region.box.width) * width) + bleedX);
      const bottom = Math.min(height, Math.ceil((region.box.y + region.box.height) * height) + bleedY);
      if (right <= left || bottom <= top) throw new Error("The detected region has no visible area.");
      const crop = await sharp(source.buffer)
        .extract({ left, top, width: right - left, height: bottom - top })
        .png({ compressionLevel: 9 })
        .toBuffer();
      const safeId = region.id.toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
      const filename = `${String(index + 1).padStart(2, "0")}-${safeId}.png`;
      const extractedAssetUrl = await saveUpload(sessionId, filename, crop, "image/png");
      output.push({ ...region, extractedAssetUrl, extractionNote: "Reference crop generated from the original approved view." });
    } catch (error) {
      output.push({ ...region, extractionNote: `Crop unavailable: ${error instanceof Error ? error.message : "unknown image error"}` });
    }
  }
  return output;
}

export async function POST(req: NextRequest) {
  try {
    if (req.headers.get("content-type")?.includes("application/json")) {
      const body = await req.json().catch(() => null);
      if (typeof body?.frontImageUrl !== "string") {
        return NextResponse.json({ error: "Expected JSON body { frontImageUrl }." }, { status: 400 });
      }
      const uploaded = [];
      for (const view of VIEWS) {
        const imageUrl = body?.[`${view}ImageUrl`];
        if (typeof imageUrl === "string") uploaded.push({ view, ...(await readUploadedView(view, imageUrl)) });
      }
      const sessionId = uploaded[0].sessionId;
      if (uploaded.some((asset) => asset.sessionId !== sessionId)) {
        return NextResponse.json({ error: "All supplied views must belong to the same upload session." }, { status: 400 });
      }
      // Only styles that publish a real decoration-zone list get zone-coded
      // placement. J180A does (from its own decorations SVG); anything else
      // passes an empty list so regions come back with locationCode: null
      // rather than a code borrowed from a different garment.
      const sku = typeof body.sku === "string" ? normalizeStyleNumber(body.sku) : "";
      const zones = sku === "J180A"
        ? J180A_ZONES.map((z) => ({ code: z.code, meaning: z.meaning, panel: z.panel }))
        : [];
      const analysis = await analyzeArtwork(
        uploaded.map(({ view, buffer, mimeType }) => ({ view, buffer, mimeType })),
        zones,
      );
      analysis.regions = await extractRegionAssets(
        sessionId,
        uploaded.map(({ view, buffer, filename }) => ({ view, buffer, filename })),
        analysis.regions,
      );
      return NextResponse.json({ analysis });
    } else {
      const form = await req.formData();
      const file = form.get("front");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "A front image is required (field: front)." }, { status: 400 });
      }
      if (!file.type.startsWith("image/")) {
        return NextResponse.json({ error: "front must be an image file." }, { status: 400 });
      }
      const analysis = await analyzeArtwork([{ view: "front", buffer: Buffer.from(await file.arrayBuffer()), mimeType: file.type }]);
      return NextResponse.json({ analysis });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
