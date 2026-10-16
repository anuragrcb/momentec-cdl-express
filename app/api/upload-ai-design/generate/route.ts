import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { CatalogMatchError, type CatalogMatchResult } from "@/lib/catalog-match";
import { generateMissingSheet, readEditMatch, SHEET_VIEWS, type ArtworkView, type DesignReference } from "@/lib/upload-ai-sheet";

export const runtime = "nodejs";
export const maxDuration = 300;

const MIME: Record<string, string> = {
  "image/png": "image/png",
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/webp": "image/webp",
};

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Upload at least one image." }, { status: 400 });

  const references: DesignReference[] = [];
  for (const value of form.getAll("reference")) {
    if (!(value instanceof File) || value.size === 0) continue;
    const mimeType = MIME[value.type];
    if (!mimeType) return NextResponse.json({ error: "Use a jpg, png, or webp image." }, { status: 400 });
    references.push({ buffer: Buffer.from(await value.arrayBuffer()), mimeType });
  }

  if (references.length === 0) {
    return NextResponse.json({ error: "At least one uploaded image is required." }, { status: 400 });
  }

  const instructionValue = form.get("instruction");
  const instruction = typeof instructionValue === "string" ? instructionValue : "";
  const genderValue = form.get("gender");
  const gender = typeof genderValue === "string" ? genderValue : "";
  const categoryValue = form.get("category");
  const category = typeof categoryValue === "string" ? categoryValue : "";
  const edit = await readEdit(form, instruction);
  if (edit instanceof NextResponse) return edit;
  if (!edit && (!gender.trim() || !category.trim())) {
    return NextResponse.json({ error: "Choose a category and a gender before making the four views." }, { status: 400 });
  }

  try {
    const flattened = await Promise.all(references.map((item) => flattenOnWhite(item)));
    const { sheet, views, match } = await generateMissingSheet(flattened, instruction, { gender, category, edit });
    const encoded: Partial<Record<ArtworkView, string>> = {};
    for (const view of SHEET_VIEWS) {
      const png = views[view];
      if (png) encoded[view] = png.toString("base64");
    }
    return NextResponse.json({
      images: encoded,
      sheet: sheet.toString("base64"),
      ...(match
        ? {
            style: match.style,
            query: match.query,
            matches: match.matches,
            plan: match.plan,
            limits: match.limits,
            template: match.templateSheet.toString("base64"),
            catalog: {
              ...match.winner,
              plan: match.plan,
            },
          }
        : {}),
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Make the four views before applying an edit.") {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof CatalogMatchError) {
      return NextResponse.json(
        {
          error: err.message,
          query: err.query,
          style: null,
          matches: err.matches,
        },
        { status: err.status },
      );
    }
    const message = err instanceof Error ? err.message : "Could not generate the other views.";
    console.error("upload-ai-design generate failed:", message);
    const status = message === "MAGNIFIC_API_KEY is not set." ? 503 : 502;
    const safe = status === 503 ? message : "Could not generate the other views.";
    return NextResponse.json({ error: safe }, { status });
  }
}

async function readEdit(form: FormData, instruction: string): Promise<CatalogMatchResult | undefined | NextResponse> {
  if (!instruction.trim()) return undefined;
  const templateValue = form.get("template");
  const catalogValue = form.get("catalog");
  if (!(templateValue instanceof File) || templateValue.size === 0 || typeof catalogValue !== "string") {
    return NextResponse.json({ error: "Make the four views before applying an edit." }, { status: 400 });
  }
  const match = readEditMatch(catalogValue, Buffer.from(await templateValue.arrayBuffer()));
  if (!match) return NextResponse.json({ error: "Make the four views before applying an edit." }, { status: 400 });
  return match;
}

async function flattenOnWhite(item: DesignReference): Promise<DesignReference> {
  const meta = await sharp(item.buffer).metadata();
  if (!meta.hasAlpha) return item;
  return { mimeType: "image/png", buffer: await sharp(item.buffer).flatten({ background: "#ffffff" }).png().toBuffer() };
}
