"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { prepareImageForSubmit } from "@/lib/client-image";
import { DEFAULT_QUALITY, DEFAULT_SIZE, GARMENT_SIZES, IMAGE_QUALITIES, MAX_IMAGE_BYTES, MAX_REFERENCES } from "@/lib/upload-form";
import "./upload-ai-design.css";

const ACCEPT = ".jpg,.jpeg,.png,.webp";
const ACCEPT_RE = /\.(jpe?g|png|webp)$/i;

function readLinks(text: string): string[] {
  return text
    .split(/\s+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

type Reference = { id: string; file: File; url: string };

export function UploadAiDesignModal() {
  const [open, setOpen] = useState(true);
  const [references, setReferences] = useState<Reference[]>([]);
  const [fileError, setFileError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [size, setSize] = useState("");
  const [quality, setQuality] = useState<string>(DEFAULT_QUALITY);
  const [links, setLinks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [jobId, setJobId] = useState("");
  const [copied, setCopied] = useState(false);
  const uploaded = Boolean(jobId);
  const referencesRef = useRef(references);
  referencesRef.current = references;

  useEffect(() => {
    return () => {
      for (const reference of referencesRef.current) URL.revokeObjectURL(reference.url);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function clearReferences() {
    for (const reference of referencesRef.current) URL.revokeObjectURL(reference.url);
    setReferences([]);
  }

  function reopen() {
    clearReferences();
    setFileError("");
    setSize("");
    setQuality(DEFAULT_QUALITY);
    setLinks("");
    setJobId("");
    setCopied(false);
    setOpen(true);
  }

  function takeFiles(list: FileList | null) {
    const incoming = Array.from(list ?? []);
    if (incoming.length === 0) return;
    if (incoming.some((file) => !ACCEPT_RE.test(file.name))) {
      setFileError("Use a .jpg, .png, or .webp image.");
      return;
    }
    const room = MAX_REFERENCES - referencesRef.current.length;
    if (room <= 0) {
      setFileError(`You can add up to ${MAX_REFERENCES} images.`);
      return;
    }
    const accepted = incoming.slice(0, room);
    setFileError(accepted.length < incoming.length ? `You can add up to ${MAX_REFERENCES} images.` : "");
    setReferences((current) => [
      ...current,
      ...accepted.map((file) => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file) })),
    ]);
  }

  function removeReference(id: string) {
    setReferences((current) => {
      const previous = current.find((item) => item.id === id);
      if (previous) URL.revokeObjectURL(previous.url);
      return current.filter((item) => item.id !== id);
    });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || uploaded) return;
    const imageLinks = readLinks(links);
    if (references.length === 0 && imageLinks.length === 0) {
      setFileError("Add at least one image of your garment, as a file or a link.");
      return;
    }
    if (imageLinks.some((link) => !/^https:\/\//i.test(link))) {
      setFileError("Image links must start with https://");
      return;
    }
    if (references.length + imageLinks.length > MAX_REFERENCES) {
      setFileError(`You can add up to ${MAX_REFERENCES} images in total.`);
      return;
    }
    const entered = new FormData(event.currentTarget);
    setSubmitting(true);
    setFileError("");
    try {
      const files = await Promise.all(references.map((item) => prepareImageForSubmit(item.file)));
      const total = files.reduce((sum, file) => sum + file.size, 0);
      if (total > MAX_IMAGE_BYTES) {
        setFileError("These images are too large together. Remove one or two and try again.");
        return;
      }
      const body = new FormData();
      for (const file of files) body.append("reference", file);
      for (const link of imageLinks) body.append("link", link);
      body.append("size", size || DEFAULT_SIZE);
      body.append("quality", quality);
      body.append("name", String(entered.get("name") ?? ""));
      body.append("email", String(entered.get("email") ?? ""));
      body.append("message", String(entered.get("message") ?? ""));
      const response = await fetch("/api/upload-ai-design/submit", { method: "POST", body });
      const payload = await response.json().catch(() => null);
      if (!response.ok || typeof payload?.jobId !== "string") {
        setFileError(typeof payload?.error === "string" ? payload.error : "Could not upload the design.");
        return;
      }
      setJobId(payload.jobId);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Could not upload the design.");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyJobId() {
    try {
      await navigator.clipboard.writeText(jobId);
      setCopied(true);
    } catch {
      // The id is selectable text, so it can still be copied by hand.
    }
  }

  const locked = submitting || uploaded;
  const referenceLabel = references.length === 1 ? "1 image" : `${references.length} images`;

  if (!open) {
    return (
      <main className="upload-ai-page">
        <button className="upload-ai-reopen" type="button" onClick={reopen}>
          Upload your AI design
        </button>
      </main>
    );
  }

  return (
    <main className="upload-ai-page">
      <div className="upload-ai-backdrop">
        <section className="upload-ai-dialog" role="dialog" aria-modal="true" aria-labelledby="upload-ai-title">
          <button className="upload-ai-close" type="button" aria-label="Close" onClick={() => setOpen(false)}>
            ×
          </button>

          <header className="upload-ai-head">
            <img className="upload-ai-logo" src="/upload-ai-design/header-mark.png" alt="" />
            <div>
              <h1 id="upload-ai-title">Upload your AI design</h1>
              <p>
                Drag and drop your AI generated design in the form below and get production-ready mockups for approval within 24hrs at <strong>NO charge</strong>.
              </p>
              <a className="upload-ai-jobs-link" href="/jobs">
                Job status →
              </a>
            </div>
          </header>

          <form onSubmit={onSubmit}>
            <div
              className={["upload-ai-drop", dragOver ? "is-over" : ""].filter(Boolean).join(" ")}
              onDragOver={(event) => {
                event.preventDefault();
                if (!locked) setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragOver(false);
                if (!locked) takeFiles(event.dataTransfer.files);
              }}
            >
              <label className="upload-ai-drop-label">
                <input
                  aria-label="Design images"
                  type="file"
                  accept={ACCEPT}
                  multiple
                  disabled={locked}
                  onChange={(event) => {
                    takeFiles(event.target.files);
                    event.target.value = "";
                  }}
                />
                <span className="upload-ai-drop-title">Drop your idea here</span>
                <span className="upload-ai-drop-hint">One photo is enough. Add a back view or close-ups of logos if you have them.</span>
                <span className="upload-ai-drop-browse">Browse</span>
              </label>
              {references.length > 0 ? (
                <div className="upload-ai-refs">
                  {references.map((item, index) => (
                    <div className="upload-ai-ref" key={item.id}>
                      <img src={item.url} alt={`Design image ${index + 1}`} />
                      {locked ? null : (
                        <button type="button" className="upload-ai-view-remove" aria-label={`Remove design image ${index + 1}`} onClick={() => removeReference(item.id)}>
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            <p className="upload-ai-views-meta">
              <span>{references.length === 0 ? "" : referenceLabel}</span>
              <span>JPG, PNG, or WEBP</span>
            </p>

            <fieldset className="upload-ai-fields" disabled={locked}>
              <label className="upload-ai-field">
                <span>Image links:</span>
                <textarea
                  rows={2}
                  value={links}
                  onChange={(event) => setLinks(event.target.value)}
                  placeholder="Or paste https image links, one per line"
                />
              </label>
            </fieldset>
            {fileError ? <p className="upload-ai-file-error">{fileError}</p> : null}

            <fieldset className="upload-ai-fields" disabled={locked}>
              <div className="upload-ai-fit">
                <label className="upload-ai-field">
                  <span>Size:</span>
                  <select
                    name="size"
                    value={size}
                    className={size ? undefined : "is-placeholder"}
                    onChange={(event) => setSize(event.target.value)}
                  >
                    <option value="">Select (default {DEFAULT_SIZE})</option>
                    {GARMENT_SIZES.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="upload-ai-field">
                  <span>Quality:</span>
                  <select name="quality" value={quality} onChange={(event) => setQuality(event.target.value)}>
                    {IMAGE_QUALITIES.map((item) => (
                      <option key={item} value={item}>
                        {item === "high" ? "High (best detail)" : item === "medium" ? "Medium" : "Low (fast draft)"}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="upload-ai-field">
                <span><i>*</i>Name:</span>
                <input name="name" required autoComplete="name" placeholder="John Doe" />
              </label>

              <label className="upload-ai-field">
                <span><i>*</i>Email:</span>
                <input name="email" type="email" required autoComplete="email" placeholder="Emailname@domain.com" />
              </label>

              <label className="upload-ai-field">
                <span>Message:</span>
                <textarea
                  name="message"
                  rows={2}
                  placeholder="Add any additional details here. Ex: We'd like for the logo to be bigger than the design that we sent"
                />
              </label>

              <p className="upload-ai-required"><i>*</i>Required field</p>
              {uploaded ? null : (
                <button className="upload-ai-submit" type="submit" disabled={submitting}>
                  {submitting ? "Uploading" : "Upload design"}
                </button>
              )}
            </fieldset>
            {uploaded ? (
              <>
                <p className="upload-ai-submit is-done" role="status">
                  <span className="upload-ai-tick" aria-hidden="true">✓</span>
                  Your design was uploaded. You can close this page.
                </p>
                <div className="upload-ai-tracking">
                  <span>Tracking ID</span>
                  <code>{jobId}</code>
                  <button type="button" onClick={copyJobId}>
                    {copied ? "Copied" : "Copy"}
                  </button>
                  <small>
                    <a href={`/status/${encodeURIComponent(jobId)}`} target="_blank" rel="noreferrer">Track your proof's progress →</a>
                    {"  ·  "}
                    <a href="/jobs">All jobs →</a>
                    {"  ·  "}
                    <button type="button" className="upload-ai-again" onClick={reopen}>
                      Submit another design
                    </button>
                  </small>
                </div>
              </>
            ) : null}
          </form>
        </section>
      </div>
    </main>
  );
}
