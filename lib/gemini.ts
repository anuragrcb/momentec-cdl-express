import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ArtworkAnalysis } from "./types";

// Same key source pattern as the sibling 3d-garment-retexture service:
// GEMINI_API_KEY read from this app's own .env (via @nestjs/config-free plain
// process.env here, since this is a standalone Next.js app, not JourneyAX).
const MODEL_ID = "gemini-2.0-flash";

const PROMPT = `You are looking at a piece of team-sports jersey artwork (a customer's own
AI-generated or original design, front/back/side views may be included). Identify what you can
see and answer ONLY with strict JSON matching this exact shape, no markdown fences, no commentary:

{
  "sport": string,           // e.g. "Hockey", "Baseball", "Soccer", "Football", "Basketball" - your best guess, "" if unclear
  "garmentType": string,     // e.g. "Jersey", "Pullover", "Polo", "Tee" - your best guess, "" if unclear
  "colors": [ { "name": string, "hex": string } ],  // 2-5 dominant colors actually used in the design
  "hasLogo": boolean,        // does the design include a crest/logo/emblem
  "hasNumber": boolean,      // does the design include a player number
  "hasTeamName": boolean,    // does the design include team lettering/wordmark
  "summary": string          // one plain sentence describing the design for a human reviewer
}

Be conservative: if you cannot tell the sport or garment type, use "". Do not invent a team name or
number that isn't visibly present. Respond with JSON only.`;

function stripFences(text: string): string {
  return text.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
}

function fallbackAnalysis(summary: string): ArtworkAnalysis {
  return {
    sport: "",
    garmentType: "",
    colors: [],
    hasLogo: false,
    hasNumber: false,
    hasTeamName: false,
    summary,
  };
}

export async function analyzeArtwork(imageBuffer: Buffer, mimeType: string): Promise<ArtworkAnalysis> {
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
    { text: PROMPT },
    { inlineData: { data: imageBuffer.toString("base64"), mimeType } },
  ]);

  const text = result.response.text();
  try {
    const parsed = JSON.parse(stripFences(text));
    return {
      sport: typeof parsed.sport === "string" ? parsed.sport : "",
      garmentType: typeof parsed.garmentType === "string" ? parsed.garmentType : "",
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
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
    };
  } catch {
    return fallbackAnalysis(`AI response could not be parsed as JSON. Raw model output: ${text.slice(0, 300)}`);
  }
}
