export const MATCH_CONFIDENCE_MIN = 0.6;

export function matchNeedsReview(winnerStyle: string, confidence: number, candidateStyles: string[]): boolean {
  const style = winnerStyle.trim();
  if (!style || style.toLowerCase() === "none") return true;
  if (!candidateStyles.includes(style)) return true;
  if (!(confidence >= MATCH_CONFIDENCE_MIN)) return true;
  return false;
}
