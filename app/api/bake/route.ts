import { NextRequest, NextResponse } from "next/server";
import { hasMesh } from "@/lib/types";
import { startBake } from "@/lib/retexture-client";
import path from "node:path";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const sku = body?.sku as string | undefined;
  const frontImageUrl = body?.frontImageUrl as string | undefined; // e.g. /api/uploads/<sessionId>/front.png
  if (!sku || !frontImageUrl) {
    return NextResponse.json({ error: "Expected JSON body { sku, frontImageUrl }." }, { status: 400 });
  }
  if (!hasMesh(sku)) {
    return NextResponse.json(
      { error: `Style ${sku} has no real 3D mesh available yet. Only 228108, 228103, 228187 and 227132 do.` },
      { status: 400 },
    );
  }

  // frontImageUrl points at a file this app already saved under data/uploads/
  // via POST /api/upload, referenced through the /api/uploads/[sessionId]/[filename]
  // route rather than a public/ path.
  const match = frontImageUrl.match(/^\/api\/uploads\/([a-zA-Z0-9_-]+)\/(front\.(?:png|jpg|jpeg|webp))$/);
  if (!match) {
    return NextResponse.json({ error: "frontImageUrl must be a path returned by /api/upload." }, { status: 400 });
  }
  const [, sessionId, filename] = match;
  const localPath = path.join(process.cwd(), "data", "uploads", sessionId, filename);

  try {
    const job = await startBake(sku, localPath);
    return NextResponse.json(job, { status: 202 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start bake.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
