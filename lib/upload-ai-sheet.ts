import sharp from "sharp";
import {
  matchCatalogGarment,
  type CatalogMatchResult,
  type GarmentProjectionPlan,
  type LocationItem,
  type MatchRow,
  type ZoneItem,
} from "./catalog-match";
import { generateGptImageSheet } from "./magnific";

export type ArtworkView = "front" | "back";

export const SHEET_VIEWS: ArtworkView[] = ["front", "back"];

const SHEET_ASPECT_RATIO = "standard_3_2";

export const EDIT_NEEDS_VIEWS = "Make the front and back views before applying an edit.";

const ANGLE: Record<ArtworkView, string> = {
  front: "the FRONT of that one solid 3D garment, orthographic, straight on. The chest faces the camera. Sleeves have thickness and come slightly forward. The collar is an opening, not a flat ring",
  back: "the BACK of the same solid 3D garment, orthographic, turned 180 degrees. The back panel faces the camera. Sleeves keep the same thickness. The collar opening is still a hole",
};

export interface DesignReference {
  buffer: Buffer;
  mimeType: string;
}

export function buildCatalogProjectionPrompt(match: CatalogMatchResult, referenceCount: number, editNote = ""): string {
  const designImages =
    referenceCount === 1
      ? "Image 2 is the customer's uploaded custom design reference."
      : `${Array.from({ length: referenceCount }, (_, i) => `Image ${i + 2}`).join(", ")} are the customer's uploaded custom design references.`;

  const colorLines =
    match.plan.colorZoneMapping.length > 0
      ? match.plan.colorZoneMapping.map((line) => `  - ${line}`).join("\n")
      : "  - Match the primary fabric colors, accent panels, and sublimation pattern shown in the customer's design.";

  const logoLines =
    match.plan.logoMapping.length > 0
      ? match.plan.logoMapping.map((line) => `  - ${line}`).join("\n")
      : "  - Copy any logos, crests, patches, or graphics shown in the customer's design at the same placement.";

  const textLines =
    match.plan.textMapping.length > 0
      ? match.plan.textMapping.map((line) => `  - ${line}`).join("\n")
      : "  - Copy any text, wordmarks, names, or numbers shown in the customer's design at the same placement.";

  return `Project the customer's custom garment design onto the exact side-by-side 3D catalog garment template shown in Image 1.

- Image 1 is the manufacturer's side-by-side 3D garment template for catalog style ${match.style} ("${match.winner.name}"). Its two cells show:
  - Left cell: ${ANGLE.front}
  - Right cell: ${ANGLE.back}
- ${designImages}

Critical shape & construction rules (MUST follow Image 1):
- Keep the EXACT 3D garment silhouette, collar/neckline cut, sleeve cut & length, button placket (if present in Image 1), hem shape, 3D volume, camera angles, scale, and left/right cell positions of Image 1.
- Do NOT alter the garment cut to match Image 2 if Image 2 has a different collar, sleeve, or hem. Image 1 is the only manufacturable garment shape.

Critical color rules (MUST follow the snapped Momentec catalog hex codes below):
- Every color in the specification below has already been matched to the closest manufacturable Momentec brand color and #RRGGBB hex code for style ${match.style} (${match.winner.brand || "Momentec"}).
- Paint every fabric color zone, collar/trim, button, logo, wordmark, and number using the exact Momentec color name and #RRGGBB hex code listed below — even if Image 2 shows a different raw shade or hue. Do NOT copy unsnapped shades from Image 2 when a Momentec hex code is specified below.

Placement rules (custom sublimated design — logos and text may go anywhere on the garment):
- Render every logo, patch, graphic, wordmark, name, and number from the customer's design, in the same place it sits on the customer's design, projected onto the matching spot of the Image 1 garment.
- Do not drop or move a mark because the catalog style does not list that placement. Do not invent marks that are not in the customer's design.

Catalog color-zone & decoration placement specification (mapped from the customer's design onto style ${match.style}):
- Color zones:
${colorLines}
- Logo placements to apply:
${logoLines}
- Text/number placements to apply:
${textLines}

Per-view projection breakdown:
- Left cell (FRONT view): ${match.plan.viewPlan.front}
- Right cell (BACK view): ${match.plan.viewPlan.back}

Hard layout rules:
- Exactly two cells side by side: FRONT on the left, BACK on the right. Do not add side views or any other angle.
- Each cell contains exactly one garment. Never draw two garments or two angles together in one cell.
- Plain white background (#FFFFFF) in both cells. Keep the wide plain white vertical band through the exact center, about one fifteenth of the sheet wide, cleanly separating the two cells. No garment may touch or cross that white band. No shadow or backdrop.
- Draw each garment at full length from top edge to bottom edge inside its cell, matching Image 1's scale and placement.
- Do not draw any captions, labels, or view names. Only marks that belong on the garment fabric itself may appear.
- The garment is empty: no person, mannequin, hanger, neck, skin, or arms.
${editLine(editNote)}
Output only the completed front and back image.`;
}

function editLine(note: string): string {
  const text = note.replace(/\s+/g, " ").trim().slice(0, 400);
  if (!text) return "";
  return `\nRequested change: ${text}\nApply that change on every view. Do not change the garment cut away from Image 1.\n`;
}

function isGarmentPixel(red: number, green: number, blue: number): boolean {
  return red < 245 || green < 245 || blue < 245;
}

function contentFlags(data: Buffer, width: number, height: number, channels: number, axis: "row" | "column"): boolean[] {
  const count = axis === "row" ? height : width;
  const span = axis === "row" ? width : height;
  const flags = new Array<boolean>(count).fill(false);
  for (let index = 0; index < count; index += 1) {
    let ink = 0;
    for (let step = 0; step < span; step += 1) {
      const x = axis === "row" ? step : index;
      const y = axis === "row" ? index : step;
      const offset = (y * width + x) * channels;
      if (isGarmentPixel(data[offset], data[offset + 1], data[offset + 2])) ink += 1;
    }
    flags[index] = ink / span >= 0.012;
  }
  return flags;
}

function splitGap(flags: boolean[], size: number): { start: number; end: number } {
  const minThickness = Math.max(8, Math.floor(size * 0.03));
  const groups: { start: number; end: number }[] = [];
  let index = 0;
  while (index < size) {
    if (!flags[index]) {
      index += 1;
      continue;
    }
    const start = index;
    while (index < size && flags[index]) index += 1;
    if (index - start >= minThickness) groups.push({ start, end: index });
  }
  const halfway = Math.floor(size / 2);
  let best = { start: halfway, end: halfway };
  let bestDistance = Infinity;
  for (let group = 0; group < groups.length - 1; group += 1) {
    const start = groups[group].end;
    const end = groups[group + 1].start;
    if (end - start < 2) continue;
    const mid = (start + end) / 2;
    if (mid < size * 0.2 || mid > size * 0.8) continue;
    const distance = Math.abs(mid - size / 2);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { start, end };
    }
  }
  return best;
}

export async function splitSheet(buffer: Buffer): Promise<Record<ArtworkView, Buffer>> {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const gapX = splitGap(contentFlags(data, width, height, channels, "column"), width);
  const boxes = {
    front: { left: 0, top: 0, width: gapX.start, height },
    back: { left: gapX.end, top: 0, width: width - gapX.end, height },
  };

  const entries = await Promise.all(
    SHEET_VIEWS.map(async (view) => {
      const png = await sharp(buffer).extract(boxes[view]).png().toBuffer();
      return [view, png] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<ArtworkView, Buffer>;
}

export async function generateMissingSheet(
  references: DesignReference[],
  instruction = "",
  options?: { gender?: string; category?: string; edit?: CatalogMatchResult },
): Promise<{ sheet: Buffer; views: Record<ArtworkView, Buffer>; match?: CatalogMatchResult }> {
  if (references.length === 0) throw new Error("At least one uploaded image is required.");

  const trimmedInstruction = instruction.trim();
  const match = trimmedInstruction
    ? options?.edit
    : await matchCatalogGarment(references[0].buffer, references[0].mimeType, options);
  if (!match) throw new Error(EDIT_NEEDS_VIEWS);
  const prompt = buildCatalogProjectionPrompt(match, references.length, trimmedInstruction);
  const sheet = await generateGptImageSheet(
    prompt,
    [
      { buffer: match.templateSheet, mimeType: "image/png" },
      ...references.map((item) => ({ buffer: item.buffer, mimeType: item.mimeType })),
    ],
    { aspectRatio: SHEET_ASPECT_RATIO },
  );
  return { sheet, views: await splitSheet(sheet), match };
}

export function readEditMatch(raw: string, template: Buffer): CatalogMatchResult | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const style = typeof record.style === "string" ? record.style.trim() : "";
  if (!style || !record.plan || typeof record.plan !== "object") return null;
  const plan = record.plan as Record<string, unknown>;
  const view = plan.viewPlan && typeof plan.viewPlan === "object" ? (plan.viewPlan as Record<string, unknown>) : {};
  const projection: GarmentProjectionPlan = {
    colorZoneMapping: textList(plan.colorZoneMapping),
    logoMapping: textList(plan.logoMapping),
    textMapping: textList(plan.textMapping),
    viewPlan: {
      front: typeof view.front === "string" ? view.front : "",
      back: typeof view.back === "string" ? view.back : "",
    },
  };
  const winner: MatchRow = {
    style,
    name: typeof record.name === "string" ? record.name : "",
    brand: typeof record.brand === "string" ? record.brand : "",
    sport: typeof record.sport === "string" ? record.sport : "",
    segment: typeof record.segment === "string" ? record.segment : "",
    score: typeof record.score === "number" ? record.score : null,
    logo_locations: itemList<LocationItem>(record.logo_locations),
    text_locations: itemList<LocationItem>(record.text_locations),
    color_zones: itemList<ZoneItem>(record.color_zones),
  };
  return { query: "", style, winner, templateSheet: template, matches: [winner], plan: projection, limits: "" };
}

function textList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}

function itemList<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}
