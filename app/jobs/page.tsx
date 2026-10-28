import type { Metadata } from "next";
import { JobsList } from "./JobsList";

export const metadata: Metadata = {
  title: "Job status",
  description: "Every proof job, newest first, with its PDF.",
};

export default function JobsPage() {
  return <JobsList />;
}
