import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ArtworkAnalysis, ArtworkRegion, ArtworkRegionType, ArtworkView } from "./types";

// Same key source pattern as the sibling 3d-garment-retexture service:
// GEMINI_API_KEY read from this app's own .env (via @nestjs/config-free plain
// process.env here, since this is a standalone Next.js app, not JourneyAX).
const MODEL_ID = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const BASE_PROMPT = `You are analyzing customer-owned team-sports uniform reference images for an artist handoff.
One or more labelled views may be supplied. Inspect EVERY supplied view independently. Identify only visible
elements and their locations. Return ONLY strict JSON matching this exact shape, no markdown fences:

{
  "sport": string,           // e.g. "Hockey", "Baseball", "Soccer", "Football", "Basketball" - your best guess, "" if unclear
  "garmentType": string,     // e.g. "Jersey", "Pullover", "Polo", "Tee" - your best guess, "" if unclear
  "construction": {
    "sleeveLength": "short" | "long" | "sleeveless" | "unknown",
    "neckline": "crew" | "v-neck" | "collared" | "hooded" | "unknown",
    "sleeveConstruction": "set-in" | "raglan" | "unknown",
    "audience": "adult" | "youth" | "ladies" | "girls" | "unknown",
    "frontClosure": "pullover" | "full-button" | "partial-button" | "zip" | "unknown"
  },                          // visible physical construction only; do not infer from the printed design
  "artworkKind": "garment-mockup" | "flat-artwork" | "unknown", // mockup = image already shaped like a garment; flat-artwork = panel, graphic, or pattern to fit to a selected garment model
  "colors": [ { "name": string, "hex": string } ],  // 2-5 dominant colors actually used in the design
  "hasLogo": boolean,        // does the design include a crest/logo/emblem
  "hasNumber": boolean,      // does the design include a player number
  "hasTeamName": boolean,    // does the design include team lettering/wordmark
  "sleeveMarks": { "left": string, "right": string }, // exact visible left/right sleeve number or text; use "" if not visible
  "backName": string,        // exact player name visible on the supplied BACK image; "" if unavailable
  "backNumber": string,      // exact player number visible on the supplied BACK image; "" if unavailable
  "views": [{
    "view": "front" | "back" | "left" | "right",
    "summary": string
  }],
  "regions": [{
    "view": "front" | "back" | "left" | "right",
    "type": "logo" | "wordmark" | "player-name" | "player-number" | "sleeve-mark" | "pattern" | "trim" | "other",
    "value": string,
    "placement": string,
    "locationCode": string | null,
    "box": { "x": number, "y": number, "width": number, "height": number },
    "confidence": number
  }],
  "summary": string          // one plain sentence describing the design for a human reviewer
}

For construction.frontClosure, inspect the center-front garment construction itself: a continuous unbroken
front is "pullover"; buttons running substantially down the torso are "full-button"; a short neck placket is
"partial-button"; a visible zipper is "zip". Do not infer the closure from the printed artwork.

For each region, x/y/width/height are normalized to the labelled source image from 0 to 1, with x/y at the
top-left. Use tight boxes around the visible artwork. Detect discrete logos, wordmarks, player names, player
numbers, and sleeve marks separately. Include major continuous pattern and trim regions when they convey a
placement rule, but do not create dozens of tiny fragments. Keep at most 24 regions across all images.
Be conservative: if you cannot tell the sport or garment type, use "". Do not invent text, a team name,
number, unseen back art, hidden sleeve content, or an audience that is not visually supportable. Respond with JSON only.`;

/**
 * Appended only when the matched style publishes real decoration zones.
 * Without it the model returns free-text placement ("centre chest") which
 * cannot be acted on mechanically; with it, each detected region is tagged
 * with the manufacturer's own code. Codes are re-validated against this list
 * after parsing, so a hallucinated code is dropped rather than trusted.
 */
function zoneInstruction(zones: Array<{ code: string; meaning: string; panel: string }>): string {
  if (zones.length === 0) return "";
  const list = zones.map((z) => `  ${z.code} = ${z.meaning} (panel: ${z.panel})`).join("\n");
  return `

This garment has a fixed set of manufacturer decoration locations. For every region, set "locationCode" to the ONE code below whose described position best matches where the mark actually sits. If none genuinely fits, or you are not reasonably confident, set it to null - a wrong code is far worse than null, because production places artwork from it.
Valid codes:
${list}`;
}

function stripFences(text: string): string {
  return text.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
}

function fallbackAnalysis(summary: string): ArtworkAnalysis {
  return {
    sport: "",
    garmentType: "",
    construction: {
      sleeveLength: "unknown",
      neckline: "unknown",
      sleeveConstruction: "unknown",
      audience: "unknown",
      frontClosure: "unknown",
    },
    artworkKind: "unknown",
    colors: [],
    hasLogo: false,
    hasNumber: false,
    hasTeamName: false,
    sleeveMarks: {},
    backName: "",
    backNumber: "",
    views: [],
    regions: [],
    summary,
  };
}

const ALLOWED_VIEWS = new Set<ArtworkView>(["front", "back", "left", "right"]);
const ALLOWED_REGION_TYPES = new Set<ArtworkRegionType>([
  "logo",
  "wordmark",
  "player-name",
  "player-number",
  "sleeve-mark",
  "pattern",
  "trim",
  "other",
]);

function normalizedNumber(value: unknown, fallback = 0): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : fallback;
}

function parseRegions(
  value: unknown,
  zones: Array<{ code: string; meaning: string; panel: string }> = [],
): ArtworkRegion[] {
  const zoneByCode = new Map(zones.map((z) => [z.code.toUpperCase(), z]));
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .filter((item) => typeof item.view === "string" && ALLOWED_VIEWS.has(item.view as ArtworkView))
    .map((item, index) => {
      const rawBox = typeof item.box === "object" && item.box !== null ? item.box as Record<string, unknown> : {};
      const x = normalizedNumber(rawBox.x);
      const y = normalizedNumber(rawBox.y);
      const width = Math.min(normalizedNumber(rawBox.width), 1 - x);
      const height = Math.min(normalizedNumber(rawBox.height), 1 - y);
      const rawType = typeof item.type === "string" ? item.type : "other";
      const type = ALLOWED_REGION_TYPES.has(rawType as ArtworkRegionType) ? rawType as ArtworkRegionType : "other";
      const view = item.view as ArtworkView;
      // Validate against the style's real published list; anything else -> null.
      const rawCode = typeof item.locationCode === "string" ? item.locationCode.trim().toUpperCase() : "";
      const zone = rawCode ? zoneByCode.get(rawCode) : undefined;
      return {
        id: `${view}-${type}-${index + 1}`,
        view,
        type,
        value: typeof item.value === "string" ? item.value.trim().slice(0, 120) : "",
        placement: typeof item.placement === "string" ? item.placement.trim().slice(0, 180) : "",
        locationCode: zone ? zone.code : null,
        locationLabel: zone ? zone.meaning : null,
        box: { x, y, width, height },
        confidence: normalizedNumber(item.confidence, 0.5),
      };
    })
    .filter((item) => item.box.width >= 0.01 && item.box.height >= 0.01)
    .slice(0, 24);
}

export async function analyzeArtwork(
  views: Array<{ view: ArtworkView; buffer: Buffer; mimeType: string }>,
  /** the matched style's real decoration zones when it publishes them; empty
   *  for styles with none, in which case every region gets locationCode null */
  zones: Array<{ code: string; meaning: string; panel: string }> = [],
): Promise<ArtworkAnalysis> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return fallbackAnalysis(
      "AI analysis is unavailable (GEMINI_API_KEY is not set in this app's .env). " +
        "Fill in the sport, garment type and colors yourself before continuing.",
    );
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: MODEL_ID });

  const result = await model.generateContent([
    { text: BASE_PROMPT + zoneInstruction(zones) },
    ...views.flatMap((asset) => [
      { text: `VIEW: ${asset.view.toUpperCase()}` },
      { inlineData: { data: asset.buffer.toString("base64"), mimeType: asset.mimeType } },
    ]),
  ]);

  const text = result.response.text();
  try {
    const parsed = JSON.parse(stripFences(text));
    const rawConstruction = typeof parsed.construction === "object" && parsed.construction !== null
      ? parsed.construction as Record<string, unknown>
      : {};
    const enumValue = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
      typeof value === "string" && allowed.includes(value as T) ? value as T : fallback;
    const analysis: ArtworkAnalysis = {
      sport: typeof parsed.sport === "string" ? parsed.sport : "",
      garmentType: typeof parsed.garmentType === "string" ? parsed.garmentType : "",
      construction: {
        sleeveLength: enumValue(rawConstruction.sleeveLength, ["short", "long", "sleeveless", "unknown"] as const, "unknown"),
        neckline: enumValue(rawConstruction.neckline, ["crew", "v-neck", "collared", "hooded", "unknown"] as const, "unknown"),
        sleeveConstruction: enumValue(rawConstruction.sleeveConstruction, ["set-in", "raglan", "unknown"] as const, "unknown"),
        audience: enumValue(rawConstruction.audience, ["adult", "youth", "ladies", "girls", "unknown"] as const, "unknown"),
        frontClosure: enumValue(rawConstruction.frontClosure, ["pullover", "full-button", "partial-button", "zip", "unknown"] as const, "unknown"),
      },
      artworkKind: parsed.artworkKind === "garment-mockup" || parsed.artworkKind === "flat-artwork"
        ? parsed.artworkKind
        : "unknown",
      colors: Array.isArray(parsed.colors)
        ? parsed.colors
            .filter((c: unknown): c is { name: unknown; hex: unknown } => typeof c === "object" && c !== null)
            .map((c: { name: unknown; hex: unknown }) => ({
              name: typeof c.name === "string" ? c.name : "",
              hex: typeof c.hex === "string" ? c.hex : "#000000",
            }))
        : [],
      hasLogo: Boolean(parsed.hasLogo),
      hasNumber: Boolean(parsed.hasNumber),
      hasTeamName: Boolean(parsed.hasTeamName),
      sleeveMarks: typeof parsed.sleeveMarks === "object" && parsed.sleeveMarks !== null
        ? {
            left: typeof parsed.sleeveMarks.left === "string" ? parsed.sleeveMarks.left.slice(0, 12) : undefined,
            right: typeof parsed.sleeveMarks.right === "string" ? parsed.sleeveMarks.right.slice(0, 12) : undefined,
          }
        : {},
      backName: typeof parsed.backName === "string" ? parsed.backName.trim().slice(0, 40) : "",
      backNumber: typeof parsed.backNumber === "string" ? parsed.backNumber.trim().slice(0, 12) : "",
      views: Array.isArray(parsed.views)
        ? parsed.views
            .filter((item: unknown): item is Record<string, unknown> => typeof item === "object" && item !== null)
            .filter((item: Record<string, unknown>) => typeof item.view === "string" && ALLOWED_VIEWS.has(item.view as ArtworkView))
            .map((item: Record<string, unknown>) => ({
              view: item.view as ArtworkView,
              summary: typeof item.summary === "string" ? item.summary.slice(0, 300) : "",
              regionCount: 0,
            }))
        : [],
      regions: parseRegions(parsed.regions, zones),
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
    };
    const counts = new Map<ArtworkView, number>();
    for (const region of analysis.regions) counts.set(region.view, (counts.get(region.view) ?? 0) + 1);
    analysis.views = analysis.views.map((view) => ({ ...view, regionCount: counts.get(view.view) ?? 0 }));
    return analysis;
  } catch {
    return fallbackAnalysis(`AI response could not be parsed as JSON. Raw model output: ${text.slice(0, 300)}`);
  }
}
