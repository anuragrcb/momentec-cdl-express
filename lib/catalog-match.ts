import { setDefaultAutoSelectFamilyAttemptTimeout } from "node:net";
import sharp from "sharp";
import { filterPlanToAllowedCatalog, snapPlanColors } from "./colors";
import { coversPlacements, customerLimitNote, isTrimTag, type PrintLimit } from "./manufacture-limits";
import { matchNeedsReview } from "./match-decision";
import { completeJson, type JsonSchema } from "./openai-json";

// WSL drops the catalog connection when Node's address attempt is only 250ms.
setDefaultAutoSelectFamilyAttemptTimeout(10_000);

const VIEWS = ["front", "back", "left", "right"] as const;

// 960x1280 matches Magnific's traditional_3_4 aspect ratio, with a 1/10th white cross in the center.
const SHEET_WIDTH = 960;
const SHEET_HEIGHT = 1280;
const GAP_X = 96;
const GAP_Y = 128;
const CELL_WIDTH = (SHEET_WIDTH - GAP_X) / 2; // 432
const CELL_HEIGHT = (SHEET_HEIGHT - GAP_Y) / 2; // 576

const ACCESSORY_RE = /\b(compression sleeve|cmprssion slv|headband|gaiter|mask|blanket|socks|namebar)\b/i;
const BROKEN_PREVIEW_STYLE_RE = /^(UP\d|UFO|UPO|UPB|URS)/i;
const PARTNER_PREFIX_RE = /^(UP|UFO|UPO|UPB|URS|UVO|PG|BR|PW|AV)/i;
const BOTTOM_RE = /\b(shorts?|pants?|knickers?|skirts?|skorts?|tights?|kilts?)\b/i;
const TOP_RE = /\b(jerseys?|jsy|jrsy|tees?|hoodies?|pullovers?|jackets?|polos?|tanks?|pinnies?|shells?|tops?|vests?|shirts?|trainers?|singlets?)\b/i;

const DESCRIBE_PROMPT = `Analyze this uploaded garment image to search the Momentec sublimation catalog.
Note how Momentec names products in its catalog:
- Sleeveless tops are named: "Traditional Track Jersey" (scoop neck, sleeveless straps), "Fitted Track Jersey" (fitted sleeveless), "Basketball Jersey" (V-neck or crew sleeveless), "Racerback Basketball Jersey", "Dynaspeed Sleeveless Compression" (tight muscle tank), "Lacrosse Tank", "Reversible Lacrosse Pinnie", "Sleeveless Baseball Jersey", "Sleeveless Softball Jersey", "Sleeveless Hoodie", "Cheer Shell". (Do NOT put the word "Sleeveless" before Basketball Jersey or Track Jersey, and NEVER use "Compression Sleeve" for a shirt.)
- Short-sleeve tops are named: "Turbo Training Tee" (crew neck athletic tee/jersey), "Turbo V-Neck Tee", "Raglan Tee", "Crew Neck Baseball Jersey", "V-Neck Baseball Jersey", "Full-Button Baseball Jersey", "Two-Button Baseball Jersey", "Faux Full-Button Baseball Jersey", "Short Sleeve Softball Jersey", "2-Button Softball Jersey", "Football Jersey", "Flag Football Jersey", "Lacrosse Jersey", "Sublimated Polo", "Dynaspeed Short Sleeve Compression", "Short Sleeve Hoodie", "Volleyball Tee". (Do NOT put "Short Sleeve" before Crew Neck Baseball Jersey, V-Neck Baseball Jersey, Training Tee, or Football Jersey.)
- Long-sleeve / 3/4 tops & outerwear are named: "Long Sleeve Training Tee", "3/4 Sleeve Trainer", "V-Neck Hockey Jersey", "Traditional Lace Up Hockey Jersey", "Long Sleeve Dek Hockey Jersey", "Long Sleeve Hoodie", "Fleece Hoodie", "1/4 Zip Pullover", "Fleece Crew Neck", "Full-Zip Jacket", "Long Sleeve Compression Tee", "Long Sleeve Cheer Top".
- Bottoms are named: "Basketball Shorts", "Traditional Track Shorts", "Fitted Track Shorts", "Training Shorts", "Softball Shorts", "Baseball Pant", "Baseball Knicker", "Football Pant", "Lacrosse Shorts", "Cheer Skirt", "Cheer Skort", "7v7 Compression Shorts", "Baselayer Tight", "Sublimated Pant".
- Accessories are named: "Compression Sleeve" (arm sleeve), "Headband", "Gaiter", "Face Mask", "Hockey Tube Socks", "Fleece Blanket".
- Unsupported garments: Momentec ONLY manufactures separate two-piece tops, bottoms, and the listed accessories above. It CANNOT manufacture one-piece wrestling singlets, unitards, bodysuits, leotards, swimsuits, dresses, overalls, rompers, shoes, helmets, or bags. If the uploaded image is an unsupported garment type (for example, a one-piece wrestling singlet where the top and attached shorts are one continuous garment), set "supported": false and explain why in "unsupported_reason".

Ignore the specific team name or artwork topic (do not guess a sport from a printed logo or state map). Look at the physical garment cut, neckline, sleeves, visible logo placements, visible text/number placements, and number of fabric color panels.

Reply with ONLY valid JSON in this exact shape:
{
  "supported": true,
  "unsupported_reason": "",
  "queries": ["<best catalog product name>", "<second closest catalog product name>", "<third closest catalog product name>"],
  "garment_piece": "top",
  "sleeves": "short",
  "segment": "adult",
  "logo_locations": [],
  "text_locations": [],
  "has_buttons": false,
  "color_panels": 2,
  "confidence": 0.0
}
logo_locations and text_locations must list only placements that are actually visible. Use an empty array when none are visible. confidence is 0 to 1.`;

const JUDGE_AND_PLAN_PROMPT = `Image 1 is the customer's uploaded garment design.
Each following image is a 2x2 3D render (Top-Left: Front, Top-Right: Back, Bottom-Left: Left side, Bottom-Right: Right side) of one candidate Momentec catalog style, accompanied by its catalog name, allowed logo placements, allowed text placements, and color zones.

Your task has two parts:
1. Pick the closest candidate catalog style that matches the physical garment silhouette and construction (neckline shape such as scoop vs crew vs V-neck, sleeve/strap cut, button placket if any, torso fit, and hem) and can print the customer's visible logos and text. If the closest cut cannot print those marks, choose the next closest candidate that can.
   If NONE of the candidate catalog styles match the physical construction of Image 1 (for example, Image 1 is a one-piece singlet/bodysuit/dress or a completely different garment cut than all candidates), set "supported": false and explain why in "unsupported_reason".
2. For the winning catalog style, map the customer's uploaded design onto ONLY that catalog garment's allowed color_zones, allowed logo_locations, and allowed text_locations so an image generator can project the customer's texture and artwork onto all 4 views of the winning catalog style's 3D template:
   - In "color_zone_mapping", assign ONLY the color zones that exist in the winning style's color_zones list (such as Body Color, Accent 1, Accent 2, Button Color, Collar/Trim) to the color, gradient, or sublimation pattern visible on the customer's garment (always include a 6-digit #RRGGBB hex code for every color). Omit any color panel that does not exist on the winning style.
   - In "logo_mapping", include a logo/crest/patch/graphic ONLY if the winning style's allowed logo_locations list supports the physical placement where that logo appears on the customer's garment (include the exact location code and name from the winning style's allowed logo_locations, what the logo looks like with 6-digit #RRGGBB hex codes for its colors, and which view it sits on). A logo that has lettering inside it is one logo. Keep the words and the picture together. Do not file the words as text and the picture as a separate graphic. If a logo appears on a placement NOT in the winning style's allowed logo_locations, OMIT the whole logo — do not move it to another location and do not invent logos.
   - In "text_mapping", include a wordmark/name/number ONLY if it is separate from a logo and the winning style's allowed text_locations list supports that placement (include the exact location code and name from the winning style's allowed text_locations, the exact text/number, its fill/outline 6-digit #RRGGBB hex codes and font style, and which view it sits on). Do not repeat words that are already part of a logo. If text or a number appears on a placement NOT in the winning style's allowed text_locations, OMIT it completely — do not move it to another location and do not invent text.
   - In "view_plan", write concrete visual instructions for what must appear on the front, back, left, and right cells when projecting the customer's design onto the winning catalog garment's 3D shape (include 6-digit #RRGGBB hex codes for every fabric zone, trim, logo, and text color mentioned). Mention ONLY the logos and text/numbers that were kept in "logo_mapping" and "text_mapping". If any visible logo, text, or number on Image 1 sits on an unsupported placement for the winning style, explicitly state in that view's plan to leave that area clean/blank and omit that mark.
   - Color formatting rule: whenever you reference any color in "color_zone_mapping", "logo_mapping", "text_mapping", or "view_plan", always include its 6-digit "#RRGGBB" hex code (for example, "purple (#4B1D70)") so every color can be snapped to the manufacturer's official brand palette before rendering.
   - "not_possible" and "can_do" are shown to the customer. Write them in plain words a customer understands. Say what mark is left off and why, and what will still be printed. A logo and the lettering inside it are one mark. Do not say the words can be printed and the picture cannot. Do not include style numbers or location codes such as m2 or t22. Leave "not_possible" empty when nothing visible is left off.

Reply with ONLY valid JSON in this exact shape:
{
  "supported": true,
  "unsupported_reason": "",
  "winner_style": "<one of the candidate style codes, or none>",
  "confidence": 0.0,
  "color_zone_mapping": [],
  "logo_mapping": [],
  "text_mapping": [],
  "not_possible": [
    { "mark": "...", "reason": "..." }
  ],
  "can_do": ["..."],
  "view_plan": {
    "front": "...",
    "back": "...",
    "left": "...",
    "right": "..."
  }
}
winner_style must be one of the candidate style codes, or "none" when no candidate matches. confidence is 0 to 1. Use 0 when you are not sure.`;

export type GarmentAnalysis = {
  supported: boolean;
  unsupportedReason: string;
  queries: string[];
  garmentPiece: "top" | "bottom" | "one-piece" | "other";
  sleeves: "sleeveless" | "short" | "3/4" | "long" | "none";
  segment: "adult" | "ladies" | "youth";
  logoLocations: string[];
  textLocations: string[];
  hasButtons: boolean;
  colorPanels: number;
};

export type LocationItem = { code?: string; name?: string; legacy?: boolean };
export type ZoneItem = { code?: string; name?: string };

export type MatchRow = {
  style: string;
  name: string;
  brand: string;
  sport: string;
  segment: string;
  score: number | null;
  logo_locations: LocationItem[];
  text_locations: LocationItem[];
  color_zones: ZoneItem[];
};

export type GarmentProjectionPlan = {
  colorZoneMapping: string[];
  logoMapping: string[];
  textMapping: string[];
  viewPlan: {
    front: string;
    back: string;
    left: string;
    right: string;
  };
};

export type CatalogMatchResult = {
  query: string;
  style: string;
  winner: MatchRow;
  templateSheet: Buffer;
  matches: MatchRow[];
  plan: GarmentProjectionPlan;
  limits: string;
};

export class CatalogMatchError extends Error {
  status: number;
  query: string;
  matches: MatchRow[];

  constructor(message: string, status: number, query = "", matches: MatchRow[] = []) {
    super(message);
    this.status = status;
    this.query = query;
    this.matches = matches;
  }
}

export async function matchCatalogGarment(
  photoBytes: Buffer,
  mimeType: string,
  options?: { gender?: string; category?: string },
): Promise<CatalogMatchResult> {
  const searchUrl = process.env.MOMENTEC_CATALOG_SEARCH_URL || process.env["momentec-catalog-search-url"];
  const searchKey = process.env.CATALOG_API_KEY || process.env["X-API-Key"];
  const openaiKey = process.env.OPENAI_API_KEY;
  const garmentUrl = process.env.GARMENT_IMAGE_URL || process.env["garment-image-url"];
  if (!searchUrl || !searchKey || !openaiKey || !garmentUrl) {
    console.error("Catalog search URL, X-API-Key, garment image URL, or OPENAI_API_KEY is not set.");
    throw new CatalogMatchError("Could not search the catalog.", 503);
  }

  const analysis = await describeGarment(openaiKey, photoBytes, mimeType);
  const query = analysis.queries.join(" | ");
  if (!analysis.supported) {
    const reason =
      analysis.unsupportedReason || "This garment is not possible to manufacture.";
    console.log("closest garment query", query || reason);
    console.log("closest garment", "none (unsupported)", reason);
    throw new CatalogMatchError(reason, 422, query, []);
  }

  const gender = options?.gender?.trim() ?? "";
  const category = options?.category?.trim() ?? "";
  const pool = await searchCatalog(searchUrl, searchKey, analysis, {
    segment: segmentOf(gender) ?? analysis.segment,
    sport: category ? category.toUpperCase() : null,
  });
  const comparable = await buildComparableSheets(garmentUrl, pool, 3);
  const matches =
    comparable.length >= 3
      ? comparable.map((item) => item.row)
      : [
          ...comparable.map((item) => item.row),
          ...pool.filter((row) => !comparable.some((item) => item.row.style === row.style)),
        ].slice(0, 3);

  if (matches.length === 0 || comparable.length === 0) {
    const reason = "We cannot manufacture this garment because no matching style was found in our catalog.";
    console.log("closest garment query", query);
    console.log("closest garment", "none");
    throw new CatalogMatchError(reason, 422, query, matches);
  }

  const judged = await chooseStyleAndPlan(openaiKey, photoBytes, mimeType, analysis, comparable);
  console.log(
    "closest garment sheets",
    comparable.map((item) => item.row.style),
  );
  console.log("closest garment query", query);

  if (!judged.style) {
    const reason =
      judged.unsupportedReason ||
      "An artist needs to review this design before we can make it.";
    console.log("closest garment", "none (unsupported)", reason);
    throw new CatalogMatchError(reason, 422, query, matches);
  }

  let chosen = comparable.find((item) => item.row.style === judged.style);
  if (!chosen) {
    const reason = "An artist needs to review this design before we can make it.";
    console.log("closest garment", "none (unmatched)", reason);
    throw new CatalogMatchError(reason, 422, query, matches);
  }
  let planSource = judged;
  const picked = chosen;
  const missedRealMarks = judged.notPossible.some((item) => !isTrimTag(`${item.mark} ${item.reason}`));
  if (missedRealMarks) {
    const winnerScore = placementCoverage(picked.row, analysis);
    const better = comparable
      .filter((item) => item.row.style !== picked.row.style)
      .map((item) => ({ item, score: placementCoverage(item.row, analysis) }))
      .filter((item) => item.score > winnerScore)
      .sort((a, b) => b.score - a.score)[0];
    if (better) {
      console.log("closest garment retry", better.item.row.style, better.score, "vs", winnerScore);
      const retry = await chooseStyleAndPlan(openaiKey, photoBytes, mimeType, analysis, [better.item]);
      if (retry.style === better.item.row.style) {
        chosen = better.item;
        planSource = retry;
      }
    }
  }
  const filteredPlan = filterPlanToAllowedCatalog(planSource.plan, chosen.row);
  const snappedPlan = await snapPlanColors(filteredPlan, chosen.row.brand);
  console.log(
    "closest garment",
    chosen.row.style,
    matches.map((row) => ({
      style: row.style,
      name: row.name,
      score: row.score,
      logo_locations: row.logo_locations,
      text_locations: row.text_locations,
      color_zones: row.color_zones,
    })),
  );
  const limits = customerLimitNote(planSource.notPossible, planSource.canDo);
  console.log("closest garment plan", snappedPlan);
  console.log("closest garment limits", limits);

  return {
    query,
    style: chosen.row.style,
    winner: chosen.row,
    templateSheet: chosen.sheet,
    matches,
    plan: snappedPlan,
    limits,
  };
}

const stringList: JsonSchema = { type: "array", items: { type: "string" } };

const DESCRIBE_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    supported: { type: "boolean" },
    unsupported_reason: { type: "string" },
    queries: stringList,
    garment_piece: { type: "string", enum: ["top", "bottom", "one-piece", "other"] },
    sleeves: { type: "string", enum: ["sleeveless", "short", "3/4", "long", "none"] },
    segment: { type: "string", enum: ["adult", "ladies", "youth"] },
    logo_locations: stringList,
    text_locations: stringList,
    has_buttons: { type: "boolean" },
    color_panels: { type: "number" },
    confidence: { type: "number" },
  },
  required: [
    "supported",
    "unsupported_reason",
    "queries",
    "garment_piece",
    "sleeves",
    "segment",
    "logo_locations",
    "text_locations",
    "has_buttons",
    "color_panels",
    "confidence",
  ],
};

async function describeGarment(apiKey: string, photo: Buffer, mimeType: string): Promise<GarmentAnalysis> {
  const parts = [
    { text: DESCRIBE_PROMPT },
    { data: photo.toString("base64"), mimeType },
  ];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const parsed = await completeJson(apiKey, "describe_garment", DESCRIBE_SCHEMA, parts);
      const analysis = readDescribe(parsed);
      if (analysis && (!analysis.supported || analysis.queries.length > 0)) return analysis;
    } catch (error) {
      console.error("describe garment attempt failed:", error instanceof Error ? error.message : error);
    }
  }
  throw new CatalogMatchError("We could not read this design. An artist needs to review it.", 422);
}

async function searchCatalog(
  url: string,
  apiKey: string,
  analysis: GarmentAnalysis,
  filters: { segment: "adult" | "youth" | "ladies" | null; sport: string | null },
) {
  let batches = await runQueries(url, apiKey, analysis.queries, filters);
  if (batches.flat().length < 3 && filters.sport) {
    const withoutSport = await runQueries(url, apiKey, analysis.queries, { segment: filters.segment, sport: null });
    batches = [...batches, ...withoutSport];
  }
  if (batches.flat().length < 3 && filters.segment) {
    const unfiltered = await runQueries(url, apiKey, analysis.queries, { segment: null, sport: null });
    batches = [...batches, ...unfiltered];
  }
  return rankCandidates(batches, analysis);
}

async function runQueries(
  url: string,
  apiKey: string,
  queries: string[],
  filters: { segment: "adult" | "youth" | "ladies" | null; sport: string | null },
) {
  return Promise.all(queries.map((q) => queryCatalog(url, apiKey, q, filters)));
}

function rankCandidates(batches: MatchRow[][], analysis: GarmentAnalysis): MatchRow[] {
  const wantsAccessory = analysis.queries.some((q) => ACCESSORY_RE.test(q));
  const byStyle = new Map<string, { row: MatchRow; bestRank: number }>();

  for (const batch of batches) {
    const cleanBatch = batch.filter((row) => {
      if (BROKEN_PREVIEW_STYLE_RE.test(row.style)) return false;
      if (!wantsAccessory && ACCESSORY_RE.test(row.name)) return false;
      if (analysis.garmentPiece === "top" && BOTTOM_RE.test(row.name) && !TOP_RE.test(row.name)) return false;
      if (analysis.garmentPiece === "bottom" && TOP_RE.test(row.name) && !BOTTOM_RE.test(row.name)) return false;
      return true;
    });
    const effectiveBatch = cleanBatch.length > 0 ? cleanBatch : batch;
    effectiveBatch.sort((a, b) => {
      const aPartner = PARTNER_PREFIX_RE.test(a.style) ? 1 : 0;
      const bPartner = PARTNER_PREFIX_RE.test(b.style) ? 1 : 0;
      if (aPartner !== bPartner) return aPartner - bPartner;
      return (b.score ?? 0) - (a.score ?? 0);
    });
    effectiveBatch.forEach((row, index) => {
      const existing = byStyle.get(row.style);
      if (!existing) {
        byStyle.set(row.style, { row, bestRank: index });
      } else {
        const bestRow = (row.score ?? 0) > (existing.row.score ?? 0) ? row : existing.row;
        byStyle.set(row.style, {
          row: existing.row.color_zones.length > 0 && bestRow.color_zones.length === 0 ? existing.row : bestRow,
          bestRank: Math.min(existing.bestRank, index),
        });
      }
    });
  }

  const pool = Array.from(byStyle.values());

  const scored = pool.map(({ row, bestRank }) => {
    let score = row.score ?? 0;
    if (bestRank === 0) score += 0.06;
    else if (bestRank === 1) score += 0.02;

    const logoNames = new Set(row.logo_locations.map((l) => (l.name ?? "").toLowerCase()));
    const textNames = new Set(row.text_locations.map((t) => (t.name ?? "").toLowerCase()));
    for (const loc of analysis.logoLocations) {
      if (logoNames.has(loc.toLowerCase())) score += 0.025;
    }
    for (const loc of analysis.textLocations) {
      if (textNames.has(loc.toLowerCase())) score += 0.025;
    }

    const name = row.name;
    if (analysis.sleeves === "sleeveless") {
      if (/\b(short sleeve|half sleeve|3\/4 sleeve|long sleeve)\b/i.test(name)) score -= 0.25;
      if (/\b(sleeveless|tank|racerback|pinnie|track jersey|basketball jersey|cheer shell)\b/i.test(name)) score += 0.06;
    } else if (analysis.sleeves === "short") {
      if (/\b(sleeveless|tank|racerback|pinnie|cheer shell|3\/4 sleeve|long sleeve|half sleeve)\b/i.test(name)) score -= 0.25;
    } else if (analysis.sleeves === "long") {
      if (/\b(sleeveless|tank|racerback|short sleeve|half sleeve)\b/i.test(name)) score -= 0.25;
      if (/\b(long sleeve|hoodie|pullover|jacket|hockey jersey|crew neck fleece)\b/i.test(name)) score += 0.05;
    }

    const hasButtonZone = row.color_zones.some((z) => /button/i.test(z.code ?? "") || /button/i.test(z.name ?? ""));
    const nameHasButton = /\b(button|2-button|two-button|full-button)\b/i.test(name);
    if (analysis.hasButtons && (hasButtonZone || nameHasButton)) score += 0.06;
    if (!analysis.hasButtons && (hasButtonZone || nameHasButton)) score -= 0.06;
    if (PARTNER_PREFIX_RE.test(row.style)) score -= 0.1;
    return { ...row, score: Math.round(score * 10000) / 10000 };
  });

  scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const distinct: MatchRow[] = [];
  const seenCuts = new Set<string>();
  for (const row of scored) {
    const cutKey = normalizeCutName(row.name);
    if (seenCuts.has(cutKey)) continue;
    seenCuts.add(cutKey);
    distinct.push(row);
  }
  return distinct.length >= 3 ? distinct : scored;
}

function normalizeCutName(name: string) {
  return name
    .toUpperCase()
    .replace(
      /\b(YOUTH|YTH|GIRLS|LADIES|ADULT|PERFECT GAME|BABE RUTH|POP WARNER|UPWARD|UP|CUSTOMFUZE|FREESTYLE|FS|SUBLIMATED|SUB|TURBO|LIGHTWEIGHT|LTWT|NEW FIT)\b/g,
      " ",
    )
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

async function queryCatalog(
  url: string,
  apiKey: string,
  query: string,
  filters: { segment: "adult" | "youth" | "ladies" | null; sport: string | null },
) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
    body: JSON.stringify({
      query,
      top_k: 12,
      collections: ["products"],
      group_products_by_style: true,
      product_filters: {
        ...(filters.segment ? { segment: filters.segment } : {}),
        ...(filters.sport ? { sport: filters.sport } : {}),
      },
    }),
  });
  if (!response.ok) throw new Error(`Catalog search returned ${response.status}.`);
  const payload = (await response.json()) as { results?: { products?: unknown } };
  const products = payload.results?.products;
  if (!Array.isArray(products)) return [];
  return products.flatMap(readMatch);
}

function readMatch(value: unknown): MatchRow[] {
  if (!value || typeof value !== "object") return [];
  const row = value as Record<string, unknown>;
  if (typeof row.style !== "string" || row.style.trim() === "") return [];
  return [
    {
      style: row.style.trim(),
      name: typeof row.name === "string" ? row.name : "",
      brand: typeof row.brand === "string" ? row.brand : "",
      sport: typeof row.sport === "string" ? row.sport : "",
      segment: typeof row.segment === "string" ? row.segment : "",
      score: typeof row.score === "number" ? row.score : null,
      logo_locations: Array.isArray(row.logo_locations) ? (row.logo_locations as LocationItem[]) : [],
      text_locations: Array.isArray(row.text_locations) ? (row.text_locations as LocationItem[]) : [],
      color_zones: Array.isArray(row.color_zones) ? (row.color_zones as ZoneItem[]) : [],
    },
  ];
}

function viewUrl(template: string, style: string, view: string) {
  const marker = "preview-";
  const at = template.lastIndexOf(marker);
  if (at < 0) throw new Error("Garment image URL has no preview- prefix.");
  return `${template.slice(0, at + marker.length)}${style}_${view}`;
}

async function buildComparableSheets(template: string, pool: MatchRow[], targetCount: number) {
  const comparable: { row: MatchRow; sheet: Buffer }[] = [];
  const candidates = pool.slice(0, 6);
  const firstWave = await Promise.all(
    candidates.slice(0, targetCount).map((row) => catalogSheet(template, row.style)),
  );
  for (let i = 0; i < firstWave.length; i += 1) {
    const sheet = firstWave[i];
    if (sheet) comparable.push({ row: candidates[i], sheet });
  }
  for (let i = targetCount; i < candidates.length && comparable.length < targetCount; i += 1) {
    const sheet = await catalogSheet(template, candidates[i].style);
    if (sheet) comparable.push({ row: candidates[i], sheet });
  }
  return comparable;
}

async function catalogSheet(template: string, style: string) {
  const views = await Promise.all(VIEWS.map((view) => readView(viewUrl(template, style, view))));
  const cells = [];
  for (const view of views) {
    if (!view) return null;
    cells.push(
      await sharp(view)
        .resize(CELL_WIDTH, CELL_HEIGHT, { fit: "contain", background: "#ffffff" })
        .png()
        .toBuffer(),
    );
  }
  return sharp({
    create: { width: SHEET_WIDTH, height: SHEET_HEIGHT, channels: 3, background: "#ffffff" },
  })
    .composite([
      { input: cells[0], left: 0, top: 0 },
      { input: cells[1], left: CELL_WIDTH + GAP_X, top: 0 },
      { input: cells[2], left: 0, top: CELL_HEIGHT + GAP_Y },
      { input: cells[3], left: CELL_WIDTH + GAP_X, top: CELL_HEIGHT + GAP_Y },
    ])
    .png()
    .toBuffer();
}

async function readView(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!response?.ok) return null;
  const bytes = Buffer.from(await response.arrayBuffer());
  return bytes.length > 0 ? bytes : null;
}

async function chooseStyleAndPlan(
  apiKey: string,
  photo: Buffer,
  mimeType: string,
  analysis: GarmentAnalysis,
  sheets: { row: MatchRow; sheet: Buffer }[],
): Promise<{ style: string | null; unsupportedReason: string; plan: GarmentProjectionPlan; confidence: number; notPossible: PrintLimit[]; canDo: string[] }> {
  const styleCodes = sheets.map((item) => item.row.style);
  const labeled = sheets.flatMap(({ row, sheet }) => {
    const logos =
      row.logo_locations
        .map((l) => (l.code && l.name ? `${l.name} (${l.code})` : l.name || l.code))
        .filter(Boolean)
        .join(", ") || "none";
    const texts =
      row.text_locations
        .map((t) => (t.code && t.name ? `${t.name} (${t.code})` : t.name || t.code))
        .filter(Boolean)
        .join(", ") || "none";
    const zones =
      row.color_zones
        .map((z) => (z.code && z.name ? `${z.name} (${z.code})` : z.name || z.code))
        .filter(Boolean)
        .join(", ") || "none";
    return [
      {
        text: `Candidate style ${row.style}: "${row.name}" (Brand: ${row.brand}, Sport: ${row.sport}, Segment: ${row.segment}). Allowed logo locations: ${logos}. Allowed text locations: ${texts}. Color zones: ${zones}. 2x2 views (front, back, left, right):`,
      },
      { data: sheet.toString("base64"), mimeType: "image/png" },
    ];
  });
  const detectedSummary = `Uploaded garment detected placements — Logos: ${analysis.logoLocations.join(", ") || "none"}; Text/Numbers: ${analysis.textLocations.join(", ") || "none"}; Buttons: ${analysis.hasButtons ? "yes" : "no"}; Approx color panels: ${analysis.colorPanels}.`;
  const parts = [
    { text: `${JUDGE_AND_PLAN_PROMPT}\n\nCandidate style codes: ${styleCodes.join(", ")}\n\n${detectedSummary}` },
    { data: photo.toString("base64"), mimeType },
    ...labeled,
  ];
  const defaultPlan: GarmentProjectionPlan = {
    colorZoneMapping: [],
    logoMapping: [],
    textMapping: [],
    viewPlan: {
      front: "Apply the uploaded front body colors, sublimation pattern, and front chest logos/text onto the front view.",
      back: "Continue the uploaded body colors and sublimation pattern onto the back view; keep back clean unless back markings are shown.",
      left: "Continue the uploaded body, side panel, and left sleeve colors/logos onto the left profile view.",
      right: "Continue the uploaded body, side panel, and right sleeve colors/logos onto the right profile view.",
    },
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const parsed = await completeJson(apiKey, "judge_garment", judgeSchema(styleCodes), parts);
      return readJudge(parsed, sheets, defaultPlan);
    } catch (error) {
      console.error("judge garment attempt failed:", error instanceof Error ? error.message : error);
    }
  }
  return {
    style: null,
    unsupportedReason: "An artist needs to review this design before we can make it.",
    plan: defaultPlan,
    confidence: 0,
    notPossible: [],
    canDo: [],
  };
}

function readJudge(
  value: unknown,
  sheets: { row: MatchRow; sheet: Buffer }[],
  defaultPlan: GarmentProjectionPlan,
): { style: string | null; unsupportedReason: string; plan: GarmentProjectionPlan; confidence: number; notPossible: PrintLimit[]; canDo: string[] } {
  if (!value || typeof value !== "object") throw new Error("Judge response was not an object.");
  const parsed = value as Record<string, unknown>;
  const styleCodes = sheets.map((item) => item.row.style);
  const rawStyle = typeof parsed.winner_style === "string" ? parsed.winner_style.trim() : "";
  const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0;
  const unsupportedReason =
    typeof parsed.unsupported_reason === "string" && parsed.unsupported_reason.trim()
      ? parsed.unsupported_reason.trim()
      : "We cannot manufacture this garment because it does not match any style in our catalog.";
  const matched = sheets.find((item) => item.row.style === rawStyle);
  if (parsed.supported === false || !matched || matchNeedsReview(rawStyle, confidence, styleCodes)) {
    const declined = parsed.supported === false || rawStyle.toLowerCase() === "none";
    return {
      style: null,
      unsupportedReason: declined
        ? unsupportedReason
        : "An artist needs to review this design before we can make it.",
      plan: defaultPlan,
      confidence,
      notPossible: [],
      canDo: [],
    };
  }
  const vp =
    parsed.view_plan && typeof parsed.view_plan === "object" ? (parsed.view_plan as Record<string, unknown>) : {};
  return {
    style: matched.row.style,
    unsupportedReason: "",
    confidence,
    notPossible: readPrintLimits(parsed.not_possible),
    canDo: stringArray(parsed.can_do),
    plan: {
      colorZoneMapping: stringArray(parsed.color_zone_mapping),
      logoMapping: stringArray(parsed.logo_mapping),
      textMapping: stringArray(parsed.text_mapping),
      viewPlan: {
        front: typeof vp.front === "string" && vp.front.trim() ? vp.front.trim() : defaultPlan.viewPlan.front,
        back: typeof vp.back === "string" && vp.back.trim() ? vp.back.trim() : defaultPlan.viewPlan.back,
        left: typeof vp.left === "string" && vp.left.trim() ? vp.left.trim() : defaultPlan.viewPlan.left,
        right: typeof vp.right === "string" && vp.right.trim() ? vp.right.trim() : defaultPlan.viewPlan.right,
      },
    },
  };
}

function placementCoverage(row: MatchRow, analysis: GarmentAnalysis): number {
  const logos = row.logo_locations.filter((item) => !item.legacy).map((item) => item.name ?? "");
  const texts = row.text_locations.filter((item) => !item.legacy).map((item) => item.name ?? "");
  return coversPlacements(analysis.logoLocations, logos) + coversPlacements(analysis.textLocations, texts);
}

function readPrintLimits(value: unknown): PrintLimit[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const mark = typeof record.mark === "string" ? record.mark.trim() : "";
    const reason = typeof record.reason === "string" ? record.reason.trim() : "";
    if (!mark || !reason) return [];
    return [{ mark, reason }];
  });
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((s) => s.trim());
}

function segmentOf(gender: string): "adult" | "youth" | "ladies" | null {
  if (gender === "Men") return "adult";
  if (gender === "Women") return "ladies";
  if (gender === "Youth") return "youth";
  return null;
}

function judgeSchema(styleCodes: string[]): JsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      supported: { type: "boolean" },
      unsupported_reason: { type: "string" },
      winner_style: { type: "string", enum: [...styleCodes, "none"] },
      confidence: { type: "number" },
      color_zone_mapping: stringList,
      logo_mapping: stringList,
      text_mapping: stringList,
      not_possible: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            mark: { type: "string" },
            reason: { type: "string" },
          },
          required: ["mark", "reason"],
        },
      },
      can_do: stringList,
      view_plan: {
        type: "object",
        additionalProperties: false,
        properties: {
          front: { type: "string" },
          back: { type: "string" },
          left: { type: "string" },
          right: { type: "string" },
        },
        required: ["front", "back", "left", "right"],
      },
    },
    required: [
      "supported",
      "unsupported_reason",
      "winner_style",
      "confidence",
      "color_zone_mapping",
      "logo_mapping",
      "text_mapping",
      "not_possible",
      "can_do",
      "view_plan",
    ],
  };
}

function readDescribe(value: unknown): GarmentAnalysis | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as Record<string, unknown>;
  const piece =
    parsed.garment_piece === "bottom" || parsed.garment_piece === "one-piece" || parsed.garment_piece === "other"
      ? parsed.garment_piece
      : "top";
  const supported = parsed.supported !== false && piece !== "one-piece" && piece !== "other";
  const queries = Array.isArray(parsed.queries)
    ? parsed.queries
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim())
        .slice(0, 3)
    : [];
  const sleeves =
    parsed.sleeves === "sleeveless" ||
    parsed.sleeves === "short" ||
    parsed.sleeves === "3/4" ||
    parsed.sleeves === "long" ||
    parsed.sleeves === "none"
      ? parsed.sleeves
      : "short";
  return {
    supported,
    unsupportedReason: typeof parsed.unsupported_reason === "string" ? parsed.unsupported_reason.trim() : "",
    queries,
    garmentPiece: piece,
    sleeves,
    segment: parsed.segment === "ladies" || parsed.segment === "youth" ? parsed.segment : "adult",
    logoLocations: stringArray(parsed.logo_locations),
    textLocations: stringArray(parsed.text_locations),
    hasButtons: Boolean(parsed.has_buttons),
    colorPanels: typeof parsed.color_panels === "number" ? parsed.color_panels : 2,
  };
}
