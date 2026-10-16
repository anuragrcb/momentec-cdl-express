import OpenAI from "openai";

export type JsonSchema = {
  type: "object" | "string" | "number" | "boolean" | "array" | "integer";
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  enum?: string[];
  additionalProperties?: false;
};

export type VisionPart = { text: string } | { data: string; mimeType: string };

export async function completeJson(apiKey: string, name: string, schema: JsonSchema, parts: VisionPart[]): Promise<unknown> {
  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4.1",
    temperature: 0,
    response_format: {
      type: "json_schema",
      json_schema: {
        name,
        strict: true,
        schema,
      },
    },
    messages: [
      {
        role: "user",
        content: parts.map((part) =>
          "text" in part
            ? { type: "text" as const, text: part.text }
            : { type: "image_url" as const, image_url: { url: `data:${part.mimeType};base64,${part.data}` } },
        ),
      },
    ],
  });
  const raw = completion.choices[0]?.message?.content?.trim() ?? "";
  if (!raw) throw new Error("OpenAI returned an empty response.");
  return JSON.parse(raw) as unknown;
}
