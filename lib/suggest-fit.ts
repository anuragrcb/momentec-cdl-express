import { GARMENT_CATEGORIES, GARMENT_GENDERS, readGarmentSuggestion } from "./mark-measure";
import { completeJson } from "./openai-json";

const SUGGEST_PROMPT = `Look at this uploaded garment photo and choose the closest Momentec form values.
Pick the category from the garment itself (a baseball jersey is BASEBALL, a tee is TEES, shorts are BOTTOMS). Do not choose the sport from a printed team name or logo.
Pick Youth only when the garment is clearly a youth or kids cut. Pick Women for a ladies cut. Otherwise pick Men.

Reply with one category and one gender from the allowed values.`;

export async function suggestGarmentFit(photo: Buffer, mimeType: string): Promise<{ category: string; gender: string } | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const parsed = await completeJson(apiKey, "suggest_fit", {
    type: "object",
    additionalProperties: false,
    properties: {
      category: { type: "string", enum: [...GARMENT_CATEGORIES] },
      gender: { type: "string", enum: [...GARMENT_GENDERS] },
    },
    required: ["category", "gender"],
  }, [
    { text: SUGGEST_PROMPT },
    { data: photo.toString("base64"), mimeType },
  ]);
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as Record<string, unknown>;
  return readGarmentSuggestion(record.category, record.gender);
}
