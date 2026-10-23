export type PrintLimit = { mark: string; reason: string };

export function customerLimitNote(notPossible: PrintLimit[], canDo: string[]): string {
  const omitted = notPossible
    .filter((item) => item.mark && item.reason)
    .map((item) => `${plain(item.mark)}. ${sentence(item.reason)}`);
  const kept = canDo.map(plain).filter(Boolean);
  if (omitted.length === 0 && kept.length === 0) return "";
  const did = kept.length > 0 ? `We made this with ${join(kept)}.` : "";
  const cannot = omitted.length > 0 ? `We couldn't add ${join(omitted)}.` : "";
  return [did, cannot].filter(Boolean).join("\n");
}

function plain(text: string): string {
  return text
    .replace(/\bstyle\s+\d+\b/gi, "this style")
    .replace(/\s*\([a-z]*\d+\)/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,])/g, "$1")
    .replace(/\.$/, "")
    .trim();
}

function sentence(text: string): string {
  const clean = plain(text);
  if (!clean) return "";
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function join(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
