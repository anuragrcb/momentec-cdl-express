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

export type ArtworkView = "front" | "back" | "left" | "right";

export const SHEET_VIEWS: ArtworkView[] = ["front", "back", "left", "right"];

const ANGLE: Record<ArtworkView, string> = {
  front: "the FRONT of that one solid 3D garment, orthographic, straight on. The chest faces the camera. Sleeves have thickness and come slightly forward. The collar is an opening, not a flat ring",
  back: "the BACK of the same solid 3D garment, orthographic, turned 180 degrees. The back panel faces the camera. Sleeves keep the same thickness. The collar opening is still a hole",
  left: "the LEFT side of the same solid 3D garment, a true 90 degree turn. This is the side on the viewer's left in the front view, and the front of the garment points toward the left edge of the cell. Show the depth of the torso and the sleeve as a form, not a paper-thin outline",
  right: "the RIGHT side of the same solid 3D garment, a true 90 degree turn. This is the side on the viewer's right in the front view, and the front of the garment points toward the right edge of the cell. Show the depth of the torso and the sleeve as a form, not a paper-thin outline",
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
      : "  - NONE (do NOT place any logos, crests, patches, or graphics anywhere on the garment, even if present on Image 2).";

  const textLines =
    match.plan.textMapping.length > 0
      ? match.plan.textMapping.map((line) => `  - ${line}`).join("\n")
      : "  - NONE (do NOT place any text, wordmarks, names, or numbers anywhere on the garment, even if present on Image 2).";

  const allowedLogoList =
    match.winner.logo_locations
      .filter((l) => !l.legacy && (l.name || l.code))
      .map((l) => (l.code && l.name ? `${l.name} (${l.code})` : l.name || l.code))
      .join(", ") || "none";

  const allowedTextList =
    match.winner.text_locations
      .filter((t) => !t.legacy && (t.name || t.code))
      .map((t) => (t.code && t.name ? `${t.name} (${t.code})` : t.name || t.code))
      .join(", ") || "none";

  return `Project the customer's custom garment design onto the exact 2x2 3D catalog garment template shown in Image 1.

- Image 1 is the manufacturer's 2x2 3D garment template for catalog style ${match.style} ("${match.winner.name}"). Its four cells show:
  - Top-left cell: ${ANGLE.front}
  - Top-right cell: ${ANGLE.back}
  - Bottom-left cell: ${ANGLE.left}
  - Bottom-right cell: ${ANGLE.right}
- ${designImages}

Critical shape & construction rules (MUST follow Image 1):
- Keep the EXACT 3D garment silhouette, collar/neckline cut, sleeve cut & length, button placket (if present in Image 1), hem shape, 3D volume, camera angles, scale, and 2x2 cell positions of Image 1.
- Do NOT alter the garment cut to match Image 2 if Image 2 has a different collar, sleeve, or hem. Image 1 is the only manufacturable garment shape.

Critical color rules (MUST follow the snapped Momentec catalog hex codes below):
- Every color in the specification below has already been matched to the closest manufacturable Momentec brand color and #RRGGBB hex code for style ${match.style} (${match.winner.brand || "Momentec"}).
- Paint every fabric color zone, collar/trim, button, logo, wordmark, and number using the exact Momentec color name and #RRGGBB hex code listed below — even if Image 2 shows a different raw shade or hue. Do NOT copy unsnapped shades from Image 2 when a Momentec hex code is specified below.

Critical placement rules (ONLY supported catalog locations for style ${match.style} may be decorated):
- Style ${match.style} ONLY supports these logo locations: ${allowedLogoList}.
- Style ${match.style} ONLY supports these text/number locations: ${allowedTextList}.
- Render ONLY the logos listed under "Allowed logo placements to apply" and ONLY the text/numbers listed under "Allowed text/number placements to apply" below.
- If Image 2 has any logo, patch, graphic, wordmark, name, or number on a placement that is NOT explicitly listed below, DO NOT draw it — leave that area of the garment completely blank/clean fabric.

Catalog color-zone & decoration placement specification (mapped from the customer's design onto style ${match.style}):
- Color zones:
${colorLines}
- Allowed logo placements to apply:
${logoLines}
- Allowed text/number placements to apply:
${textLines}

Per-view projection breakdown:
- Top-left cell (FRONT view): ${match.plan.viewPlan.front}
- Top-right cell (BACK view): ${match.plan.viewPlan.back}
- Bottom-left cell (LEFT side view): ${match.plan.viewPlan.left}
- Bottom-right cell (RIGHT side view): ${match.plan.viewPlan.right}

Hard layout rules:
- Each cell contains exactly one garment. Never draw two garments or two angles together in one cell.
- Plain white background (#FFFFFF) in every cell. Keep the wide plain white cross through the exact center, horizontal and vertical, about one tenth of the sheet wide, cleanly separating the four cells. No garment may touch or cross that white cross. No shadow or backdrop.
- Draw each garment at full length from top edge to bottom edge inside its cell, matching Image 1's scale and placement.
- Do not draw any captions, labels, or view names. Only marks that belong on the garment fabric itself may appear.
- The garment is empty: no person, mannequin, hanger, neck, skin, or arms.
${editLine(editNote)}
Output only the completed 2x2 image.`;
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
  const gapY = splitGap(contentFlags(data, width, height, channels, "row"), height);
  const boxes = {
    front: { left: 0, top: 0, width: gapX.start, height: gapY.start },
    back: { left: gapX.end, top: 0, width: width - gapX.end, height: gapY.start },
    left: { left: 0, top: gapY.end, width: gapX.start, height: height - gapY.end },
    right: { left: gapX.end, top: gapY.end, width: width - gapX.end, height: height - gapY.end },
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
  if (!match) throw new Error("Make the four views before applying an edit.");
  const prompt = buildCatalogProjectionPrompt(match, references.length, trimmedInstruction);
  const sheet = await generateGptImageSheet(prompt, [
    { buffer: match.templateSheet, mimeType: "image/png" },
    ...references.map((item) => ({ buffer: item.buffer, mimeType: item.mimeType })),
  ]);
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
      left: typeof view.left === "string" ? view.left : "",
      right: typeof view.right === "string" ? view.right : "",
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
