import "server-only";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import JSZip from "jszip";
import type { ArtworkView, VectorAssetKind } from "@/lib/types";

const MCP_URL = "https://mcp.magnific.com/mcp";
const TOKEN_URL = "https://auth.magnific.com/realms/mcp/protocol/openid-connect/token";
const MODEL = process.env.MAGNIFIC_MCP_MODEL || "imagen-nano-banana-2";
const POLL_TIMEOUT_MS = 25_000;
const PROMPT_LIMIT = 3000;

type SourceView = { view: ArtworkView; buffer: Buffer; mimeType: string };
type Progress = (message: string, percent: number) => void;
type MagnificAsset = {
  id: string;
  kind: VectorAssetKind;
  name: string;
  description: string;
  filename: string;
  svgContent: string;
};

type TargetDefinition = Omit<MagnificAsset, "svgContent"> & { prompt: string };

let cachedClient: Client | null = null;
let cachedAccessToken: string | null = null;
let cachedAccessExpiry = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function resultText(result: unknown): string {
  if (!isRecord(result) || !Array.isArray(result.content)) return "";
  for (const block of result.content) {
    if (isRecord(block) && typeof block.text === "string") return block.text;
  }
  return "";
}

function structured(result: unknown): Record<string, unknown> {
  if (!isRecord(result) || !isRecord(result.structuredContent)) return {};
  return result.structuredContent;
}

function parseJsonText(result: unknown): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(resultText(result) || "{}");
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function creationIdentifier(result: unknown): string | null {
  const data = structured(result);
  const textData = parseJsonText(result);
  const creations = Array.isArray(data.creations) ? data.creations : Array.isArray(textData.creations) ? textData.creations : [];
  const first = creations[0];
  if (isRecord(first) && typeof first.identifier === "string") return first.identifier;
  if (typeof data.identifier === "string") return data.identifier;
  if (typeof textData.identifier === "string") return textData.identifier;
  if (isRecord(data.creation) && typeof data.creation.identifier === "string") return data.creation.identifier;
  if (isRecord(textData.creation) && typeof textData.creation.identifier === "string") return textData.creation.identifier;
  return resultText(result).match(/"identifier"\s*:\s*"([^"]+)"/)?.[1] ?? null;
}

export function isMagnificAssetExtractorConfigured(): boolean {
  return Boolean(
    process.env.MAGNIFIC_MCP_ACCESS_TOKEN ||
      (process.env.MAGNIFIC_MCP_CLIENT_ID && process.env.MAGNIFIC_MCP_REFRESH_TOKEN),
  );
}

async function accessToken(): Promise<string> {
  if (process.env.MAGNIFIC_MCP_ACCESS_TOKEN) return process.env.MAGNIFIC_MCP_ACCESS_TOKEN;
  if (cachedAccessToken && Date.now() < cachedAccessExpiry - 60_000) return cachedAccessToken;

  const clientId = process.env.MAGNIFIC_MCP_CLIENT_ID;
  const refreshToken = process.env.MAGNIFIC_MCP_REFRESH_TOKEN;
  if (!clientId || !refreshToken) throw new Error("Magnific MCP credentials are not configured.");

  const form = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    refresh_token: refreshToken,
  });
  if (process.env.MAGNIFIC_MCP_CLIENT_SECRET) form.set("client_secret", process.env.MAGNIFIC_MCP_CLIENT_SECRET);

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Magnific authentication failed (${response.status}): ${detail.slice(0, 180)}`);
  }

  const payload = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!payload.access_token) throw new Error("Magnific authentication did not return an access token.");
  cachedAccessToken = payload.access_token;
  cachedAccessExpiry = Date.now() + (payload.expires_in ?? 3600) * 1000;
  return cachedAccessToken;
}

async function mcpClient(): Promise<Client> {
  if (cachedClient) return cachedClient;
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: { headers: { Authorization: `Bearer ${await accessToken()}` } },
  });
  const client = new Client({ name: "journeyax-cdl-artwork-package", version: "1.0.0" });
  await client.connect(transport);
  cachedClient = client;
  return client;
}

async function uploadView(client: Client, source: SourceView): Promise<string> {
  const request = await client.callTool({
    name: "creations_request_upload",
    arguments: { mimeType: source.mimeType },
  });
  const requestData = { ...parseJsonText(request), ...structured(request) };
  const uploadUrl = typeof requestData.proxyUploadUrl === "string" ? requestData.proxyUploadUrl : null;
  const uploadPath = typeof requestData.path === "string" ? requestData.path : null;
  if (!uploadUrl || !uploadPath) throw new Error(`Magnific did not create an upload slot for the ${source.view} view.`);

  const uploaded = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": source.mimeType },
    body: new Uint8Array(source.buffer),
    signal: AbortSignal.timeout(60_000),
  });
  if (!uploaded.ok) throw new Error(`Magnific upload failed for the ${source.view} view (${uploaded.status}).`);

  const finalized = await client.callTool({
    name: "creations_finalize_upload",
    arguments: { path: uploadPath, visible: false },
  });
  const identifier = creationIdentifier(finalized);
  if (!identifier) throw new Error(`Magnific did not return an identifier for the ${source.view} view.`);
  return identifier;
}

async function waitForCreation(client: Client, identifier: string, label: string): Promise<string> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const response = await client.callTool({
      name: "creations_wait",
      arguments: { identifiers: [identifier], timeoutSeconds: 25 },
    });
    const data = structured(response);
    const results = Array.isArray(data.results) ? data.results : [];
    const match = results.find((item) => isRecord(item) && item.identifier === identifier) ?? results[0];
    if (isRecord(match)) {
      if (match.status === "completed" && isRecord(match.results) && typeof match.results.url === "string") {
        return match.results.url;
      }
      if (match.status === "failed" || match.status === "error") throw new Error(`${label} failed in Magnific.`);
    }
    const text = resultText(response);
    const url = text.match(/"url"\s*:\s*"(https?:\/\/[^"\\]+)"/)?.[1];
    if (url) return url;
    if (/status\s*[:=]\s*["']?(failed|error)/i.test(text)) throw new Error(`${label} failed in Magnific.`);
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`${label} timed out.`);
}

async function generateRaster(
  client: Client,
  definition: TargetDefinition,
  referenceIds: string[],
): Promise<string> {
  const response = await client.callTool({
    name: "images_generate",
    arguments: {
      mode: MODEL,
      prompt: definition.prompt.slice(0, PROMPT_LIMIT),
      aspectRatio: "1:1",
      references: referenceIds.map((identifier) => ({ type: "image", identifier })),
      count: 1,
    },
  });
  const identifier = creationIdentifier(response);
  if (!identifier) throw new Error(`Magnific did not queue ${definition.name}.`);
  await waitForCreation(client, identifier, definition.name);
  return identifier;
}

async function vectorize(client: Client, rasterId: string, label: string): Promise<string> {
  const queued = await client.callTool({
    name: "images_to_svg",
    arguments: { creationIdentifier: rasterId },
  });
  const identifier = creationIdentifier(queued);
  if (!identifier) throw new Error(`Magnific did not queue SVG vectorization for ${label}.`);
  const url = await waitForCreation(client, identifier, `${label} vectorization`);
  const response = await fetch(url, { signal: AbortSignal.timeout(45_000) });
  if (!response.ok) throw new Error(`Unable to download the ${label} SVG (${response.status}).`);
  const content = await response.text();
  if (!content.includes("<svg")) throw new Error(`${label} did not return a valid SVG document.`);
  return content;
}

const TARGETS: TargetDefinition[] = [
  {
    id: "assets-sheet",
    kind: "assets-sheet",
    name: "Master artwork sheet",
    filename: "01-assets-sheet.svg",
    description: "Logos, wordmarks, badges, numbers, stripes and trims isolated with production-review spacing.",
    prompt: "Create a clean flat 2D master artwork sheet from all supplied garment views. Isolate every visible logo, team wordmark, crest, badge, number, name, sleeve mark, cuff stripe and collar trim as separate non-overlapping items on pure white. Preserve source-view colors and outlines. Do not draw a garment, fabric folds or a mannequin. This is an artist reference sheet; include only marks actually visible in the supplied views.",
  },
  {
    id: "font-generator-sheet",
    kind: "font-sheet",
    name: "Typography reference sheet",
    filename: "02-font-generator-sheet.svg",
    description: "Observed name and number styling plus a clearly marked reconstructed character reference.",
    prompt: "Create a sports typography reference sheet from all garment views and the master artwork sheet. Show the exact observed names and numbers first, preserving fill, outline, shadow and proportions. Then provide a clearly separated reconstructed 0-9 and A-Z character reference in the same visual style. Pure white background, flat 2D art, no garment or fabric. Reconstructed characters are artist guidance, not a claim that the original font file was identified.",
  },
  {
    id: "background-texture-sheet",
    kind: "background-texture",
    name: "Background and texture sheet",
    filename: "03-background-texture-sheet.svg",
    description: "Continuous sublimation pattern reference with foreground branding removed.",
    prompt: "Create one flat edge-to-edge rectangular reference of only the continuous sublimated background pattern visible across the supplied front, back and side views. Preserve the observed palette, gradients, brush or geometric motifs. Remove all logos, words, names, numbers, badges, collars, sleeves, seams, garment silhouette, folds and shadows. The result is a clean background-pattern reference for an artist.",
  },
  {
    id: "primary-logo",
    kind: "primary-logo",
    name: "Primary logo reference",
    filename: "04-primary-logo.svg",
    description: "The dominant chest logo or team wordmark isolated for Illustrator review.",
    prompt: "Isolate only the dominant primary chest logo, team script or central crest that is visible in the supplied garment views and master artwork sheet. Straighten it into flat 2D artwork on pure white while preserving observed colors, outlines, inner details and proportions. No fabric, folds, garment silhouette, shadows or invented replacement logo.",
  },
];

export async function extractGarmentAssets(
  sources: SourceView[],
  onProgress: Progress = () => undefined,
): Promise<{ assets: MagnificAsset[]; zipBuffer: Buffer }> {
  if (sources.length === 0) throw new Error("At least one source view is required.");
  const client = await mcpClient();
  onProgress("Uploading approved garment views", 8);
  const sourceIds: string[] = [];
  for (const [index, source] of sources.entries()) {
    sourceIds.push(await uploadView(client, source));
    onProgress(`Uploaded ${source.view} view`, 10 + Math.round(((index + 1) / sources.length) * 14));
  }

  const assets: MagnificAsset[] = [];
  const master = TARGETS[0];
  onProgress("Extracting the master artwork sheet", 28);
  const masterRaster = await generateRaster(client, master, sourceIds);
  assets.push({ ...master, svgContent: await vectorize(client, masterRaster, master.name) });

  const chainedReferences = [...sourceIds, masterRaster];
  for (const [index, target] of TARGETS.slice(1).entries()) {
    try {
      onProgress(`Generating ${target.name}`, 46 + index * 16);
      const raster = await generateRaster(client, target, chainedReferences);
      assets.push({ ...target, svgContent: await vectorize(client, raster, target.name) });
    } catch (error) {
      console.warn(`[magnific-package] ${target.name} unavailable:`, error instanceof Error ? error.message : error);
    }
  }

  const zip = new JSZip();
  for (const asset of assets) zip.file(asset.filename, asset.svgContent);
  zip.file(
    "README.txt",
    [
      "MOMENTEC AI STUDIO — ARTWORK REFERENCE PACKAGE",
      "",
      "These SVGs are editable artist references generated from the approved garment views.",
      "They are not final production cut files and require artist validation before manufacturing.",
      "",
      ...assets.map((asset) => `${asset.filename} — ${asset.description}`),
      "",
      `Generated: ${new Date().toISOString()}`,
    ].join("\n"),
  );
  onProgress("Packaging Illustrator deliverables", 96);
  const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 } });
  onProgress("Artwork package complete", 100);
  return { assets, zipBuffer };
}

