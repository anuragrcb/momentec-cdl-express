import { NextRequest, NextResponse } from "next/server";
import { fetchBakeFile } from "@/lib/retexture-client";

export const runtime = "nodejs";

// Streams one output file (glb / atlas / preview / etc.) straight through
// from the sibling retexture service so the browser never talks to :3000
// directly. Used by the three.js viewer to load the baked GLB.
export async function GET(_req: NextRequest, context: { params: Promise<{ jobId: string; name: string }> }) {
  const { jobId, name } = await context.params;
  try {
    const upstream = await fetchBakeFile(jobId, name);
    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    return new NextResponse(upstream.body, {
      status: 200,
      headers: { "Content-Type": contentType },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch bake file.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
