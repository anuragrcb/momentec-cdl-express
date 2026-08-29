import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ArtworkView } from "./types";

/**
 * Fills in garment views the customer did not upload.
 *
 * "nano-banana" is Google's image model line; the current stable id is
 * gemini-3.1-flash-image (there is also nano-banana-pro-preview and
 * gemini-3-pro-image - both preview). Confirmed present on this key by
 * listing /v1beta/models rather than assuming an id.
 *
 * WHAT THIS IS, HONESTLY
 * ----------------------
 * A generated view is an INVENTION. The model has never seen the back of this
 * garment; it extrapolates from the views that were supplied. That is fine for
 * a visual concept and for giving a 3D proof something to show, and it is NOT
 * fine as production reference - an artist working from a fabricated sleeve
 * would be reproducing something the customer never approved.
 *
 * So every generated view is returned tagged `generated: true` with the views
 * it was derived from, callers are expected to surface that, and generation is
 * never silently substituted for an upload.
 */

const IMAGE_MODEL = "gemini-3.1-flash-image";

/** Which real views are most useful as reference for inventing each missing one. */
const REFERENCE_PRIORITY: Record<ArtworkView, ArtworkView[]> = {
  front: ["back", "left", "right"],
  back: ["front", "left", "right"],
  left: ["front", "back", "right"],
  right: ["front", "back", "left"],
};

/** The mirror of each side - used to tell the model "make this the OTHER side". */
const OPPOSITE: Partial<Record<ArtworkView, ArtworkView>> = {
  left: "right",
  right: "left",
};

const VIEW_DESCRIPTION: Record<ArtworkView, string> = {
  front: "the FRONT of the garment, viewed straight on",
  back: "the BACK of the garment, viewed straight on",
  left: "the LEFT sleeve/side of the garment, viewed straight on from the wearer's left",
  right: "the RIGHT sleeve/side of the garment, viewed straight on from the wearer's right",
};

export interface SuppliedView {
  view: ArtworkView;
  buffer: Buffer;
  mimeType: string;
}

export interface GeneratedView {
  view: ArtworkView;
  /** PNG bytes of the generated view */
  buffer: Buffer;
  mimeType: string;
  /** always true - this did not come from the customer */
  generated: true;
  /** which supplied views it was extrapolated from */
  derivedFrom: ArtworkView[];
  note: string;
}

export interface ViewGenerationResult {
  status: "complete" | "unavailable" | "failed" | "nothing-to-do";
  generated: GeneratedView[];
  /** views still missing after generation (e.g. individual failures) */
  stillMissing: ArtworkView[];
  message: string;
}

function buildPrompt(target: ArtworkView, refs: ArtworkView[], oppositeShown: boolean): string {
  const opposite = OPPOSITE[target];
  const contrast = oppositeShown && opposite
    ? `

CRITICAL: one of the attached references is the ${opposite.toUpperCase()} side of this same garment. You are producing the ${target.toUpperCase()} side, which is the OPPOSITE side. It is a different physical panel and it usually carries DIFFERENT decoration - for example a team logo on one sleeve and a player number on the other. Do NOT simply copy or mirror the ${opposite} reference. Reproduce the garment's colours, pattern flow and trim faithfully, but show what genuinely belongs on the ${target} side, and if the ${opposite} side carries a mark that clearly belongs only there, do not repeat it here.`
    : "";
  return `You are completing a set of product photographs of ONE single custom team-sports garment.${contrast}

The attached image(s) show this exact garment: ${refs.map((r) => VIEW_DESCRIPTION[r]).join("; ")}.

Produce ONE image showing ${VIEW_DESCRIPTION[target]}.

Hard requirements:
- It must be the SAME garment: identical colours, identical fabric pattern, identical style lines, identical trim.
- Match the lighting, framing, scale and background of the supplied image(s) so the set looks consistent.
- The garment must be laid out flat / presented the same way as the supplied image(s), centred, straight on.
- Do NOT invent logos, team names, player names, numbers or sponsor marks that are not visible in the supplied image(s). Where such a mark would sit on this view but you cannot see it in the references, leave that area as plain fabric.
- Do NOT add people, mannequins, hangers, watermarks, text labels or drop shadows that are not already in the references.

Output only the image.`;
}

/**
 * Generates the views in `missing`, using `supplied` as reference.
 * Each view is a separate call so one failure does not lose the others.
 */
export async function generateMissingViews(
  supplied: SuppliedView[],
  missing: ArtworkView[],
): Promise<ViewGenerationResult> {
  if (missing.length === 0) {
    return { status: "nothing-to-do", generated: [], stillMissing: [], message: "All four views were supplied; nothing was generated." };
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      status: "unavailable",
      generated: [],
      stillMissing: missing,
      message: "GEMINI_API_KEY is not set, so missing views were not generated. Only the views you uploaded are in use.",
    };
  }
  if (supplied.length === 0) {
    return {
      status: "failed",
      generated: [],
      stillMissing: missing,
      message: "At least one real uploaded view is required before any other view can be generated.",
    };
  }

  const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: IMAGE_MODEL });
  // `pool` starts as the customer's real uploads and GROWS as views are
  // generated. Without this, asking for "left" and "right" off the same
  // front+back pair gives both calls identical inputs and a near-identical
  // prompt - and the model duly returned two near-identical sides, which is
  // exactly the bug reported. Feeding the first generated side in as a
  // reference for the second gives the model something to differ FROM.
  const pool = new Map<ArtworkView, SuppliedView>(supplied.map((s) => [s.view, s]));
  const generated: GeneratedView[] = [];
  const stillMissing: ArtworkView[] = [];

  for (const target of missing) {
    // reference with the most informative available views, best first
    const refs = REFERENCE_PRIORITY[target].filter((v) => pool.has(v));
    if (refs.length === 0) {
      stillMissing.push(target);
      continue;
    }
    try {
      const parts = [
        { text: buildPrompt(target, refs, refs.includes(OPPOSITE[target] as ArtworkView)) },
        ...refs.flatMap((view) => {
          const asset = pool.get(view)!;
          return [
            { text: `REFERENCE VIEW: ${view}` },
            { inlineData: { data: asset.buffer.toString("base64"), mimeType: asset.mimeType } },
          ];
        }),
      ];
      const result = await model.generateContent(parts);
      const candidateParts = result.response.candidates?.[0]?.content?.parts ?? [];
      const imagePart = candidateParts.find((p) => "inlineData" in p && p.inlineData?.data);
      const data = imagePart && "inlineData" in imagePart ? imagePart.inlineData?.data : undefined;
      if (!data) {
        stillMissing.push(target);
        continue;
      }
      const outBuf = Buffer.from(data, "base64");
      const outMime = imagePart && "inlineData" in imagePart ? (imagePart.inlineData?.mimeType ?? "image/png") : "image/png";
      // make this view available as reference for the remaining ones
      pool.set(target, { view: target, buffer: outBuf, mimeType: outMime });
      generated.push({
        view: target,
        buffer: outBuf,
        mimeType: outMime,
        generated: true,
        derivedFrom: refs,
        note: `Generated from your ${refs.join(" and ")} view${refs.length > 1 ? "s" : ""}. This view was not photographed - treat it as a visual concept, not approved artwork.`,
      });
    } catch {
      stillMissing.push(target);
    }
  }

  if (generated.length === 0) {
    return {
      status: "failed",
      generated: [],
      stillMissing,
      message: "No views could be generated. Only the views you uploaded are in use.",
    };
  }
  return {
    status: "complete",
    generated,
    stillMissing,
    message:
      `Generated ${generated.length} missing view${generated.length > 1 ? "s" : ""} (${generated.map((g) => g.view).join(", ")}) from your uploads. ` +
      `These are extrapolations, not photographs of the real garment, and are marked as generated throughout.` +
      (stillMissing.length ? ` Could not generate: ${stillMissing.join(", ")}.` : ""),
  };
}
