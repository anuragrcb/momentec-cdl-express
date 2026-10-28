"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import "./jobs.css";

// Mirrors GET /jobs from the proof API (lambda/src/api.ts listJobs): newest first, paged with `after`.
type State = "queued" | "running" | "done" | "needs_review" | "failed";
type JobRow = {
  jobId: string;
  state: State;
  message: string;
  progress: number;
  step: { label: string; number: number; total: number } | null;
  garment: { style: string | null; name: string | null; size: string | null };
  quality: string | null;
  customerName: string | null;
  pdf: { url: string; expiresAt: string } | null;
  reason: string | null;
  error: string | null;
  submittedAt: string | null;
};
type JobPage = { data: JobRow[]; has_more: boolean; last_id: string | null };

const PAGE_SIZE = 10;
const REFRESH_MS = 10_000;

const BADGE: Record<State, { text: string; tone: string }> = {
  queued: { text: "Queued", tone: "waiting" },
  running: { text: "In progress", tone: "working" },
  done: { text: "Ready", tone: "ready" },
  needs_review: { text: "Artist review", tone: "review" },
  failed: { text: "Failed", tone: "failed" },
};

async function fetchPage(limit: number, after?: string): Promise<JobPage> {
  const query = new URLSearchParams({ limit: String(limit) });
  if (after) query.set("after", after);
  const response = await fetch(`/api/upload-ai-design/jobs?${query}`, { cache: "no-store" });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : `Status ${response.status}`);
  const data: JobRow[] = Array.isArray(payload?.data) ? payload.data.filter((row: Partial<JobRow>) => row?.jobId && row.state && row.state in BADGE) : [];
  return { data, has_more: Boolean(payload?.has_more), last_id: typeof payload?.last_id === "string" ? payload.last_id : null };
}

export function JobsList() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  // Refreshing re-reads as many jobs as are on screen, so "Load more" pages stay put.
  const refresh = useCallback(async (count: number) => {
    try {
      const page = await fetchPage(Math.max(PAGE_SIZE, Math.min(count, 50)));
      setJobs(page.data);
      setHasMore(page.has_more);
      setError("");
      setUpdatedAt(new Date());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load jobs.");
    } finally {
      setLoading(false);
    }
  }, []);

  const shown = useRef(0);
  shown.current = jobs.length;
  useEffect(() => {
    void refresh(shown.current);
    const timer = setInterval(() => void refresh(shown.current), REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  async function loadMore() {
    const last = jobs[jobs.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const page = await fetchPage(PAGE_SIZE, last.jobId);
      setJobs((current) => [...current, ...page.data.filter((row) => !current.some((item) => item.jobId === row.jobId))]);
      setHasMore(page.has_more);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load more jobs.");
    } finally {
      setLoadingMore(false);
    }
  }

  // PDF links expire after 15 minutes; ask for a fresh one when the list has been open longer.
  async function openPdf(job: JobRow) {
    if (job.pdf && new Date(job.pdf.expiresAt).getTime() - Date.now() > 30_000) {
      window.open(job.pdf.url, "_blank", "noopener");
      return;
    }
    // Open the tab now, while the click still counts, so the popup blocker lets it through.
    const tab = window.open("", "_blank");
    const response = await fetch(`/api/upload-ai-design/status/${encodeURIComponent(job.jobId)}`, { cache: "no-store" });
    const fresh = await response.json().catch(() => null);
    if (fresh?.pdf?.url && tab) tab.location.href = fresh.pdf.url;
    else tab?.close();
  }

  return (
    <main className="jobs-page">
      <section className="jobs-card">
        <header className="jobs-head">
          <img src="/upload-ai-design/header-mark.png" alt="" />
          <div>
            <p className="jobs-kicker">Custom design proofs</p>
            <h1>Job status</h1>
          </div>
          <a className="jobs-new" href="/">
            + New design
          </a>
        </header>

        <p className="jobs-meta">
          {updatedAt ? `Updated ${updatedAt.toLocaleTimeString()} · refreshes every ${REFRESH_MS / 1000}s` : "Loading jobs…"}
          <button type="button" onClick={() => void refresh(shown.current)}>
            Refresh
          </button>
        </p>
        {error ? <p className="jobs-error">{error}</p> : null}

        {!loading && jobs.length === 0 && !error ? <p className="jobs-empty">No jobs yet. Submit a design to see it here.</p> : null}

        {jobs.length > 0 ? (
          <div className="jobs-table-wrap">
            <table className="jobs-table">
              <thead>
                <tr>
                  <th>Submitted</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>Garment</th>
                  <th>Quality</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <JobLine key={job.jobId} job={job} onOpenPdf={() => openPdf(job)} />
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {hasMore ? (
          <button type="button" className="jobs-more" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        ) : null}
      </section>
    </main>
  );
}

function JobLine({ job, onOpenPdf }: { job: JobRow; onOpenPdf: () => void }) {
  const badge = BADGE[job.state];
  const working = job.state === "queued" || job.state === "running";
  const garment = [job.garment.style, job.garment.name].filter(Boolean).join(" · ");
  const note = job.state === "failed" ? job.error : job.state === "needs_review" ? job.reason : working ? job.step?.label : null;
  return (
    <tr>
      <td data-label="Submitted">
        {job.submittedAt ? formatTime(job.submittedAt) : "—"}
        <a className="jobs-id" href={`/status/${encodeURIComponent(job.jobId)}`} title={job.jobId}>
          {job.jobId}
        </a>
      </td>
      <td data-label="Customer">{job.customerName || "—"}</td>
      <td data-label="Status">
        <span className={`jobs-badge is-${badge.tone}`}>{badge.text}</span>
        {working ? (
          <span className="jobs-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={job.progress}>
            <span style={{ width: `${Math.max(job.progress, 3)}%` }} />
          </span>
        ) : null}
        {note ? <small className="jobs-note" title={note}>{note}</small> : null}
      </td>
      <td data-label="Garment">
        {garment || "—"}
        {job.garment.size ? <small className="jobs-note">Size {job.garment.size}</small> : null}
      </td>
      <td data-label="Quality" className="jobs-quality">
        {job.quality ?? "—"}
      </td>
      <td className="jobs-actions">
        {job.pdf ? (
          <button type="button" className="jobs-download" onClick={onOpenPdf}>
            Download PDF
          </button>
        ) : (
          <span className="jobs-pending">{working ? `${job.progress}%` : "No PDF"}</span>
        )}
      </td>
    </tr>
  );
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
