import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import { get, put } from "@vercel/blob";

const PACKAGE_ROOT = path.join(process.cwd(), "data", "artwork-packages");
const BLOB_PREFIX = "cdl-express/artwork-packages";

function safePart(value: string, label: string): string {
  if (!/^[a-zA-Z0-9_.-]+$/.test(value) || value.includes("..")) {
    throw new Error(`Invalid artwork package ${label}.`);
  }
  return value;
}

function blobPath(sessionId: string, filename: string): string {
  return `${BLOB_PREFIX}/${safePart(sessionId, "session")}/${safePart(filename, "filename")}`;
}

export function usesVercelBlob(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function saveArtworkPackageFile(
  sessionId: string,
  filename: string,
  body: Buffer | string,
  contentType: string,
): Promise<void> {
  if (usesVercelBlob()) {
    await put(blobPath(sessionId, filename), body, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType,
    });
    return;
  }

  const directory = path.join(PACKAGE_ROOT, safePart(sessionId, "session"));
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, safePart(filename, "filename")), body);
}

export async function readArtworkPackageFile(
  sessionId: string,
  filename: string,
): Promise<{ body: BodyInit; contentType: string; size?: number } | null> {
  if (usesVercelBlob()) {
    const result = await get(blobPath(sessionId, filename), { access: "private" });
    if (!result || result.statusCode !== 200) return null;
    return {
      body: result.stream,
      contentType: result.blob.contentType,
      size: result.blob.size,
    };
  }

  try {
    const body = await fs.readFile(
      path.join(PACKAGE_ROOT, safePart(sessionId, "session"), safePart(filename, "filename")),
    );
    const contentType = filename.endsWith(".svg")
      ? "image/svg+xml; charset=utf-8"
      : filename.endsWith(".zip")
        ? "application/zip"
        : "application/octet-stream";
    return { body, contentType, size: body.byteLength };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

