import { NextRequest, NextResponse } from "next/server";
import { readArtworkPackageFile } from "@/lib/artwork-package-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_FILES = new Set([
  "01-assets-sheet.svg",
  "02-font-generator-sheet.svg",
  "03-background-texture-sheet.svg",
  "04-primary-logo.svg",
  "artwork-package.zip",
]);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string; filename: string }> },
) {
  const { sessionId, filename } = await params;
  if (!/^[a-zA-Z0-9_-]+$/.test(sessionId) || !ALLOWED_FILES.has(filename)) {
    return NextResponse.json({ error: "Invalid artwork package file." }, { status: 400 });
  }

  const file = await readArtworkPackageFile(sessionId, filename);
  if (!file) return NextResponse.json({ error: "Artwork package file not found." }, { status: 404 });

  const download = request.nextUrl.searchParams.get("download") === "1";
  const headers = new Headers({
    "Content-Type": file.contentType,
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
  });
  if (file.size) headers.set("Content-Length", String(file.size));
  if (download) headers.set("Content-Disposition", `attachment; filename="${filename}"`);

  return new Response(file.body, { status: 200, headers });
}
