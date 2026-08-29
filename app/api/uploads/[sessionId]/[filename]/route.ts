import { NextRequest, NextResponse } from "next/server";
import { readUpload } from "@/lib/upload-store";

export const runtime = "nodejs";

// Streams back a previously uploaded reference image from data/uploads/.
// sessionId/filename are constrained to a-z0-9-_. and a known extension so
// this can't be used to traverse outside the uploads directory.
export async function GET(_req: NextRequest, context: { params: Promise<{ sessionId: string; filename: string }> }) {
  const { sessionId, filename } = await context.params;
  if (
    !/^[a-zA-Z0-9_-]+$/.test(sessionId) ||
    // "-generated" is a model-invented view written by /api/generate-views;
    // it is kept under its own suffix so it stays distinguishable from a real
    // customer upload everywhere it appears, including in the URL.
    !/^(?:(front|back|left|right)(-prepared|-generated)?\.(png|jpg|jpeg|webp)|tripo-proof\.glb|tripo-preview\.webp|\d{2}-[a-z0-9_-]+\.png)$/.test(filename)
  ) {
    return NextResponse.json({ error: "Invalid upload path." }, { status: 400 });
  }

  const file = await readUpload(sessionId, filename);
  if (!file) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return new NextResponse(new Uint8Array(file.buffer), {
    status: 200,
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
