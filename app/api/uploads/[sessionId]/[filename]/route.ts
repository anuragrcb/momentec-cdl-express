import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

// Streams back a previously uploaded reference image from data/uploads/.
// sessionId/filename are constrained to a-z0-9-_. and a known extension so
// this can't be used to traverse outside the uploads directory.
export async function GET(_req: NextRequest, context: { params: Promise<{ sessionId: string; filename: string }> }) {
  const { sessionId, filename } = await context.params;
  if (!/^[a-zA-Z0-9_-]+$/.test(sessionId) || !/^(front|back|left|right)\.(png|jpg|jpeg|webp)$/.test(filename)) {
    return NextResponse.json({ error: "Invalid upload path." }, { status: 400 });
  }

  const filePath = path.join(process.cwd(), "data", "uploads", sessionId, filename);
  try {
    const buffer = await fs.readFile(filePath);
    const ext = filename.split(".").pop()!;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: { "Content-Type": CONTENT_TYPES[ext] || "application/octet-stream" },
    });
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
}
