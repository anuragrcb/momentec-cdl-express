import { NextRequest } from "next/server";
import { callProofApi } from "@/lib/proof-api";
import { MAX_REFERENCES } from "@/lib/upload-form";

export const runtime = "nodejs";
export const maxDuration = 60;

// The browser sends a normal multipart form; the proof API (POST /jobs) takes the same JSON as the
// Postman collection: files become base64 images, pasted links are passed through as https links.
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!form) return Response.json({ error: "Add at least one image of your garment." }, { status: 400 });

  const images: string[] = [];
  for (const value of form.getAll("reference")) {
    if (!(value instanceof File) || value.size === 0) continue;
    images.push(Buffer.from(await value.arrayBuffer()).toString("base64"));
  }
  for (const value of form.getAll("link")) {
    if (typeof value === "string" && value.trim()) images.push(value.trim());
  }
  if (images.length === 0) return Response.json({ error: "Add at least one image of your garment." }, { status: 400 });
  if (images.length > MAX_REFERENCES) return Response.json({ error: `You can add up to ${MAX_REFERENCES} images.` }, { status: 400 });

  const field = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value : "";
  };
  const size = field("size");
  const quality = field("quality");
  return callProofApi("/jobs", {
    method: "POST",
    body: JSON.stringify({
      name: field("name"),
      email: field("email"),
      message: field("message"),
      ...(size ? { size } : {}),
      ...(quality ? { quality } : {}),
      images,
    }),
  });
}
