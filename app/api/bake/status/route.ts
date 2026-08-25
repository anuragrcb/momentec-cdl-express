import { NextRequest, NextResponse } from "next/server";
import { getBakeStatus } from "@/lib/retexture-client";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Expected ?id=<jobId>." }, { status: 400 });

  try {
    const status = await getBakeStatus(id);
    return NextResponse.json(status);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch bake status.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
