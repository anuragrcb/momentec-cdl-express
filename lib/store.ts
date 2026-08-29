import "server-only";

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { get, list, put } from "@vercel/blob";
import type { MockupRequest } from "./types";

const REQUESTS_DIR = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
  ? path.join(os.tmpdir(), "data", "requests")
  : path.join(process.cwd(), "data", "requests");
const BLOB_PREFIX = "cdl-express/requests";

function usesBlob(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function saveMockupRequest(
  input: Omit<MockupRequest, "id" | "createdAt" | "status">,
): Promise<MockupRequest> {
  const record: MockupRequest = {
    ...input,
    id: randomUUID().slice(0, 8),
    createdAt: new Date().toISOString(),
    status: "submitted",
  };
  const body = JSON.stringify(record, null, 2);
  if (usesBlob()) {
    await put(`${BLOB_PREFIX}/${record.id}.json`, body, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: "application/json",
    });
  } else {
    await fs.mkdir(REQUESTS_DIR, { recursive: true });
    await fs.writeFile(path.join(REQUESTS_DIR, `${record.id}.json`), body);
  }
  return record;
}

export async function listMockupRequests(): Promise<MockupRequest[]> {
  if (usesBlob()) {
    const result = await list({ prefix: `${BLOB_PREFIX}/`, limit: 1000 });
    const records = await Promise.all(result.blobs.map(async (blob) => {
      const file = await get(blob.pathname, { access: "private" });
      if (!file || file.statusCode !== 200) return null;
      return JSON.parse(await new Response(file.stream).text()) as MockupRequest;
    }));
    return records.filter((record): record is MockupRequest => Boolean(record)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  await fs.mkdir(REQUESTS_DIR, { recursive: true });
  const filenames = await fs.readdir(REQUESTS_DIR);
  const records = await Promise.all(
    filenames.filter((filename) => filename.endsWith(".json")).map(async (filename) =>
      JSON.parse(await fs.readFile(path.join(REQUESTS_DIR, filename), "utf8")) as MockupRequest),
  );
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getMockupRequest(id: string): Promise<MockupRequest | undefined> {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return undefined;
  if (usesBlob()) {
    const file = await get(`${BLOB_PREFIX}/${id}.json`, { access: "private" });
    if (!file || file.statusCode !== 200) return undefined;
    return JSON.parse(await new Response(file.stream).text()) as MockupRequest;
  }
  try {
    return JSON.parse(await fs.readFile(path.join(REQUESTS_DIR, `${id}.json`), "utf8")) as MockupRequest;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}
