import { callProofApi } from "@/lib/proof-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/upload-ai-design/status/<jobId> → the proof API's GET /jobs/<jobId>.
export async function GET(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return callProofApi(`/jobs/${encodeURIComponent(jobId)}`, { method: "GET" });
}
