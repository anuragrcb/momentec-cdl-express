// Shared by the upload form (browser) and the submit route (server); keep it free of Node imports.
// These mirror the proof API's limits in lambda/src/jobs.ts.
export const GARMENT_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL"] as const;
export type GarmentSize = (typeof GARMENT_SIZES)[number];
export const DEFAULT_SIZE: GarmentSize = "L";
export const MAX_REFERENCES = 8;
export const IMAGE_QUALITIES = ["high", "medium", "low"] as const;
export const DEFAULT_QUALITY = "high";
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
