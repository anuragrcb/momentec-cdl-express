import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Momentec CDL Express",
  description: "Submit your AI-generated jersey design, match it to a real Momentec/Augusta style, and preview it in 3D.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
