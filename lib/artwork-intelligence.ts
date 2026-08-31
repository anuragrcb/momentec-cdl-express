import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ArtworkColor, ArtworkElement, ArtworkIntelligence, ArtworkView } from "./types";

const MODEL_ID = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const ALLOWED_VIEWS = new Set<ArtworkView>(["front", "back", "left", "right"]);
const ALLOWED_TYPES = new Set<ArtworkElement["type"]>([
  "logo",
  "team-name",
  "player-name",
  "player-number",
  "pattern",
  "other",
]);

const BASE_PROMPT = `You are preparing a structured artwork-intelligence brief for a sportswear production artist.
The image attachments are the customer-approved views of one custom uniform. The supplied view label appears before each image.
Return ONLY strict JSON with this shape:
{
  "summary": string,
  "dominantColors": [{"name": string, "hex": string}],
  "elements": [{
    "type": "logo" | "team-name" | "player-name" | "player-number" | "pattern" | "other",
    "view": "front" | "back" | "left" | "right",
    "content": string,
    "placement": string,
    "locationCode": string | null,
    "dynamic": boolean,
    "confidence": "high" | "medium" | "low"
  }],
  "typography": [{"view": "front" | "back" | "left" | "right", "text": string, "visualStyle": string}],
  "productionNotes": [string]
}
Describe only what is visibly supported by the approved customer images. A number or a player name is dynamic only when it is visibly a personalization field or clearly presented as such. Do not claim to know an exact commercial font from pixels; describe its visual style instead. Do not claim an image/logo has been converted to a vector file. Production artist validation is mandatory for every extracted item.`;

/**
 * Appended when the matched style publishes a real decoration-zone list.
 *
 * Without this the model returns only free-text `placement` ("centre chest"),
 * which a production artist cannot act on mechanically. Feeding it the actual
 * codes from the style's decorations SVG turns placement into Augusta's own
 * vocabulary. The returned code is validated against this same list before it
 * reaches the caller, so a hallucinated code is dropped rather than trusted.
 */
function zoneInstruction(zones: Array<{ code: string; meaning: string; panel: string }>): string {
  if (zones.length === 0) return "";
  const list = zones.map((z) => `  ${z.code} = ${z.meaning} (panel: ${z.panel})`).join("\n");
  return `

This garment has a fixed set of manufacturer decoration locations. For every element you return, set "locationCode" to the ONE code below whose described position best matches where the mark actually sits in the image. If no code genuinely fits, or you are not reasonably confident, set "locationCode" to null - a wrong code is far worse than null, because production will place artwork from it.
Valid codes:
${list}`;
}

function stripFences(value: string): string {
  return value.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
}

function colorList(value: unknown): ArtworkColor[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is { name?: unknown; hex?: unknown } => typeof item === "object" && item !== null)
    .map((item) => ({
      name: typeof item.name === "string" ? item.name : "Unspecified",
      hex: typeof item.hex === "string" && /^#[0-9a-f]{6}$/i.test(item.hex) ? item.hex : "#000000",
    }))
    .slice(0, 8);
}

function elements(
  value: unknown,
  zones: Array<{ code: string; meaning: string; panel: string }> = [],
): ArtworkElement[] {
  if (!Array.isArray(value)) return [];
  const byCode = new Map(zones.map((z) => [z.code.toUpperCase(), z]));
  return value
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .filter((item) => typeof item.view === "string" && ALLOWED_VIEWS.has(item.view as ArtworkView))
    .map((item) => {
      // Validate the model's zone pick against the real published list. A code
      // that isn't in the style's own decorations SVG is dropped to null - we
      // would rather show "unmapped" than feed production a placement the
      // manufacturer never defined.
      const raw = typeof item.locationCode === "string" ? item.locationCode.trim().toUpperCase() : "";
      const zone = raw ? byCode.get(raw) : undefined;
      return {
        type: typeof item.type === "string" && ALLOWED_TYPES.has(item.type as ArtworkElement["type"])
          ? item.type as ArtworkElement["type"]
          : "other",
        view: item.view as ArtworkView,
        content: typeof item.content === "string" ? item.content.slice(0, 160) : "",
        placement: typeof item.placement === "string" ? item.placement.slice(0, 160) : "",
        locationCode: zone ? zone.code : null,
        locationLabel: zone ? zone.meaning : null,
        dynamic: Boolean(item.dynamic),
        confidence: item.confidence === "high" || item.confidence === "medium" || item.confidence === "low"
          ? item.confidence
          : "low",
        artistValidationRequired: true,
      };
    });
}

export async function extractArtworkIntelligence(
  views: Array<{ view: ArtworkView; buffer: Buffer; mimeType: string }>,
  /** the matched style's real decoration zones, when it publishes them - see
   *  zoneInstruction(). Omit for styles with no published zone list; every
   *  element then comes back with locationCode: null. */
  zones: Array<{ code: string; meaning: string; panel: string }> = [],
): Promise<ArtworkIntelligence> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      status: "unavailable",
      summary: "Artwork extraction was not run because the vision service is not configured.",
      dominantColors: [],
      logos: [],
      textAndNumbers: [],
      typography: [],
      productionNotes: ["Original and prepared images remain attached for mandatory artist review."],
      message: "GEMINI_API_KEY is not set. The approved artwork remains available to the artist, but structured extraction was skipped.",
    };
  }

  try {
    const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: MODEL_ID });
    const parts = [
      { text: BASE_PROMPT + zoneInstruction(zones) },
      ...views.flatMap((asset) => [
        { text: `VIEW: ${asset.view}` },
        { inlineData: { data: asset.buffer.toString("base64"), mimeType: asset.mimeType } },
      ]),
    ];
    const result = await model.generateContent(parts);
    const parsed = JSON.parse(stripFences(result.response.text())) as Record<string, unknown>;
    const allElements = elements(parsed.elements, zones);
    return {
      status: "complete",
      summary: typeof parsed.summary === "string" ? parsed.summary.slice(0, 600) : "Approved artwork package extracted for artist review.",
      dominantColors: colorList(parsed.dominantColors),
      logos: allElements.filter((element) => element.type === "logo"),
      textAndNumbers: allElements.filter((element) => element.type !== "logo"),
      typography: Array.isArray(parsed.typography)
        ? parsed.typography
            .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
            .filter((item) => typeof item.view === "string" && ALLOWED_VIEWS.has(item.view as ArtworkView))
            .map((item) => ({
              view: item.view as ArtworkView,
              text: typeof item.text === "string" ? item.text.slice(0, 160) : "",
              visualStyle: typeof item.visualStyle === "string" ? item.visualStyle.slice(0, 240) : "Not determined",
              exactFontIdentified: false as const,
              artistValidationRequired: true as const,
            }))
            .slice(0, 16)
        : [],
      productionNotes: Array.isArray(parsed.productionNotes)
        ? parsed.productionNotes.filter((note): note is string => typeof note === "string").slice(0, 12)
        : [],
      message: "Structured reference data was extracted from the approved artwork. An artist must validate all logo, font, placement and cut-piece decisions.",
    };
  } catch (error) {
    return {
      status: "failed",
      summary: "Artwork extraction could not be completed automatically.",
      dominantColors: [],
      logos: [],
      textAndNumbers: [],
      typography: [],
      productionNotes: ["Original and prepared images remain attached for mandatory artist review."],
      message: `Artwork extraction failed (${error instanceof Error ? error.message : "unknown error"}).`,
    };
  }
}
