import { NextRequest, NextResponse } from "next/server";
import { extractArtworkIntelligence } from "@/lib/artwork-intelligence";
import { J180A_ZONES } from "@/lib/j180a-zones";
import { extractGarmentAssets, isMagnificAssetExtractorConfigured } from "@/lib/magnific-asset-extractor";
import { saveArtworkPackageFile } from "@/lib/artwork-package-store";
import { readUpload } from "@/lib/upload-store";
import type {
  ArtworkAnalysis,
  ArtworkPackage,
  ArtworkRegion,
  ArtworkView,
  SourceArtworkAsset,
  VectorPackageAsset,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const SLOTS: ArtworkView[] = ["front", "back", "left", "right"];

async function assetFromUrl(view: ArtworkView, rawUrl: string): Promise<{ sessionId: string; buffer: Buffer; mimeType: string }> {
  let cleanPath = rawUrl;
  try {
    const parsed = new URL(rawUrl, "http://localhost");
    cleanPath = parsed.pathname;
  } catch {}

  const match = cleanPath.match(
    new RegExp(`^/api/uploads/([a-zA-Z0-9_-]+)/(${view}(?:-prepared|-generated)?\\.(png|jpg|jpeg|webp))$`),
  );
  if (match) {
    const [, sessionId, filename, extension] = match;
    const file = await readUpload(sessionId, filename);
    if (!file) throw new Error(`${view} artwork is no longer available.`);
    return {
      sessionId,
      buffer: file.buffer,
      mimeType: file.contentType || (extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : "image/jpeg"),
    };
  }

  // Fallback pattern matching
  const parts = cleanPath.split("/").filter(Boolean);
  const uploadsIdx = parts.indexOf("uploads");
  if (uploadsIdx !== -1 && parts.length >= uploadsIdx + 3) {
    const sessionId = parts[uploadsIdx + 1];
    const filename = parts[uploadsIdx + 2];
    const file = await readUpload(sessionId, filename);
    if (file) {
      const ext = filename.split(".").pop()?.toLowerCase();
      return {
        sessionId,
        buffer: file.buffer,
        mimeType: file.contentType || (ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg"),
      };
    }
  }

  throw new Error(`${view} artwork must be an asset returned by the upload pipeline.`);
}

function sourceAsset(region: ArtworkRegion): SourceArtworkAsset {
  return {
    id: region.id,
    view: region.view,
    type: region.type,
    name: region.value || region.type.replaceAll("-", " "),
    content: region.value,
    placement: region.placement,
    locationCode: region.locationCode,
    locationLabel: region.locationLabel,
    previewUrl: region.extractedAssetUrl,
    confidence: region.confidence,
    dynamic: region.type === "player-name" || region.type === "player-number",
  };
}

function packageUrl(sessionId: string, filename: string, download = false): string {
  return `/api/artwork-packages/${sessionId}/${filename}${download ? "?download=1" : ""}`;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.images?.front || typeof body.images.front !== "string") {
    return NextResponse.json({ error: "An approved front artwork image is required." }, { status: 400 });
  }

  try {
    const views = await Promise.all(
      SLOTS.filter((view) => typeof body.images[view] === "string").map(async (view) => {
        const asset = await assetFromUrl(view, body.images[view]);
        return {
          view,
          sessionId: asset.sessionId,
          buffer: asset.buffer,
          mimeType: asset.mimeType,
        };
      }),
    );
    const sessionId = views[0].sessionId;
    if (views.some((view) => view.sessionId !== sessionId)) {
      return NextResponse.json({ error: "All approved views must belong to the same design session." }, { status: 400 });
    }

    const sku = typeof body.sku === "string" ? body.sku.toUpperCase() : "";
    const zones = sku === "J180A"
      ? J180A_ZONES.map((zone) => ({ code: zone.code, meaning: zone.meaning, panel: zone.panel }))
      : [];
    const intelligence = await extractArtworkIntelligence(views, zones);
    const analysis = body.analysis as ArtworkAnalysis | undefined;
    const sourceAssets = (analysis?.regions ?? []).map(sourceAsset);

    let artworkPackage: ArtworkPackage = {
      status: "metadata_only",
      provider: "local-analysis",
      sourceAssets,
      vectorAssets: [],
      generatedAt: new Date().toISOString(),
      message: "All detected source-view references are ready. Configure Magnific MCP to add the four editable SVG deliverables.",
    };

    if (isMagnificAssetExtractorConfigured()) {
      try {
        const extracted = await extractGarmentAssets(views);
        const vectorAssets: VectorPackageAsset[] = [];
        for (const asset of extracted.assets) {
          await saveArtworkPackageFile(sessionId, asset.filename, asset.svgContent, "image/svg+xml; charset=utf-8");
          vectorAssets.push({
            id: asset.id,
            kind: asset.kind,
            name: asset.name,
            description: asset.description,
            filename: asset.filename,
            previewUrl: packageUrl(sessionId, asset.filename),
            downloadUrl: packageUrl(sessionId, asset.filename, true),
          });
        }
        await saveArtworkPackageFile(sessionId, "artwork-package.zip", extracted.zipBuffer, "application/zip");
        artworkPackage = {
          status: "complete",
          provider: "magnific-mcp",
          sourceAssets,
          vectorAssets,
          zipDownloadUrl: packageUrl(sessionId, "artwork-package.zip", true),
          generatedAt: new Date().toISOString(),
          message: `${vectorAssets.length} editable SVG reference files are ready for Illustrator review.`,
        };
      } catch (error) {
        artworkPackage = {
          status: "failed",
          provider: "local-analysis",
          sourceAssets,
          vectorAssets: [],
          generatedAt: new Date().toISOString(),
          message: `The source-view assets are ready, but Magnific could not finish the vector package: ${error instanceof Error ? error.message : "unknown provider error"}`,
        };
      }
    }

    return NextResponse.json({
      intelligence,
      package: artworkPackage,
      zonesApplied: zones.length > 0 ? sku : null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to extract artwork details." },
      { status: 502 },
    );
  }
}
