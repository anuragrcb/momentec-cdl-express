import Link from "next/link";

// No real Momentec logo file exists in this project - this is a clean,
// text-based wordmark built in their black/white house style, not a
// fabricated logo asset.
export function Wordmark() {
  return (
    <Link href="/" className="wordmark">
      <span className="m">M</span>
      <span className="rest">CDL Express · Momentec Brands</span>
    </Link>
  );
}
