"use client";

import { useState, useCallback, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Wordmark } from "@/components/Wordmark";
import type { ArtworkAnalysis, StyleMatch, BakeStatus, MockupRequest } from "@/lib/types";

const ThreeViewer = dynamic(() => import("@/components/ThreeViewer").then((m) => m.ThreeViewer), {
  ssr: false,
});

type Step = "upload" | "analyze" | "match" | "preview" | "submit" | "done";
const STEP_ORDER: Step[] = ["upload", "analyze", "match", "preview", "submit"];

type Slot = "front" | "back" | "left" | "right";

function StubNotice() {
  return (
    <div className="wrap wizard">
      <header className="site-header" style={{ border: "none", padding: 0, marginBottom: 40 }}>
        <div className="inner">
          <Wordmark />
        </div>
      </header>
      <div className="card">
        <h2>Start My AI Design — coming soon</h2>
        <p className="sub">
          Guided from-scratch generation isn&apos;t built yet. The working flow today is submitting a
          design you already have.
        </p>
        <a href="/design?mode=submit" className="btn btn-primary">
          Go to Submit My AI Design
        </a>
      </div>
    </div>
  );
}

function DesignWizard() {
  const [step, setStep] = useState<Step>("upload");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [images, setImages] = useState<Partial<Record<Slot, { file: File; url: string; savedUrl?: string }>>>({});
  const [knownStyleNumber, setKnownStyleNumber] = useState("");
  const [analysis, setAnalysis] = useState<ArtworkAnalysis | null>(null);
  const [matches, setMatches] = useState<StyleMatch[]>([]);
  const [chosen, setChosen] = useState<StyleMatch | null>(null);
  const [bakeJobId, setBakeJobId] = useState<string | null>(null);
  const [bakeStatus, setBakeStatus] = useState<BakeStatus | null>(null);
  const [comments, setComments] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedRequest, setSavedRequest] = useState<MockupRequest | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stepIndex = STEP_ORDER.indexOf(step);

  const onPickFile = (slot: Slot, file: File | null) => {
    if (!file) return;
    setImages((prev) => ({ ...prev, [slot]: { file, url: URL.createObjectURL(file) } }));
  };

  const handleUploadContinue = useCallback(async () => {
    if (!images.front) {
      setError("A front image is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      if (sessionId) form.append("sessionId", sessionId);
      (Object.keys(images) as Slot[]).forEach((slot) => {
        const entry = images[slot];
        if (entry) form.append(slot, entry.file);
      });
      const uploadRes = await fetch("/api/upload", { method: "POST", body: form });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error || "Upload failed.");
      setSessionId(uploadData.sessionId);
      setImages((prev) => {
        const next = { ...prev };
        (Object.keys(uploadData.urls) as Slot[]).forEach((slot) => {
          if (next[slot]) next[slot] = { ...next[slot]!, savedUrl: uploadData.urls[slot] };
        });
        return next;
      });

      const analyzeForm = new FormData();
      analyzeForm.append("front", images.front.file);
      const analyzeRes = await fetch("/api/analyze", { method: "POST", body: analyzeForm });
      const analyzeData = await analyzeRes.json();
      if (!analyzeRes.ok) throw new Error(analyzeData.error || "Analysis failed.");
      setAnalysis(analyzeData.analysis);
      setStep("analyze");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }, [images, sessionId]);

  const handleAnalyzeContinue = useCallback(async () => {
    if (!analysis) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/match-style", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis, knownStyleNumber }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Matching failed.");
      setMatches(data.matches);
      setStep("match");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }, [analysis, knownStyleNumber]);

  const handlePickMatch = (m: StyleMatch) => {
    setChosen(m);
    setBakeJobId(null);
    setBakeStatus(null);
  };

  const handleMatchContinue = useCallback(async () => {
    if (!chosen) {
      setError("Pick a style to continue.");
      return;
    }
    setError(null);
    setStep("preview");
    if (chosen.has3dPreview && images.front?.savedUrl) {
      setBusy(true);
      try {
        const res = await fetch("/api/bake", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sku: chosen.style.parentSku, frontImageUrl: images.front.savedUrl }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to start 3D preview.");
        setBakeJobId(data.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to start 3D preview.");
      } finally {
        setBusy(false);
      }
    }
  }, [chosen, images.front]);

  useEffect(() => {
    if (!bakeJobId) return;
    const poll = async () => {
      try {
        const res = await fetch(`/api/bake/status?id=${bakeJobId}`, { cache: "no-store" });
        const data: BakeStatus = await res.json();
        setBakeStatus(data);
        if (data.status === "done" || data.status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // transient network hiccup during polling - keep trying
      }
    };
    poll();
    pollRef.current = setInterval(poll, 2500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [bakeJobId]);

  const handleSubmit = useCallback(async () => {
    if (!analysis || !chosen || !images.front?.savedUrl) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: {
            front: images.front.savedUrl,
            back: images.back?.savedUrl,
            left: images.left?.savedUrl,
            right: images.right?.savedUrl,
          },
          knownStyleNumber: knownStyleNumber || undefined,
          analysis,
          chosenStyle: { parentSku: chosen.style.parentSku, name: chosen.style.name },
          bake: bakeJobId
            ? { jobId: bakeJobId, status: bakeStatus?.status || "queued", glbUrl: bakeStatus?.glbUrl }
            : undefined,
          comments,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Submit failed.");
      setSavedRequest(data.request);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }, [analysis, chosen, images, knownStyleNumber, bakeJobId, bakeStatus, comments]);

  return (
    <div className="wrap wizard">
      <header className="site-header" style={{ border: "none", padding: 0, marginBottom: 24 }}>
        <div className="inner">
          <Wordmark />
        </div>
      </header>

      <div className="wizard-head">
        <h1>Submit My AI Design</h1>
        {step !== "done" && (
          <div className="progress">
            {STEP_ORDER.map((s, i) => (
              <div key={s} className={`seg ${i <= stepIndex ? "done" : ""}`} />
            ))}
          </div>
        )}
      </div>

      {error && <div className="error-box">{error}</div>}

      {step === "upload" && (
        <div className="card">
          <h2>1. Upload your artwork</h2>
          <p className="sub">Front is required. Back, left and right sleeve are optional but help matching.</p>
          <div className="upload-grid">
            {(["front", "back", "left", "right"] as Slot[]).map((slot) => (
              <label key={slot} className={`upload-slot ${slot === "front" ? "required" : ""}`}>
                {images[slot] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={images[slot]!.url} alt={slot} />
                ) : (
                  <>
                    <span className="label">{slot}</span>
                    <span className="req">{slot === "front" ? "required" : "optional"}</span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => onPickFile(slot, e.target.files?.[0] ?? null)}
                />
              </label>
            ))}
          </div>

          <div className="field">
            <label htmlFor="knownStyle">Know your style number? (optional)</label>
            <input
              id="knownStyle"
              type="text"
              placeholder="e.g. 228103"
              value={knownStyleNumber}
              onChange={(e) => setKnownStyleNumber(e.target.value)}
            />
          </div>

          <div className="actions-row" style={{ justifyContent: "flex-end" }}>
            <button className="btn btn-primary" disabled={busy || !images.front} onClick={handleUploadContinue}>
              {busy ? "Analyzing…" : "Analyze My Design"}
            </button>
          </div>
        </div>
      )}

      {step === "analyze" && analysis && (
        <div className="card">
          <h2>2. Confirm what we read off your design</h2>
          <p className="sub">
            AI-generated read of your artwork — correct anything before we match it to a real style.
          </p>
          <div className="analysis-grid">
            <div className="field" style={{ marginTop: 0 }}>
              <label>Sport</label>
              <input
                type="text"
                value={analysis.sport}
                onChange={(e) => setAnalysis({ ...analysis, sport: e.target.value })}
              />
            </div>
            <div className="field" style={{ marginTop: 0 }}>
              <label>Garment type</label>
              <input
                type="text"
                value={analysis.garmentType}
                onChange={(e) => setAnalysis({ ...analysis, garmentType: e.target.value })}
              />
            </div>
          </div>

          <div className="field">
            <label>Colors detected</label>
            {analysis.colors.length ? (
              <div className="swatches">
                {analysis.colors.map((c, i) => (
                  <span key={i} className="swatch" title={`${c.name} ${c.hex}`} style={{ background: c.hex }} />
                ))}
              </div>
            ) : (
              <p className="sub" style={{ margin: 0 }}>No colors detected.</p>
            )}
          </div>

          <div className="field">
            <label>Design elements</label>
            <div className="checks">
              <span className={`check ${analysis.hasLogo ? "on" : ""}`}>Logo / crest</span>
              <span className={`check ${analysis.hasNumber ? "on" : ""}`}>Player number</span>
              <span className={`check ${analysis.hasTeamName ? "on" : ""}`}>Team name</span>
            </div>
          </div>

          {analysis.summary && (
            <div className="field">
              <label>AI summary</label>
              <p className="sub" style={{ margin: 0 }}>{analysis.summary}</p>
            </div>
          )}

          <div className="actions-row">
            <button className="btn btn-secondary" onClick={() => setStep("upload")}>Back</button>
            <button className="btn btn-primary" disabled={busy} onClick={handleAnalyzeContinue}>
              {busy ? "Matching…" : "Find Matching Styles"}
            </button>
          </div>
        </div>
      )}

      {step === "match" && (
        <div className="card">
          <h2>3. Pick the closest real style</h2>
          <p className="sub">
            Ranked against Momentec/Augusta&apos;s 364-style catalogue. Styles marked &ldquo;3D preview&rdquo;
            have a real garment mesh available today; the rest are matched by name only.
          </p>
          <div className="match-list">
            {matches.map((m) => (
              <div
                key={m.style.parentSku}
                className={`match-row ${chosen?.style.parentSku === m.style.parentSku ? "selected" : ""}`}
                onClick={() => handlePickMatch(m)}
              >
                <div className="match-thumb">
                  {m.style.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.style.image} alt={m.style.name} />
                  ) : (
                    <span>#{m.style.parentSku}</span>
                  )}
                </div>
                <div className="match-body">
                  <div className="name">{m.style.name}</div>
                  <div className="meta">
                    Style {m.style.parentSku} · MSRP ${parseFloat(m.style.msrp).toFixed(2)}
                    {m.style.category ? ` · ${m.style.category}` : ""}
                  </div>
                  <span className={`pill ${m.has3dPreview ? "yes" : "no"}`}>
                    {m.has3dPreview ? "3D preview available" : "No 3D preview yet"}
                  </span>
                </div>
                <div className="match-score">score {m.score}</div>
              </div>
            ))}
            {matches.length === 0 && <p className="sub">No matches found — try adjusting the read above.</p>}
          </div>

          <div className="actions-row">
            <button className="btn btn-secondary" onClick={() => setStep("analyze")}>Back</button>
            <button className="btn btn-primary" disabled={!chosen} onClick={handleMatchContinue}>
              Continue
            </button>
          </div>
        </div>
      )}

      {step === "preview" && chosen && (
        <div className="card">
          <h2>4. 3D preview</h2>
          <p className="sub">{chosen.style.name} — style {chosen.style.parentSku}</p>

          {!chosen.has3dPreview && (
            <div className="viewer-wrap">
              <div className="viewer-status">
                <strong>3D preview isn&apos;t available for this style yet.</strong>
                <span>Your design and style selection have been recorded — an artist will review it manually.</span>
              </div>
            </div>
          )}

          {chosen.has3dPreview && (
            <div className="viewer-wrap">
              {bakeStatus?.status === "done" && bakeStatus.glbUrl ? (
                <ThreeViewer glbUrl={bakeStatus.glbUrl} />
              ) : bakeStatus?.status === "failed" ? (
                <div className="viewer-status">
                  <strong>3D preview failed.</strong>
                  <span>{bakeStatus.error || "The bake service reported an error."}</span>
                  <span>Your design and style selection are still recorded — continue to submit.</span>
                </div>
              ) : (
                <div className="viewer-status">
                  <strong>Generating 3D preview…</strong>
                  <span>{bakeStatus?.stage ? `Stage: ${bakeStatus.stage}` : "Starting the bake service…"}</span>
                  {bakeStatus?.log && bakeStatus.log.length > 0 && (
                    <span style={{ fontSize: 11, opacity: 0.7 }}>{bakeStatus.log[bakeStatus.log.length - 1]}</span>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="actions-row">
            <button className="btn btn-secondary" onClick={() => setStep("match")}>Back</button>
            <button className="btn btn-primary" onClick={() => setStep("submit")}>Continue</button>
          </div>
        </div>
      )}

      {step === "submit" && (
        <div className="card">
          <h2>5. Comments &amp; submit</h2>
          <p className="sub">Add anything the artist should know, then send this for review.</p>
          <div className="field" style={{ marginTop: 0 }}>
            <label>Comments (optional)</label>
            <textarea value={comments} onChange={(e) => setComments(e.target.value)} placeholder="e.g. keep the number on the back large, match the blue to our team color…" />
          </div>
          <div className="actions-row">
            <button className="btn btn-secondary" onClick={() => setStep("preview")}>Back</button>
            <button className="btn btn-primary" disabled={busy} onClick={handleSubmit}>
              {busy ? "Submitting…" : "Submit for Artist Review"}
            </button>
          </div>
        </div>
      )}

      {step === "done" && savedRequest && (
        <div className="success-box">
          <h2>Submitted</h2>
          <p>
            Request <strong>{savedRequest.id}</strong> has been recorded for {savedRequest.chosenStyle.name}{" "}
            (style {savedRequest.chosenStyle.parentSku}). An artist will review it next.
          </p>
          <p style={{ marginTop: 16, fontSize: 12 }}>
            This is a local prototype record, not a live COMS submission — no production order has been placed.
          </p>
          <div style={{ marginTop: 24 }}>
            <a href="/" className="btn btn-secondary">Back to home</a>
          </div>
        </div>
      )}
    </div>
  );
}

function DesignPageInner() {
  const params = useSearchParams();
  const mode = params.get("mode");
  if (mode === "start") return <StubNotice />;
  return <DesignWizard />;
}

export default function DesignPage() {
  return (
    <Suspense fallback={null}>
      <DesignPageInner />
    </Suspense>
  );
}
