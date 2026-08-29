import Link from "next/link";
import Image from "next/image";

export function Wordmark({ official = false }: { official?: boolean }) {
  if (official) {
    return (
      <Link href="/" className="wordmark wordmark-official" aria-label="M Custom Sublimation by Momentec Brands">
        <Image
          src="/m-custom-momentec-logo.png"
          alt="M Custom Sublimation by Momentec Brands"
          width={600}
          height={172}
          priority
          className="wordmark-logo"
        />
      </Link>
    );
  }

  return (
    <Link href="/" className="wordmark">
      <span className="m">M</span>
      <span className="rest">CDL Express · Momentec Brands</span>
    </Link>
  );
}
