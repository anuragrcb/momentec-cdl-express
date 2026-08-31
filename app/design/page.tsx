"use client";

import { useState, useCallback, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Image from "next/image";
import { Wordmark } from "@/components/Wordmark";
import type { ArtworkAnalysis, ArtworkIntelligence, ArtworkPackage, StyleMatch, BakeStatus, BakeStats, MockupRequest } from "@/lib/types";
import { getApparelAssetDescriptor } from "@/lib/apparel-assets";
import { compressImageForUpload, rotateImageFile } from "@/lib/client-image";

const ThreeViewer = dynamic(() => import("@/components/ThreeViewer").then((m) => m.ThreeViewer), {
  ssr: false,
});

const J180AProof = dynamic(() => import("@/components/J180AProof").then((m) => m.J180AProof), {
  ssr: false,
  loading: () => <div className="viewer-status"><strong>Loading the manufacturer-panel renderer…</strong></div>,
});

type Step = "upload" | "analyze" | "match" | "preview" | "submit" | "done";
const STEP_ORDER: Exclude<Step, "done">[] = ["upload", "analyze", "match", "preview", "submit"];
const STEP_LABEL: Record<Exclude<Step, "done">, string> = {
  upload: "Upload",
  analyze: "Artwork map",
  match: "Style",
  preview: "3D proof",
  submit: "Handoff",
};

type Slot = "front" | "back" | "left" | "right";
type ImageState = {
  file: File;
  url: string;
  savedUrl?: string;
  originalSavedUrl?: string;
  /** true when this view was invented by the model rather than uploaded by the
   *  customer - carried so every screen can keep labelling it as generated */
  generated?: boolean;
};

const VIEW_LABEL: Record<string, string> = {
  front: "Front",
  back: "Back",
  left: "Left side",
  right: "Right side",
  auto: "One of your photos",
};

// Mirrors the retexture service's own bar (parseDiagnostics' `verdict`):
// silhouette IoU below this means the camera fit never really locked onto
// that view, so its UV islands were left unpainted and fell back to a flat
// placeholder colour instead of the customer's photo.
const POOR_FIT_IOU = 0.75;

async function safeFetchJson<T = any>(res: Response, fallbackError = "Request failed."): Promise<T> {
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(res.ok ? "Invalid server response format." : `${fallbackError} (${res.status}): ${text.slice(0, 150)}`);
  }
  if (!res.ok) {
    throw new Error(data?.error || data?.message || fallbackError);
  }
  return data as T;
}

/** Per-view camera-fit warnings worth telling the customer about. */
function lowFitWarnings(stats: BakeStats | undefined): { view: string; iou: number }[] {
  if (!stats?.views) return [];
  return stats.views
    .filter((v) => typeof v.iou === "number" && v.iou < POOR_FIT_IOU)
    .map((v) => ({ view: v.view, iou: v.iou }));
}

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
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode") || "submit";

  const [step, setStep] = useState<Step>("upload");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [images, setImages] = useState<Partial<Record<Slot, ImageState>>>({});
  const [knownStyleNumber, setKnownStyleNumber] = useState("");
  const [analysis, setAnalysis] = useState<ArtworkAnalysis | null>(null);
  const [matches, setMatches] = useState<StyleMatch[]>([]);
  const [chosen, setChosen] = useState<StyleMatch | null>(null);
  const [bakeJobId, setBakeJobId] = useState<string | null>(null);
  const [bakeStatus, setBakeStatus] = useState<BakeStatus | null>(null);
  const [generatedViews, setGeneratedViews] = useState<Slot[]>([]);
  const [artworkIntelligence, setArtworkIntelligence] = useState<ArtworkIntelligence | null>(null);
  const [artworkPackage, setArtworkPackage] = useState<ArtworkPackage | null>(null);
  const [comments, setComments] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedRequest, setSavedRequest] = useState<MockupRequest | null>(null);
  const [viewGenNote, setViewGenNote] = useState<string | null>(null);
  const [mappedProofReady, setMappedProofReady] = useState(false);
  const [mappedProofWarning, setMappedProofWarning] = useState<string | null>(null);
  const [proofSize, setProofSize] = useState("L");
  const missingSlots = (["back", "left", "right"] as Slot[]).filter((slot) => !images[slot]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stepIndex = step === "done" ? STEP_ORDER.length : STEP_ORDER.indexOf(step);
  const chosenAsset = chosen ? getApparelAssetDescriptor(chosen.style.parentSku) : null;
  const canApprovePreview = Boolean(
    (chosenAsset?.previewMode === "browser-mapped" && mappedProofReady) ||
    (chosenAsset?.previewMode === "server-baked" &&
      ((bakeStatus?.status === "done" && bakeStatus.glbUrl && ["good", "usable"].includes(bakeStatus.stats?.verdict ?? "")) ||
      bakeStatus?.status === "failed")) ||
    chosenAsset?.previewMode === "unavailable",
  );

  const onPickFile = async (slot: Slot, rawFile: File | null) => {
    if (!rawFile) return;
    try {
      const file = await compressImageForUpload(rawFile);
      setImages((prev) => ({ ...prev, [slot]: { file, url: URL.createObjectURL(file) } }));
    } catch {
      setImages((prev) => ({ ...prev, [slot]: { file: rawFile, url: URL.createObjectURL(rawFile) } }));
    }
  };

  const onRotateSlot = async (slot: Slot) => {
    const entry = images[slot];
    if (!entry?.file) return;
    try {
      const rotated = await rotateImageFile(entry.file, 90);
      setImages((prev) => ({
        ...prev,
        [slot]: { ...entry, file: rotated, url: URL.createObjectURL(rotated), savedUrl: undefined },
      }));
    } catch (e) {
      console.error("Rotate failed", e);
    }
  };

  const onRemoveSlot = (slot: Slot) => {
    setImages((prev) => {
      const next = { ...prev };
      delete next[slot];
      return next;
    });
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
      for (const slot of Object.keys(images) as Slot[]) {
        const entry = images[slot];
        if (entry?.file) {
          const fileToUpload = await compressImageForUpload(entry.file);
          form.append(slot, fileToUpload);
        }
      }
      const uploadRes = await fetch("/api/upload", { method: "POST", body: form });
      const uploadData = await safeFetchJson(uploadRes, "Upload failed.");
      setSessionId(uploadData.sessionId);
      setImages((prev) => {
        const next = { ...prev };
        (Object.keys(uploadData.urls) as Slot[]).forEach((slot) => {
          if (next[slot]) {
            next[slot] = {
              ...next[slot]!,
              savedUrl: uploadData.urls[slot],
              originalSavedUrl: uploadData.urls[slot],
            };
          }
        });
        return next;
      });

      const analyzeRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frontImageUrl: uploadData.urls.front,
          backImageUrl: uploadData.urls.back,
          leftImageUrl: uploadData.urls.left,
          rightImageUrl: uploadData.urls.right,
          // when the customer typed a style number, detected marks come back
          // tagged with that style's real manufacturer location codes
          sku: knownStyleNumber.trim() || undefined,
        }),
      });
      const analyzeData = await safeFetchJson(analyzeRes, "Analysis failed.");
      setAnalysis(analyzeData.analysis);
      setStep("analyze");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }, [images, sessionId, knownStyleNumber]);

  /**
   * Fills in the views the customer didn't upload, using the ones they did.
   * Uploads first (so the server has real files to reference), then generates.
   * Generated views are stored under a "-generated" filename and tracked in
   * `generatedViews` so every later screen can keep labelling them.
   */
  const handleGenerateViews = useCallback(async () => {
    if (!images.front) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      if (sessionId) form.append("sessionId", sessionId);
      for (const slot of Object.keys(images) as Slot[]) {
        const entry = images[slot];
        if (entry?.file) {
          const fileToUpload = await compressImageForUpload(entry.file);
          form.append(slot, fileToUpload);
        }
      }
      const upRes = await fetch("/api/upload", { method: "POST", body: form });
      const upData = await safeFetchJson(upRes, "Upload failed.");
      setSessionId(upData.sessionId);

      const res = await fetch("/api/generate-views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: upData.sessionId, views: upData.urls }),
      });
      const data = await safeFetchJson(res, "View generation failed.");

      setViewGenNote(data.message ?? null);
      setGeneratedViews(data.generatedViews ?? []);
      // adopt the generated views as usable images, but keep savedUrl pointing
      // at the "-generated" file so nothing downstream mistakes them for uploads
      const adopted: Array<[Slot, ImageState]> = [];
      for (const view of (data.generatedViews ?? []) as Slot[]) {
        const url = data.urls?.[view];
        if (!url) continue;
        // pull the real bytes back so `file` is a genuine image - an empty
        // placeholder File would be re-uploaded on the next step and would
        // clobber the generated PNG with a 0-byte file
        const blob = await (await fetch(url)).blob();
        adopted.push([
          view,
          {
            file: new File([blob], `${view}-generated.png`, { type: blob.type || "image/png" }),
            url,
            savedUrl: url,
            generated: true,
          },
        ]);
      }
      setImages((prev) => {
        const next = { ...prev };
        for (const [view, state] of adopted) next[view] = state;
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate the missing views.");
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
      const data = await safeFetchJson(res, "Matching failed.");
      setMatches(data.matches);
      const enteredSku = knownStyleNumber.trim();
      // A validated customer-entered SKU is the default physical model. The
      // customer may deliberately choose another result, but the screen makes
      // that departure explicit rather than silently rendering a different
      // hockey cut (for example, 228150 instead of 228108).
      setChosen(enteredSku ? data.matches.find((match: StyleMatch) => match.style.parentSku === enteredSku) ?? null : null);
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
    setGeneratedViews([]);
    setMappedProofReady(false);
    setMappedProofWarning(null);
    setProofSize("L");
  };

  const handleMatchContinue = useCallback(async () => {
    if (!chosen) {
      setError("Pick a style to continue.");
      return;
    }
    setError(null);
    setStep("preview");
    const asset = getApparelAssetDescriptor(chosen.style.parentSku);
    if (asset.previewMode === "server-baked" && images.front?.savedUrl) {
      setBusy(true);
      try {
        const res = await fetch("/api/bake", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sku: chosen.style.parentSku,
            frontImageUrl: images.front.savedUrl,
            backImageUrl: images.back?.savedUrl,
            leftImageUrl: images.left?.savedUrl,
            rightImageUrl: images.right?.savedUrl,
            renderMode: analysis?.artworkKind === "flat-artwork" ? "transfer" : "match",
            sleeveMarks: analysis?.sleeveMarks,
            backName: analysis?.backName,
            backNumber: analysis?.backNumber,
          }),
        });
        const data = await safeFetchJson(res, "Failed to start 3D preview.");
        setBakeJobId(data.id);
        setGeneratedViews(data.generatedViews || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to start 3D preview.");
      } finally {
        setBusy(false);
      }
    }
  }, [chosen, images, analysis]);

  useEffect(() => {
    if (!bakeJobId) return;
    const poll = async () => {
      try {
        const res = await fetch(`/api/bake/status?id=${bakeJobId}`, { cache: "no-store" });
        const data: BakeStatus = await safeFetchJson<BakeStatus>(res, "Bake status check failed.");
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
          originalImages: {
            front: images.front.originalSavedUrl || images.front.savedUrl,
            back: images.back?.originalSavedUrl,
            left: images.left?.originalSavedUrl,
            right: images.right?.originalSavedUrl,
          },
          knownStyleNumber: knownStyleNumber || undefined,
          analysis,
          chosenStyle: { parentSku: chosen.style.parentSku, name: chosen.style.name },
          bake: bakeJobId
            ? {
                jobId: bakeJobId,
                status: bakeStatus?.status || "queued",
                glbUrl: bakeStatus?.glbUrl,
                generatedViews,
              }
            : undefined,
          artworkIntelligence: artworkIntelligence || undefined,
          artworkPackage: artworkPackage || undefined,
          comments,
        }),
      });
      const data = await safeFetchJson(res, "Submit failed.");
      setSavedRequest(data.request);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }, [analysis, chosen, images, knownStyleNumber, bakeJobId, bakeStatus, generatedViews, artworkIntelligence, artworkPackage, comments]);

  const handlePreviewApproval = useCallback(async () => {
    if (!images.front?.savedUrl) return;
    if (!canApprovePreview) {
      setError("Approval is blocked because a complete, visually validated 3D proof is not available for this style.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/extract-artwork", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: {
            front: images.front.savedUrl,
            back: images.back?.savedUrl,
            left: images.left?.savedUrl,
            right: images.right?.savedUrl,
          },
          sessionId,
          analysis,
          sku: chosen?.style.parentSku || knownStyleNumber.trim() || undefined,
        }),
      });
      const data = await safeFetchJson(res, "Artwork extraction failed.");
      setArtworkIntelligence(data.intelligence);
      setArtworkPackage(data.package);
      setStep("submit");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Artwork extraction failed.");
    } finally {
      setBusy(false);
    }
  }, [images, canApprovePreview, sessionId, analysis, chosen, knownStyleNumber]);

  const lateStep = step === "preview" || step === "submit" || step === "done";

  return (
    <div className="studio-page">
      <header className="studio-header">
        <div className="studio-header-inner">
          <Wordmark official />
          <nav className="studio-nav" aria-label="Main navigation">
            <a href="/#how">How It Works</a>
            <a href="/design?mode=submit" aria-current="page">AI Studio</a>
            <a href="mailto:aicreator@momentecbrands.com">Contact</a>
          </nav>
          <a className="btn studio-header-cta" href="/design?mode=submit">Submit My Design</a>
        </div>
      </header>

      <main className={`wrap wizard ${lateStep ? "wizard-late" : ""}`}>
      <div className={`wizard-head studio-intro ${lateStep ? "studio-intro-compact" : ""}`}>
        {!lateStep && (
          <>
            <div>
              <p className="studio-kicker">From visual reference to an artist-ready brief</p>
              <h1>Map every mark.<br />Choose the real garment.</h1>
            </div>
            <p className="studio-lead">
              Upload the views you have. The system identifies visible logos, names, numbers, patterns and placement—then separates a customer concept from a production-approved 3D proof.
            </p>
          </>
        )}
        {step !== "done" && (
          <div className="progress" aria-label="Design submission progress">
            {STEP_ORDER.map((s, i) => (
              <div key={s} className={`progress-step ${i <= stepIndex ? "done" : ""} ${s === step ? "current" : ""}`}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                <strong>{STEP_LABEL[s]}</strong>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <div className="error-box">{error}</div>}

      {step === "upload" && (
        <div className="card stage-card">
          <div className="stage-heading">
            <span className="stage-number">01</span>
            <div>
              <h2>Upload your original views</h2>
              <p className="sub">Front is required. Back, left and right are optional. Files are analyzed as supplied—there is no background-removal or preparation step.</p>
            </div>
          </div>
          <div className="upload-grid">
            {(["front", "back", "left", "right"] as Slot[]).map((slot) => (
              <div key={slot} className="upload-slot-wrapper" style={{ position: "relative" }}>
                <label className={`upload-slot ${slot === "front" ? "required" : ""}`}>
                  {images[slot] ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={images[slot]!.url} alt={slot} />
                      {images[slot]!.generated && <span className="gen-badge">AI generated</span>}
                    </>
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
                {images[slot] && (
                  <div className="slot-actions">
                    <button
                      type="button"
                      className="slot-btn"
                      title="Rotate 90° Clockwise"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onRotateSlot(slot);
                      }}
                    >
                      ⟳ Rotate
                    </button>
                    <button
                      type="button"
                      className="slot-btn"
                      title="Remove"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onRemoveSlot(slot);
                      }}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="field known-style-field">
            <label htmlFor="knownStyle">Know your style number? (optional)</label>
            <input
              id="knownStyle"
              type="text"
              placeholder="Enter the manufacturer style number"
              value={knownStyleNumber}
              onChange={(e) => setKnownStyleNumber(e.target.value)}
            />
          </div>

          {/* Offered only when something is actually missing, and never done
              silently - a generated view is an extrapolation, so the customer
              opts in and it stays labelled as generated from here on. */}
          {images.front && missingSlots.length > 0 && (
            <div className="honesty-note" style={{ marginTop: 24 }}>
              <strong>Missing {missingSlots.join(", ")}.</strong> We can generate {missingSlots.length > 1 ? "them" : "it"} from
              the view{Object.keys(images).length > 1 ? "s" : ""} you uploaded, so the 3D proof shows a complete garment.
              Generated views are extrapolations — the model has not seen{" "}
              {missingSlots.length > 1 ? "those sides" : "that side"} of your garment — so they stay marked as generated and
              are not production reference. Uploading real views is always better.
              <div style={{ marginTop: 12 }}>
                <button className="btn btn-secondary btn-sm" disabled={busy} onClick={handleGenerateViews}>
                  {busy ? "Working…" : `Generate ${missingSlots.join(" + ")}`}
                </button>
              </div>
            </div>
          )}

          {viewGenNote && (
            <div className="honesty-note" style={{ marginTop: 16 }}>
              <strong>Generated views:</strong> {viewGenNote}
            </div>
          )}

          <div className="actions-row" style={{ justifyContent: "flex-end" }}>
            <button
              className="btn btn-primary"
              disabled={busy || !images.front || missingSlots.length > 0}
              onClick={handleUploadContinue}
            >
              {busy
                ? "Analyzing…"
                : missingSlots.length > 0
                  ? `Add ${missingSlots.join(", ")} to continue`
                  : "Analyze My Design"}
            </button>
          </div>
        </div>
      )}

      {step === "analyze" && analysis && (
        <div className="card stage-card analysis-stage">
          <div className="stage-heading">
            <span className="stage-number">02</span>
            <div>
              <h2>Confirm the artwork map</h2>
              <p className="sub">
                Every supplied original view is analyzed independently. Bounding boxes and PNG crops support artist review; they are not production vectors.
              </p>
            </div>
          </div>
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
            <div className="field" style={{ marginTop: 0 }}>
              <label>Artwork source</label>
              <select
                value={analysis.artworkKind}
                onChange={(e) => setAnalysis({ ...analysis, artworkKind: e.target.value as ArtworkAnalysis["artworkKind"] })}
              >
                <option value="garment-mockup">Garment mockup / jersey-shaped artwork</option>
                <option value="flat-artwork">Flat artwork, panel layout, logo, or pattern</option>
                <option value="unknown">Not sure — use the image read</option>
              </select>
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
            {(analysis.sleeveMarks?.left || analysis.sleeveMarks?.right) && (
              <p className="sub" style={{ margin: "8px 0 0" }}>
                Sleeve marks detected: left {analysis.sleeveMarks.left || "—"} · right {analysis.sleeveMarks.right || "—"}
              </p>
            )}
          </div>

          {analysis.summary && (
            <div className="field">
              <label>AI summary</label>
              <p className="sub" style={{ margin: 0 }}>{analysis.summary}</p>
            </div>
          )}

          <div className="field">
            <label>Detected artwork and placement</label>
            <div className="artwork-map-stack">
              {(["front", "back", "left", "right"] as Slot[]).filter((view) => images[view]).map((view) => {
                const viewRegions = analysis.regions.filter((region) => region.view === view);
                const sourceUrl = images[view]?.savedUrl || images[view]?.url;
                return (
                  <section key={view} className="artwork-map-row">
                    <div className="artwork-map-source">
                      <strong className="view-title">{VIEW_LABEL[view]}</strong>
                      <div className="artwork-map-canvas">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={sourceUrl} alt={`${view} artwork with detected placements`} style={{ width: "100%", display: "block" }} />
                        {viewRegions.map((region) => (
                          <span
                            key={region.id}
                            title={`${region.type}: ${region.value || region.placement}`}
                            style={{
                              position: "absolute",
                              left: `${region.box.x * 100}%`,
                              top: `${region.box.y * 100}%`,
                              width: `${region.box.width * 100}%`,
                              height: `${region.box.height * 100}%`,
                              border: "2px solid var(--signal)",
                              background: "rgba(255, 215, 0, 0.08)",
                              boxSizing: "border-box",
                            }}
                          >
                            <span className="detection-label">
                              {region.type}{region.value ? ` · ${region.value}` : ""}
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="region-card-grid">
                      {viewRegions.length ? viewRegions.map((region) => (
                        <article key={region.id} className="region-card">
                          {region.extractedAssetUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={region.extractedAssetUrl} alt={`${region.type} extracted from ${view}`} />
                          )}
                          <div className="region-card-type">{region.type.replaceAll("-", " ")}</div>
                          <strong>{region.value || "Visual element"}</strong>
                          {/* Manufacturer location code when the style publishes
                              one, otherwise an explicit "unmapped" - never a
                              silent gap, so the artist can see what still needs
                              a placement decision. */}
                          {region.locationCode ? (
                            <span className="zone-code" title={region.locationLabel ?? undefined}>
                              {region.locationCode}
                              <em>{region.locationLabel}</em>
                            </span>
                          ) : (
                            <span className="zone-code zone-code-none">Location unmapped</span>
                          )}
                          <span>{region.placement}</span>
                          <span className="confidence">Confidence {Math.round(region.confidence * 100)}%</span>
                        </article>
                      )) : <p className="sub" style={{ margin: 0 }}>No discrete regions were detected in this view.</p>}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>

          <div className="actions-row">
            <button className="btn btn-secondary" onClick={() => setStep("upload")}>Back</button>
            <button className="btn btn-primary" disabled={busy} onClick={handleAnalyzeContinue}>
              {busy ? "Matching…" : "Find Matching Styles"}
            </button>
          </div>
        </div>
      )}

      {step === "match" && (
        <div className="card stage-card">
          <div className="stage-heading">
            <span className="stage-number">03</span>
            <div>
              <h2>Choose the real garment</h2>
              <p className="sub">
                Ranked against the local Momentec/Augusta library plus verified external styles. A physical model does not imply customer-artwork mapping has passed.
              </p>
            </div>
          </div>
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
                    <span>Uniform</span>
                  )}
                </div>
                <div className="match-body">
                  <div className="name">{m.style.name}</div>
                  <div className="meta">
                    MSRP ${parseFloat(m.style.msrp).toFixed(2)}
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

          {knownStyleNumber.trim() && chosen && chosen.style.parentSku !== knownStyleNumber.trim() && (
            <div className="viewer-status" style={{ marginTop: 16, background: "#3a2a12", border: "1px solid #7a5a1e" }}>
              <strong>Selected model differs from the entered style number.</strong>
              <span>
                The selected garment uses a different construction. Select the entered garment again unless you intentionally
                want a different cut.
              </span>
            </div>
          )}

          <div className="actions-row">
            <button className="btn btn-secondary" onClick={() => setStep("analyze")}>Back</button>
            <button className="btn btn-primary" disabled={!chosen} onClick={handleMatchContinue}>
              Continue
            </button>
          </div>
        </div>
      )}

      {step === "preview" && chosen && (
        <>
          {chosenAsset?.previewMode === "browser-mapped" && chosenAsset.sizeModelUrls && (
            <section className="proof-size-bar" aria-labelledby="proof-size-title">
              <div>
                <span className="proof-size-kicker">Garment size</span>
                <strong id="proof-size-title">Choose the size to review</strong>
              </div>
              <label className="proof-size-control">
                <span>Size</span>
                <select
                  value={proofSize}
                  onChange={(event) => {
                    setMappedProofReady(false);
                    setMappedProofWarning(null);
                    setProofSize(event.target.value);
                  }}
                >
                  {Object.keys(chosenAsset.sizeModelUrls).map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </label>
            </section>
          )}

        <div className="card stage-card proof-stage-card">
          <div className="stage-heading proof-stage-heading">
            <div>
              <h2>Review the garment proof</h2>
              <p className="sub">{chosen.style.name}</p>
            </div>
          </div>

          {getApparelAssetDescriptor(chosen.style.parentSku).previewMode === "unavailable" && (
            <div className="viewer-wrap">
              {getApparelAssetDescriptor(chosen.style.parentSku).modelUrl && (
                <ThreeViewer glbUrl={getApparelAssetDescriptor(chosen.style.parentSku).modelUrl!} />
              )}
              <div className="viewer-status">
                <strong>3D artwork approval is disabled for this style.</strong>
                <span>The viewer above shows only the selected garment construction. It does not contain an approved mapping of your artwork.</span>
              </div>
              <div className="upload-grid" style={{ marginTop: 16 }}>
                {(["front", "back"] as const).filter((slot) => images[slot]).map((slot) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={slot} src={images[slot]!.url} alt={`Supplied ${slot} artwork reference`} />
                ))}
              </div>
            </div>
          )}

          {getApparelAssetDescriptor(chosen.style.parentSku).previewMode === "browser-mapped" && (
            <div className="proof-viewer-wrap">
              {chosenAsset?.sizeModelUrls && chosenAsset.cutPieceSvgUrl && images.front && (
                <J180AProof
                  frontImageUrl={images.front.savedUrl || images.front.url}
                  backImageUrl={images.back?.savedUrl || images.back?.url}
                  leftImageUrl={images.left?.savedUrl || images.left?.url}
                  rightImageUrl={images.right?.savedUrl || images.right?.url}
                  modelUrls={chosenAsset.sizeModelUrls}
                  cutSvgUrl={chosenAsset.cutPieceSvgUrl}
                  normalMapUrl={chosenAsset.normalMapUrl}
                  size={proofSize}
                  onReady={setMappedProofReady}
                  onWarning={setMappedProofWarning}
                />
              )}
              {mappedProofWarning && (
                <div className="viewer-status" style={{ marginTop: 12, background: "#3a2a12", border: "1px solid #7a5a1e" }}>
                  <strong>Proof-quality notice</strong>
                  <span>{mappedProofWarning}</span>
                </div>
              )}
            </div>
          )}

          {getApparelAssetDescriptor(chosen.style.parentSku).previewMode === "server-baked" && (
            <div className="viewer-wrap">
              {bakeStatus?.status === "done" && bakeStatus.glbUrl ? (
                <>
                  <ThreeViewer glbUrl={bakeStatus.glbUrl} />
                  {generatedViews.length > 0 && (
                    <div className="viewer-status" style={{ marginTop: 8 }}>
                      <strong>{analysis?.artworkKind === "flat-artwork" ? "Model-fit artwork views generated for this preview." : "Missing views generated for this preview."}</strong>
                      <span>
                        {analysis?.artworkKind === "flat-artwork"
                          ? `We used this style's own 3D silhouette to fit your flat design to the ${generatedViews.join(", ")} view${generatedViews.length > 1 ? "s" : ""}. Customer-uploaded side and back views, where present, were used directly.`
                          : `We used this style's own 3D silhouette to create the ${generatedViews.join(", ")} artwork view${generatedViews.length > 1 ? "s" : ""}. Customer-uploaded views, where present, were used directly.`}
                      </span>
                    </div>
                  )}
                  {lowFitWarnings(bakeStatus.stats).map(({ view, iou }) => (
                    <div
                      key={view}
                      className="viewer-status"
                      style={{ background: "#3a2a12", border: "1px solid #7a5a1e", marginTop: 8 }}
                    >
                      <strong>{VIEW_LABEL[view] || view} view didn&apos;t align well.</strong>
                      <span>
                        We&apos;re showing a placeholder pattern there instead of your photo (fit score{" "}
                        {(iou * 100).toFixed(0)}%). Try a straighter, well-lit, square-on shot of that side —
                        the artist reviewing your submission will also see this.
                      </span>
                    </div>
                  ))}
                </>
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
            <button className="btn btn-primary" disabled={busy || !canApprovePreview} onClick={handlePreviewApproval}>
              {busy ? "Preparing artwork package…" : "Prepare artwork package"}
            </button>
          </div>
        </div>
        </>
      )}

      {step === "submit" && (
        <div className="card stage-card handoff-stage">
          <div className="stage-heading proof-stage-heading">
            <div>
              <p className="stage-eyebrow">05 · Artwork handoff</p>
              <h2>Review artwork package &amp; submit</h2>
              <p className="sub">Every item below comes from the approved source views. AI-generated vectors remain artist references until production validation.</p>
            </div>
          </div>

          <div className={`package-status package-status-${artworkPackage?.status || "metadata_only"}`}>
            <div>
              <span className="package-status-kicker">Package status</span>
              <strong>{artworkPackage?.status === "complete" ? "Illustrator package ready" : artworkPackage?.status === "failed" ? "Source assets ready · vector retry needed" : "Source assets ready"}</strong>
              <p>{artworkPackage?.message || artworkIntelligence?.message || "Artwork references are ready for review."}</p>
            </div>
            <div className="package-metrics" aria-label="Artwork package summary">
              <span><b>{artworkPackage?.sourceAssets.length ?? analysis?.regions.length ?? 0}</b> detected assets</span>
              <span><b>{new Set((artworkPackage?.sourceAssets ?? []).map((asset) => asset.view)).size}</b> mapped views</span>
              <span><b>{artworkPackage?.vectorAssets.length ?? 0}</b> SVG files</span>
            </div>
          </div>

          {artworkIntelligence?.dominantColors && artworkIntelligence.dominantColors.length > 0 && (
            <section className="handoff-section color-reference-section">
              <div className="handoff-section-heading">
                <div><span>Color reference</span><h3>Palette read from the artwork</h3></div>
                <p>Hex values are visual references; final production color matching remains part of artist review.</p>
              </div>
              <div className="color-reference-list">
                {artworkIntelligence.dominantColors.map((color) => (
                  <div className="color-reference" key={`${color.name}-${color.hex}`}>
                    <i style={{ background: color.hex }} aria-hidden="true" />
                    <span><strong>{color.name}</strong><small>{color.hex}</small></span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="handoff-section">
            <div className="handoff-section-heading">
              <div><span>Source assets</span><h3>Marks organized by garment view</h3></div>
              <p>Front, back and side references retain their detected placement and manufacturer location code.</p>
            </div>
            {(artworkPackage?.sourceAssets.length ?? 0) > 0 ? (
              <div className="view-asset-groups">
                {(["front", "back", "left", "right"] as Slot[]).map((view) => {
                  const assets = artworkPackage?.sourceAssets.filter((asset) => asset.view === view) ?? [];
                  if (assets.length === 0) return null;
                  return (
                    <section className="view-asset-group" key={view}>
                      <div className="view-asset-title"><span>{view}</span><b>{assets.length}</b></div>
                      <div className="source-asset-grid">
                        {assets.map((asset) => (
                          <article className="source-asset-card" key={asset.id}>
                            <div className="source-asset-preview">
                              {asset.previewUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={asset.previewUrl} alt={`${asset.name} extracted from ${asset.view}`} />
                              ) : <span>No isolated crop</span>}
                            </div>
                            <div className="source-asset-copy">
                              <span className="source-asset-type">{asset.type.replaceAll("-", " ")}</span>
                              <strong>{asset.name}</strong>
                              <p>{asset.placement}</p>
                              <div className="source-asset-meta">
                                <span>{asset.locationCode || "Unmapped"}{asset.locationLabel ? ` · ${asset.locationLabel}` : ""}</span>
                                <span>{Math.round(asset.confidence * 100)}%</span>
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : (
              <div className="package-empty">No isolated region crops were returned. The full approved garment views remain attached to the handoff.</div>
            )}
          </section>

          <section className="handoff-section vector-package-section">
            <div className="handoff-section-heading">
              <div><span>Illustrator deliverables</span><h3>Editable vector reference package</h3></div>
              {artworkPackage?.zipDownloadUrl && <a className="btn btn-primary btn-sm" href={artworkPackage.zipDownloadUrl}>Download all SVGs</a>}
            </div>
            {(artworkPackage?.vectorAssets.length ?? 0) > 0 ? (
              <div className="vector-asset-grid">
                {artworkPackage!.vectorAssets.map((asset, index) => (
                  <article className="vector-asset-card" key={asset.id}>
                    <div className="vector-asset-index">{String(index + 1).padStart(2, "0")}</div>
                    <div className="vector-asset-preview">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={asset.previewUrl} alt={`${asset.name} preview`} />
                    </div>
                    <div className="vector-asset-copy">
                      <h4>{asset.name}</h4>
                      <p>{asset.description}</p>
                      <a href={asset.downloadUrl}>Download SVG <span aria-hidden="true">↗</span></a>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="package-empty package-empty-vector">
                <strong>Vector package is not available yet.</strong>
                <span>{artworkPackage?.status === "failed" ? "The detected source crops are preserved above. Retry Magnific before artist handoff if editable SVG sheets are required." : "Magnific MCP will add the master artwork, typography, texture and primary-logo SVG sheets here."}</span>
              </div>
            )}
          </section>

          <div className="field handoff-comments">
            <label>Production comments (optional)</label>
            <textarea value={comments} onChange={(e) => setComments(e.target.value)} placeholder="e.g. keep the number on the back large, match the blue to our team color…" />
          </div>
          <div className="actions-row handoff-actions">
            <button className="btn btn-secondary" onClick={() => setStep("preview")}>Back to proof</button>
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
            Request <strong>{savedRequest.id}</strong> has been recorded for {savedRequest.chosenStyle.name}. An artist will review it next.
          </p>
          <p style={{ marginTop: 16, fontSize: 12 }}>
            This is a local prototype record, not a live COMS submission — no production order has been placed.
          </p>
          <div style={{ marginTop: 24 }}>
            <a href="/" className="btn btn-secondary">Back to home</a>
          </div>
        </div>
      )}
    </main>

      <footer className="studio-footer">
        <div className="studio-footer-inner">
          <Image
            src="/momentec-brands-logo.png"
            alt="Momentec Brands"
            width={478}
            height={104}
            className="studio-footer-logo"
          />
          <span>
            Every proof on this page is generated from the manufacturer&apos;s own published panel
            geometry. Artist validation is required before production.
          </span>
        </div>
      </footer>
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
