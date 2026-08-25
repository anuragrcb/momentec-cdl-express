import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { MockupRequest } from "./types";

// Simple lightweight local store: one JSON file per mockup request under
// data/requests/. No real COMS integration exists yet - this is deliberately
// shaped like the record COMS would eventually receive, not a fake API call.
const REQUESTS_DIR = path.join(process.cwd(), "data", "requests");

function ensureDir() {
  fs.mkdirSync(REQUESTS_DIR, { recursive: true });
}

export function saveMockupRequest(input: Omit<MockupRequest, "id" | "createdAt" | "status">): MockupRequest {
  ensureDir();
  const record: MockupRequest = {
    ...input,
    id: randomUUID().slice(0, 8),
    createdAt: new Date().toISOString(),
    status: "submitted",
  };
  fs.writeFileSync(path.join(REQUESTS_DIR, `${record.id}.json`), JSON.stringify(record, null, 2));
  return record;
}

export function listMockupRequests(): MockupRequest[] {
  ensureDir();
  return fs
    .readdirSync(REQUESTS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(REQUESTS_DIR, f), "utf8")) as MockupRequest)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getMockupRequest(id: string): MockupRequest | undefined {
  ensureDir();
  const file = path.join(REQUESTS_DIR, `${id}.json`);
  if (!fs.existsSync(file)) return undefined;
  return JSON.parse(fs.readFileSync(file, "utf8")) as MockupRequest;
}
