import { NextRequest } from "next/server";
import { callProofApi } from "@/lib/proof-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/upload-ai-design/jobs?limit=10&after=<jobId> → the proof API's GET /jobs list.
export async function GET(req: NextRequest) {
  const query = new URLSearchParams();
  const limit = req.nextUrl.searchParams.get("limit");
  const after = req.nextUrl.searchParams.get("after");
  if (limit) query.set("limit", limit);
  if (after) query.set("after", after);
  const suffix = query.toString();
  return callProofApi(suffix ? `/jobs?${suffix}` : "/jobs", { method: "GET" });
}
