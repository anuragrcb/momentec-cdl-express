import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { hasAugustaLiveGlb } from "@/lib/types";

export const runtime = "nodejs";

const CONTENT_TYPES: Record<string, string> = {
  glb: "model/gltf-binary",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
};

// Streams only verified model, normal-map and cut-piece reference files for a
// supported Augusta apparel SKU. This is not a generic static file server.
export async function GET(_req: NextRequest, context: { params: Promise<{ sku: string; file: string }> }) {
  const { sku, file } = await context.params;

  if (sku === "J180A") {
    const allowed = new Set([
      "J180A.glb",
      "J180A_S.glb",
      "J180A_M.glb",
      "J180A_L.glb",
      "J180A_XL.glb",
      "J180A_2XL.glb",
      "J180A_3XL.glb",
      "J180A_4XL.glb",
      "nmm.jpg",
      "prod-J180A-decorations.svg",
      "preview-J180A-decorations.svg",
    ]);
    if (!allowed.has(file)) return NextResponse.json({ error: "Invalid J180A asset filename." }, { status: 400 });
    const filePath = path.join(process.cwd(), "assets", "augusta-live", "baseball", "J180A", file);
    try {
      const buffer = await fs.readFile(filePath);
      const ext = file.split(".").pop()!;
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": CONTENT_TYPES[ext] || "application/octet-stream",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    } catch {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
  }

  if (!hasAugustaLiveGlb(sku)) {
    return NextResponse.json({ error: `No real Augusta-live GLB for style ${sku}.` }, { status: 404 });
  }
  const isModelAsset = file === `${sku}.glb` || file === `${sku}-NormalMap.png`;
  const isCutPieceAsset = file === "artwork.svg" || file === "render.png";
  if (!isModelAsset && !isCutPieceAsset) {
    return NextResponse.json({ error: "Invalid asset filename." }, { status: 400 });
  }

  const directory = isModelAsset ? "hockey-3d" : "hockey";
  const filePath = path.join(process.cwd(), "assets", "augusta-live", directory, sku, file);
  try {
    const buffer = await fs.readFile(filePath);
    const ext = file.split(".").pop()!;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": CONTENT_TYPES[ext] || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
}
