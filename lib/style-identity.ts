/** Normalizes the common style-number formats customers paste from product
 * URLs, artwork filenames and configurator part numbers. This is syntax
 * normalization only; catalogue validation still decides whether it exists. */
export function normalizeStyleNumber(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/\.(SVG|GLB|PNG|JPE?G|WEBP)$/i, "")
    .replace(/^(?:PROD|PREVIEW)[-_\s]*/, "")
    .replace(/^CUT[-_\s]*/, "")
    .replace(/[-_\s]+DECORATIONS$/i, "")
    .trim();
}
