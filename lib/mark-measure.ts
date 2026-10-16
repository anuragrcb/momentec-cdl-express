export const GARMENT_CATEGORIES = [
  "CORPORATE APPAREL",
  "ACCESSORIES",
  "BASEBALL",
  "BASKETBALL",
  "BOTTOMS",
  "CHEER",
  "FLEECE",
  "FOOTBALL",
  "HOCKEY",
  "LACROSSE",
  "MULTI-SPORT",
  "POLOS",
  "PULLOVERS",
  "SOCCER",
  "SOFTBALL",
  "TEES",
  "TOP",
  "TOPS",
  "TRACK & FIELD",
  "VOLLEYBALL",
] as const;

export const GARMENT_GENDERS = ["Men", "Women", "Youth"] as const;
export const GARMENT_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL"] as const;

export type GarmentCategory = (typeof GARMENT_CATEGORIES)[number];
export type GarmentGender = (typeof GARMENT_GENDERS)[number];
export type GarmentSize = (typeof GARMENT_SIZES)[number];
export type GarmentFit = { gender: GarmentGender; size: GarmentSize };

export type MarkPlace = {
  fromTop: number;
  fromCenter: number;
  width: number;
  height: number;
};

export type MarkFit = {
  widthIn: number;
  heightIn: number;
  upIn: number;
  downIn: number;
  leftIn: number;
  rightIn: number;
};

export function fitSentence(fit: GarmentFit): string {
  const who = fit.gender === "Men" ? "Men's" : fit.gender === "Women" ? "Women's" : "Youth";
  return `This garment is a ${who} ${fit.size}.`;
}

export function garmentLabel(fit: GarmentFit): string {
  return `${fit.gender} ${fit.size}`.toUpperCase();
}

export function readGarmentSuggestion(
  category: unknown,
  gender: unknown,
): { category: GarmentCategory; gender: GarmentGender } | null {
  if (typeof category !== "string" || typeof gender !== "string") return null;
  if (!includes(GARMENT_CATEGORIES, category) || !includes(GARMENT_GENDERS, gender)) return null;
  return { category, gender };
}

export function readGarmentFit(gender: unknown, size: unknown): GarmentFit | null {
  if (typeof gender !== "string" || typeof size !== "string") return null;
  if (!includes(GARMENT_GENDERS, gender) || !includes(GARMENT_SIZES, size)) return null;
  return { gender, size };
}

export function readDecorationMeasures(item: object): { place?: MarkPlace; fit?: MarkFit } {
  const record = item as { place?: unknown; fit?: unknown };
  const place = readMarkPlace(record.place);
  const fit = readMarkFit(record.fit);
  return {
    ...(place ? { place } : {}),
    ...(fit ? { fit } : {}),
  };
}

export function readMarkPlace(value: unknown): MarkPlace | null {
  if (!isRecord(value)) return null;
  const fromTop = readBounded(value.fromTop, 0, 1);
  const fromCenter = readBounded(value.fromCenter, -1, 1);
  const width = readBounded(value.width, 0, 1);
  const height = readBounded(value.height, 0, 1);
  if (fromTop === null || fromCenter === null || width === null || height === null) return null;
  return { fromTop, fromCenter, width, height };
}

export function readMarkFit(value: unknown): MarkFit | null {
  if (!isRecord(value)) return null;
  const widthIn = readBounded(value.widthIn, 0, 24);
  const heightIn = readBounded(value.heightIn, 0, 24);
  const upIn = readBounded(value.upIn, 0, 24);
  const downIn = readBounded(value.downIn, 0, 24);
  const leftIn = readBounded(value.leftIn, 0, 24);
  const rightIn = readBounded(value.rightIn, 0, 24);
  if (widthIn === null || heightIn === null || upIn === null || downIn === null || leftIn === null || rightIn === null) {
    return null;
  }
  return { widthIn, heightIn, upIn, downIn, leftIn, rightIn };
}

export function formatInches(value: number): string {
  return value.toFixed(2).replace(/\.?0+$/, "");
}

export function placeLine(place: MarkPlace): string {
  const top = Math.round(place.fromTop * 100);
  const width = Math.round(place.width * 100);
  const height = Math.round(place.height * 100);
  const center = Math.abs(place.fromCenter);
  const side = center < 0.02 ? "CENTER" : `${Math.round(center * 100)}% ${place.fromCenter > 0 ? "L" : "R"}`;
  return `FROM TOP ${top}% · FROM CENTER ${side} · ${width}% × ${height}%`;
}

function includes<T extends string>(list: readonly T[], value: string): value is T {
  return (list as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readBounded(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) return null;
  return value;
}
