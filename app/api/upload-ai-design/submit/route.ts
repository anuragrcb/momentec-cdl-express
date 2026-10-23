import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { NextRequest } from "next/server";
import { readGarmentFit } from "@/lib/mark-measure";
import { newProofJobId, proofObjectKeys, readProofCatalog, readProofCustomer, type ProofJob } from "@/lib/proof-job";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_SHEET_BYTES = 25 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!form) return Response.json({ error: "Make the front and back views first." }, { status: 400 });

  const sheetFile = form.get("sheet");
  if (!(sheetFile instanceof File) || sheetFile.size === 0) {
    return Response.json({ error: "Make the front and back views first." }, { status: 400 });
  }
  if (sheetFile.size > MAX_SHEET_BYTES) {
    return Response.json({ error: "That design is too large to upload." }, { status: 400 });
  }
  const fit = readGarmentFit(form.get("gender"), form.get("size"));
  if (!fit) return Response.json({ error: "Choose a gender and a size." }, { status: 400 });
  const customer = readProofCustomer({
    category: form.get("category"),
    name: form.get("name"),
    email: form.get("email"),
    message: form.get("message"),
  });
  if (!customer) return Response.json({ error: "Enter your name, email, and category." }, { status: 400 });

  const config = proofConfig();
  if (!config) {
    console.error("PROOF_BUCKET, PROOF_FUNCTION_NAME, or AWS_REGION is not set.");
    return Response.json({ error: "Could not upload the design." }, { status: 503 });
  }

  const jobId = newProofJobId();
  const keys = proofObjectKeys(jobId);
  const catalog = readProofCatalog(form.get("catalog"));
  const job: ProofJob = { jobId, ...fit, ...customer, ...(catalog ? { catalog } : {}) };
  const s3 = new S3Client({ region: config.region });
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: keys.sheet,
        Body: Buffer.from(await sheetFile.arrayBuffer()),
        ContentType: "image/png",
      }),
    );
    await s3.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: keys.job,
        Body: JSON.stringify(job),
        ContentType: "application/json",
      }),
    );
    const invoked = await new LambdaClient({ region: config.region }).send(
      new InvokeCommand({
        FunctionName: config.functionName,
        InvocationType: "Event",
        Payload: Buffer.from(JSON.stringify({ bucket: config.bucket, jobId })),
      }),
    );
    if (invoked.StatusCode !== 202) throw new Error(`Lambda accepted the job with status ${invoked.StatusCode ?? "none"}.`);
  } catch (error) {
    console.error("upload-ai-design enqueue failed:", error instanceof Error ? error.message : error);
    return Response.json({ error: "Could not upload the design." }, { status: 502 });
  }

  return Response.json({ jobId }, { status: 202 });
}

function proofConfig(): { region: string; bucket: string; functionName: string } | null {
  const region = process.env.AWS_REGION;
  const bucket = process.env.PROOF_BUCKET;
  const functionName = process.env.PROOF_FUNCTION_NAME;
  if (!region || !bucket || !functionName) return null;
  return { region, bucket, functionName };
}
