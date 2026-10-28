"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import "../status.css";

// Mirrors GET /jobs/{jobId} from the proof API (lambda/src/status-view.ts).
type StepStatus = "done" | "in_progress" | "waiting" | "stopped" | "skipped";
type State = "queued" | "running" | "done" | "needs_review" | "failed";
type JobView = {
  jobId: string;
  state: State;
  message: string;
  progress: number;
  steps: { key: string; label: string; status: StepStatus }[];
  garment: { style: string | null; name: string | null; category: string | null; gender: string | null; size: string | null };
  pdf: { url: string; expiresAt: string } | null;
  reason: string | null;
  error: string | null;
  submittedAt: string | null;
  updatedAt: string | null;
};

type Load = { kind: "loading" } | { kind: "missing" } | { kind: "ready"; job: JobView };

const POLL_MS = 5000;
const FINISHED: State[] = ["done", "needs_review", "failed"];

const BADGE: Record<State, { text: string; tone: string }> = {
  queued: { text: "Queued", tone: "waiting" },
  running: { text: "In progress", tone: "working" },
  done: { text: "Ready", tone: "ready" },
  needs_review: { text: "Artist review", tone: "review" },
  failed: { text: "Not completed", tone: "failed" },
};

const HEADLINE: Record<State, string> = {
  queued: "Your proof is in line",
  running: "We're making your proof",
  done: "Your proof is ready",
  needs_review: "An artist will finish this proof",
  failed: "This proof couldn't be made",
};

async function fetchJob(jobId: string): Promise<JobView | null> {
  const response = await fetch(`/api/upload-ai-design/status/${encodeURIComponent(jobId)}`, { cache: "no-store" });
  if (response.status === 404 || response.status === 400) return null;
  if (!response.ok) throw new Error(`Status ${response.status}`);
  return normalize((await response.json()) as Partial<JobView>, jobId);
}

// Fill gaps so an older or partial reply still renders instead of breaking the page.
function normalize(raw: Partial<JobView>, jobId: string): JobView {
  const state: State = raw.state && raw.state in BADGE ? raw.state : "running";
  return {
    jobId: raw.jobId ?? jobId,
    state,
    message: raw.message ?? "",
    progress: typeof raw.progress === "number" ? raw.progress : 0,
    steps: Array.isArray(raw.steps) ? raw.steps : [],
    garment: { style: null, name: null, category: null, gender: null, size: null, ...(raw.garment ?? {}) },
    pdf: raw.pdf ?? null,
    reason: raw.reason ?? null,
    error: raw.error ?? null,
    submittedAt: raw.submittedAt ?? null,
    updatedAt: raw.updatedAt ?? null,
  };
}

export function ProofStatus({ jobId }: { jobId: string }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [offline, setOffline] = useState(false);
  const [copied, setCopied] = useState(false);
  const [opening, setOpening] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const job = await fetchJob(jobId);
      setOffline(false);
      if (!job) {
        setLoad({ kind: "missing" });
        return null;
      }
      setLoad({ kind: "ready", job });
      return job;
    } catch {
      setOffline(true);
      return undefined;
    }
  }, [jobId]);

  useEffect(() => {
    let stopped = false;
    async function tick() {
      const job = await refresh();
      if (stopped || job === null || (job && FINISHED.includes(job.state))) return;
      timer.current = setTimeout(tick, POLL_MS);
    }
    void tick();
    return () => {
      stopped = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [refresh]);

  async function copyId() {
    try {
      await navigator.clipboard.writeText(jobId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // The id is selectable text, so it can still be copied by hand.
    }
  }

  // PDF links expire after 15 minutes; fetch a fresh one when the page has been open longer.
  async function openPdf(job: JobView) {
    if (!job.pdf) return;
    if (new Date(job.pdf.expiresAt).getTime() - Date.now() > 30_000) {
      window.open(job.pdf.url, "_blank", "noopener");
      return;
    }
    setOpening(true);
    const fresh = await refresh();
    setOpening(false);
    if (fresh?.pdf) window.location.href = fresh.pdf.url;
  }

  return (
    <main className="proof-status-page">
      <section className="proof-status-card" aria-live="polite">
        <header className="proof-status-head">
          <img src="/upload-ai-design/header-mark.png" alt="" />
          <div>
            <p className="proof-status-kicker">Custom design proof</p>
            <h1>{load.kind === "ready" ? HEADLINE[load.job.state] : load.kind === "missing" ? "Proof not found" : "Checking your proof"}</h1>
          </div>
        </header>

        <div className="proof-status-id">
          <span>Tracking ID</span>
          <code>{jobId}</code>
          <button type="button" onClick={copyId}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        {load.kind === "loading" ? <p className="proof-status-message">Loading the latest status…</p> : null}

        {load.kind === "missing" ? (
          <p className="proof-status-message">
            We couldn't find a proof with this tracking ID. Check that the whole ID was copied, or contact Momentec.
          </p>
        ) : null}

        {load.kind === "ready" ? <JobDetails job={load.job} opening={opening} onOpenPdf={() => openPdf(load.job)} /> : null}

        {offline ? <p className="proof-status-offline">Can't reach the server right now. Retrying…</p> : null}
      </section>
    </main>
  );
}

function JobDetails({ job, opening, onOpenPdf }: { job: JobView; opening: boolean; onOpenPdf: () => void }) {
  const badge = BADGE[job.state];
  const garmentRows: [string, string | null][] = [
    ["Garment", job.garment.name],
    ["Style #", job.garment.style],
    ["Category", job.garment.category],
    ["Fit", job.garment.gender],
    ["Size", job.garment.size],
  ];
  const shownRows = garmentRows.filter((row): row is [string, string] => Boolean(row[1]));

  return (
    <>
      <div className="proof-status-summary">
        <span className={`proof-status-badge is-${badge.tone}`}>{badge.text}</span>
        <p className="proof-status-message">{job.message}</p>
      </div>

      <div className="proof-status-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={job.progress}>
        <div className={`proof-status-bar is-${badge.tone}`} style={{ width: `${Math.max(job.progress, 3)}%` }} />
      </div>
      <p className="proof-status-percent">{job.progress}%</p>

      {job.pdf ? (
        <button type="button" className="proof-status-download" onClick={onOpenPdf} disabled={opening}>
          {opening ? "Getting a fresh link…" : job.state === "needs_review" ? "Download PDF for the artist" : "Download proof (PDF)"}
        </button>
      ) : null}

      {job.state === "needs_review" && job.reason ? (
        <div className="proof-status-note is-review">
          <strong>Why it needs an artist</strong>
          <p>{job.reason}</p>
        </div>
      ) : null}

      {job.state === "failed" ? (
        <div className="proof-status-note is-failed">
          <strong>What went wrong</strong>
          <p>{job.error || "The proof could not be made."}</p>
        </div>
      ) : null}

      <ol className="proof-status-steps">
        {job.steps.map((step) => (
          <li key={step.key} className={`is-${step.status}`}>
            <span className="proof-status-dot" aria-hidden="true">
              {step.status === "done" ? "✓" : step.status === "stopped" ? "!" : step.status === "skipped" ? "–" : ""}
            </span>
            <span>{step.label}</span>
            <span className="proof-status-step-state">{stepText(step.status)}</span>
          </li>
        ))}
      </ol>

      {shownRows.length > 0 ? (
        <dl className="proof-status-garment">
          {shownRows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <p className="proof-status-times">
        {job.submittedAt ? `Submitted ${formatTime(job.submittedAt)}` : ""}
        {job.submittedAt && job.updatedAt ? " · " : ""}
        {job.updatedAt ? `Last update ${formatTime(job.updatedAt)}` : ""}
        {FINISHED.includes(job.state) ? "" : " · This page refreshes by itself."}
      </p>
    </>
  );
}

function stepText(status: StepStatus): string {
  switch (status) {
    case "done":
      return "Done";
    case "in_progress":
      return "Working…";
    case "stopped":
      return "Stopped here";
    case "skipped":
      return "Skipped";
    default:
      return "";
  }
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
