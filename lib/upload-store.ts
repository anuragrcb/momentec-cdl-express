import "server-only";

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { get, list, put } from "@vercel/blob";

const LOCAL_ROOT = process.env.VERCEL || process.env.K_SERVICE
  ? path.join(os.tmpdir(), "data", "uploads")
  : path.join(process.cwd(), "data", "uploads");
const BLOB_PREFIX = "cdl-express/uploads";

function safePart(value: string, label: string): string {
  if (!/^[a-zA-Z0-9_.-]+$/.test(value) || value.includes("..")) throw new Error(`Invalid upload ${label}.`);
  return value;
}

function pathname(sessionId: string, filename: string): string {
  return `${BLOB_PREFIX}/${safePart(sessionId, "session")}/${safePart(filename, "filename")}`;
}

export function uploadUrl(sessionId: string, filename: string): string {
  return `/api/uploads/${safePart(sessionId, "session")}/${safePart(filename, "filename")}`;
}

export function usesUploadBlobStore(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function saveUpload(
  sessionId: string,
  filename: string,
  body: Buffer | string,
  contentType: string,
): Promise<string> {
  if (usesUploadBlobStore()) {
    await put(pathname(sessionId, filename), body, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType,
    });
  } else {
    const directory = path.join(LOCAL_ROOT, safePart(sessionId, "session"));
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, safePart(filename, "filename")), body);
  }
  return uploadUrl(sessionId, filename);
}

export async function readUpload(
  sessionId: string,
  filename: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (usesUploadBlobStore()) {
    const result = await get(pathname(sessionId, filename), { access: "private" });
    if (!result || result.statusCode !== 200) return null;
    const buffer = Buffer.from(await new Response(result.stream).arrayBuffer());
    return { buffer, contentType: result.blob.contentType || contentTypeForFilename(filename) };
  }
  try {
    const buffer = await fs.readFile(path.join(LOCAL_ROOT, safePart(sessionId, "session"), safePart(filename, "filename")));
    return { buffer, contentType: contentTypeForFilename(filename) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function listUploads(sessionId: string): Promise<string[]> {
  if (usesUploadBlobStore()) {
    const prefix = `${BLOB_PREFIX}/${safePart(sessionId, "session")}/`;
    const result = await list({ prefix, limit: 100 });
    return result.blobs.map((blob) => blob.pathname.slice(prefix.length));
  }
  return fs.readdir(path.join(LOCAL_ROOT, safePart(sessionId, "session"))).catch(() => [] as string[]);
}

export function contentTypeForFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "glb") return "model/gltf-binary";
  if (ext === "json") return "application/json";
  return "application/octet-stream";
}

