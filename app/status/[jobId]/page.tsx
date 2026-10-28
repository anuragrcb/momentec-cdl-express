import type { Metadata } from "next";
import { ProofStatus } from "./ProofStatus";

export const metadata: Metadata = {
  title: "Proof status",
  description: "Track the progress of your custom design proof.",
};

export default async function ProofStatusPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return <ProofStatus jobId={decodeURIComponent(jobId)} />;
}
