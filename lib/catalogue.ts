import fs from "node:fs";
import path from "node:path";
import type { ArtworkAnalysis, CatalogueStyle, StyleMatch } from "./types";
import { hasApparel3dPreview } from "./apparel-assets";

const CATALOGUE_PATH = path.join(process.cwd(), "data", "template-library.json");

let cache: CatalogueStyle[] | null = null;

const VERIFIED_EXTERNAL_STYLES: CatalogueStyle[] = [
  {
    parentSku: "J180A",
    name: "FS Full Button Baseball Jersey",
    division: "Under Armour",
    sport: "Baseball",
    garmentType: "Top",
    category: "Baseball",
    sizes: ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"],
    coreSizesPresent: true,
    colorCount: 0,
    msrp: "0.00",
    image: "",
    w2pTemplate: "prod-J180A-decorations.svg",
    w2pUrlBase: "https://d31q5t9naund0c.cloudfront.net/onebuilder/svgfilesstage-pim2/",
    renderable: true,
    renderBytes: 898688,
    renderSize: "S/M/L size-specific GLBs",
  },
];

export function loadCatalogue(): CatalogueStyle[] {
  if (cache) return cache;
  const raw = fs.readFileSync(CATALOGUE_PATH, "utf8");
  const copiedCatalogue = JSON.parse(raw) as CatalogueStyle[];
  cache = [...VERIFIED_EXTERNAL_STYLES, ...copiedCatalogue.filter((style) => style.parentSku !== "J180A")];
  return cache;
}

const STOPWORDS = new Set([
  "the", "a", "an", "of", "and", "for", "with", "new", "fit", "series",
  "performance", "sublimated", "sublimation",
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[()/]/g, " ")
    .split(/[\s-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/**
 * The catalogue's sport/garmentType/category fields are only populated for
 * about a third of the 364 rows (the rest are empty strings) - so scoring
 * leans primarily on keyword overlap against the free-text `name` field,
 * with the structured fields used as a bonus signal when present.
 */
export function scoreStyle(analysis: ArtworkAnalysis, style: CatalogueStyle): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  const nameTokens = new Set(tokenize(style.name));
  const sportTokens = tokenize(analysis.sport);
  const garmentTokens = tokenize(analysis.garmentType);

  // Structured field match, when the row actually has one.
  if (style.sport && analysis.sport) {
    if (style.sport.toLowerCase() === analysis.sport.toLowerCase()) {
      score += 40;
      reasons.push(`catalogue sport "${style.sport}" matches`);
    } else if (nameTokens.has(analysis.sport.toLowerCase())) {
      score += 15;
    }
  }
  if (style.garmentType && analysis.garmentType) {
    const g = analysis.garmentType.toLowerCase();
    if (g.includes("jersey") || g.includes("top") || g.includes("shirt")) {
      if (style.garmentType.toLowerCase() === "top") {
        score += 15;
        reasons.push("garment type matches (top)");
      }
    }
  }

  // Free-text keyword overlap - the workhorse, since most rows have no
  // structured sport/garmentType at all.
  let hits = 0;
  for (const t of sportTokens) {
    if (nameTokens.has(t)) {
      hits += 1;
      score += 25;
    }
  }
  for (const t of garmentTokens) {
    if (nameTokens.has(t)) {
      hits += 1;
      score += 12;
    }
  }
  if (hits > 0) reasons.push(`name overlaps ${hits} keyword${hits > 1 ? "s" : ""} from the artwork read`);

  // Jersey-shaped garments are the overwhelmingly common case for this flow;
  // nudge toward "jersey" named items slightly so unrelated accessories/bottoms
  // don't crowd out plausible tops when the read is thin.
  if (nameTokens.has("jersey")) score += 5;

  if (hasApparel3dPreview(style.parentSku)) {
    score += 3; // tiny nudge - a usable 3D preview is a better experience, not a better match
    reasons.push("has a real 3D preview available");
  }

  return { score, reasons };
}

export function matchStyles(analysis: ArtworkAnalysis, limit = 8): StyleMatch[] {
  const catalogue = loadCatalogue();
  const scored = catalogue
    .filter((s) => s.renderable !== false)
    .map((style) => {
      const { score, reasons } = scoreStyle(analysis, style);
      return { style, score, reasons, has3dPreview: hasApparel3dPreview(style.parentSku) };
    })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score || (b.has3dPreview ? 1 : 0) - (a.has3dPreview ? 1 : 0));

  if (scored.length >= limit) return scored.slice(0, limit);

  // Thin/empty read (or a very unusual garment): fall back to the styles with
  // a real 3D preview so the customer still has something concrete to pick,
  // clearly ranked below the real matches.
  const already = new Set(scored.map((m) => m.style.parentSku));
  const fallback = catalogue
    .filter((s) => hasApparel3dPreview(s.parentSku) && !already.has(s.parentSku))
    .map((style) => ({ style, score: 1, reasons: ["shown as a fallback - has a real 3D preview"], has3dPreview: true }));

  return [...scored, ...fallback].slice(0, limit);
}

export function findStyleBySku(sku: string): CatalogueStyle | undefined {
  return loadCatalogue().find((s) => s.parentSku === sku);
}
