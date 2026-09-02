"use client";

import dynamic from "next/dynamic";
import { ChangeEvent, useEffect, useRef, useState } from "react";
import { ManufacturerSvgCuts } from "@/components/ManufacturerSvgCuts";

const AugustaMaterialBake = dynamic(
  () => import("@/components/AugustaMaterialBake").then((module) => module.AugustaMaterialBake),
  { ssr: false },
);

type ViewSlot = "front" | "back" | "left" | "right";
type ViewUrls = Partial<Record<ViewSlot, string>>;
type ProofView = "front" | "back" | "left" | "right";

const VIEW_LABELS: Record<ViewSlot, string> = {
  front: "Front",
  back: "Back",
  left: "Wearer left",
  right: "Wearer right",
};

const PRODUCT_SIZES = ["S", "M", "L", "XL", "2XL", "3XL", "4XL"];

function rotateClockwise(source: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalHeight;
      canvas.height = image.naturalWidth;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Canvas is unavailable."));
        return;
      }
      context.translate(canvas.width, 0);
      context.rotate(Math.PI / 2);
      context.drawImage(image, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Could not rotate the image."));
          return;
        }
        resolve(URL.createObjectURL(blob));
      }, "image/png");
    };
    image.onerror = () => reject(new Error("Could not read the selected image."));
    image.src = source;
  });
}

export default function VerifiedTeeTestPage() {
  const [views, setViews] = useState<ViewUrls>({});
  const [size, setSize] = useState("M");
  const [ready, setReady] = useState(false);
  const [warning, setWarning] = useState("");
  const [capture, setCapture] = useState("");
  const [proofView, setProofView] = useState<ProofView>("front");
  const createdUrls = useRef<string[]>([]);

  useEffect(() => () => createdUrls.current.forEach((url) => URL.revokeObjectURL(url)), []);
  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    const supplied = (Object.keys(VIEW_LABELS) as ViewSlot[]).reduce<ViewUrls>((result, slot) => {
      const value = parameters.get(slot);
      if (value?.startsWith("/api/uploads/") || value?.startsWith("https://")) result[slot] = value;
      return result;
    }, {});
    if (Object.keys(supplied).length) setViews(supplied);
  }, []);
  function selectFile(slot: ViewSlot, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    createdUrls.current.push(url);
    setReady(false);
    setWarning("");
    setViews((current) => ({ ...current, [slot]: url }));
  }

  async function rotate(slot: ViewSlot) {
    const source = views[slot];
    if (!source) return;
    try {
      const rotated = await rotateClockwise(source);
      createdUrls.current.push(rotated);
      setReady(false);
      setViews((current) => ({ ...current, [slot]: rotated }));
    } catch (error) {
      setWarning(error instanceof Error ? error.message : "Could not rotate the image.");
    }
  }

  function clear(slot: ViewSlot) {
    setReady(false);
    setViews((current) => {
      const next = { ...current };
      delete next[slot];
      return next;
    });
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f0f0f1", paddingBottom: 64 }}>
      <header style={{ background: "#000", color: "#fff", padding: "22px 32px" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24 }}>
          <div>
            <div style={{ font: "900 21px/1.1 Montserrat, sans-serif", letterSpacing: ".08em" }}>CUSTOM SUBLIMATION</div>
            <div style={{ color: "#a9a9ad", marginTop: 6, fontSize: 12 }}>Verified manufacturer proof laboratory</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <a href="/testing-j180a.html" style={{ color: "#fff", font: "800 11px Montserrat, sans-serif", letterSpacing: ".06em" }}>OPEN J180A TEST</a>
            <div style={{ font: "800 12px Montserrat, sans-serif", letterSpacing: ".08em" }}>STYLE 228180</div>
          </div>
        </div>
      </header>
      <div className="grad-rule" />

      <section style={{ maxWidth: 1320, margin: "32px auto 0", padding: "0 24px" }}>
        <div className="card" style={{ padding: 28, marginBottom: 24 }}>
          <p style={{ color: "#005568", font: "800 11px Montserrat, sans-serif", letterSpacing: ".14em", textTransform: "uppercase" }}>
            Official Momentec/Augusta asset contract
          </p>
          <h1 style={{ fontSize: "clamp(28px, 4vw, 48px)", marginTop: 10 }}>228180 Training Tee Test</h1>
          <p style={{ color: "#525257", maxWidth: 850, lineHeight: 1.6, marginTop: 12 }}>
            Upload the customer&apos;s real views below. This page uses the same production crop, UV mapping, official GLB and normal map as the customer flow. Generated views are deliberately excluded.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 18, alignItems: "center" }}>
            <label style={{ fontWeight: 800 }}>
              Manufacturing size&nbsp;
              <select value={size} onChange={(event) => setSize(event.target.value)} style={{ padding: "9px 30px 9px 12px", border: "1px solid #c6c6c9", background: "#fff" }}>
                {PRODUCT_SIZES.map((productSize) => <option key={productSize}>{productSize}</option>)}
              </select>
            </label>
            <a href="/api/augusta-live/228180/artwork.svg" target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ padding: "11px 18px", fontSize: 11 }}>
              Open official cut SVG
            </a>
          </div>
          <p style={{ color: "#85858a", fontSize: 12, marginTop: 10 }}>
            Selected SVG panel group: {size}. The manufacturer publishes one shared 228180 proof GLB; production size grading remains in the official SVG.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14, marginBottom: 24 }}>
          {(Object.keys(VIEW_LABELS) as ViewSlot[]).map((slot) => (
            <div className="card" key={slot} style={{ padding: 14 }}>
              <strong style={{ display: "block", font: "800 12px Montserrat, sans-serif", textTransform: "uppercase", marginBottom: 10 }}>{VIEW_LABELS[slot]}{slot === "front" ? " *" : ""}</strong>
              <label style={{ display: "block", border: "1px dashed #85858a", minHeight: 150, background: "#fff", cursor: "pointer", overflow: "hidden" }}>
                {views[slot] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={views[slot]} alt={`${VIEW_LABELS[slot]} source`} style={{ width: "100%", height: 150, objectFit: "contain", display: "block" }} />
                ) : (
                  <span style={{ height: 150, display: "grid", placeItems: "center", color: "#85858a", fontSize: 13 }}>Choose image</span>
                )}
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => selectFile(slot, event)} style={{ display: "none" }} />
              </label>
              {views[slot] && (
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button type="button" onClick={() => rotate(slot)} style={{ flex: 1, padding: 8, background: "#fff", border: "1px solid #231f20", fontWeight: 700 }}>Rotate</button>
                  <button type="button" onClick={() => clear(slot)} style={{ padding: "8px 12px", background: "#231f20", color: "#fff", border: 0, fontWeight: 700 }}>Clear</button>
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 24 }}>
          <ManufacturerSvgCuts
            svgUrl="/api/augusta-live/228180/artwork.svg"
            size={size}
            styleName="228180 Training Tee"
            expanded
          />
        </div>

        <div className="card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "22px 26px", borderBottom: "1px solid #e2e2e4", display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" }}>
            <div>
              <h2 style={{ fontSize: 21 }}>Interactive 3D proof</h2>
              <p style={{ color: "#525257", marginTop: 5 }}>Drag to rotate. Scroll to zoom.</p>
            </div>
            <span style={{ color: ready ? "#1a7f4b" : "#85858a", fontWeight: 800 }}>{ready ? "VERIFIED & READY" : views.front ? "LOADING PROOF" : "FRONT REQUIRED"}</span>
          </div>
          <div style={{ padding: "12px 26px", borderBottom: "1px solid #e2e2e4", display: "flex", flexWrap: "wrap", gap: 8 }}>
            {(["front", "back", "left", "right"] as ProofView[]).map((angle) => (
              <button
                type="button"
                key={angle}
                onClick={() => setProofView(angle)}
                style={{
                  padding: "9px 16px",
                  border: "1px solid #231f20",
                  background: proofView === angle ? "#231f20" : "#fff",
                  color: proofView === angle ? "#fff" : "#231f20",
                  fontWeight: 800,
                  textTransform: "uppercase",
                }}
              >
                {angle}
              </button>
            ))}
          </div>
          <div className="viewer-wrap" style={{ border: 0, minHeight: 680 }}>
            {views.front ? (
              <AugustaMaterialBake
                sku="228180"
                frontImageUrl={views.front}
                backImageUrl={views.back}
                leftImageUrl={views.left}
                rightImageUrl={views.right}
                onReady={setReady}
                onWarning={setWarning}
                onCapture={setCapture}
                view={proofView}
              />
            ) : (
              <div className="viewer-status">
                <strong>Upload the front view to start the verified proof.</strong>
                <span>Back and sleeve photographs are optional and will never be silently fabricated here.</span>
              </div>
            )}
          </div>
          {(warning || capture) && (
            <div style={{ padding: "16px 24px", borderTop: "1px solid #e2e2e4", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
              <span style={{ color: warning ? "#bf332a" : "#1a7f4b", fontSize: 13 }}>{warning || "Proof capture is available."}</span>
              {capture && <a className="btn btn-primary" href={capture} download={`228180-${size}-proof.png`} style={{ padding: "11px 18px", fontSize: 11 }}>Download proof PNG</a>}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
