"use client";

import dynamic from "next/dynamic";
import { ChangeEvent, useEffect, useRef, useState } from "react";

const J180AProof = dynamic(() => import("@/components/J180AProof").then((module) => module.J180AProof), { ssr: false });

type Slot = "front" | "back" | "left" | "right";
type Images = Partial<Record<Slot, string>>;

const MODEL_URLS: Readonly<Record<string, string>> = {
  S: "/api/augusta-live/J180A/J180A_S.glb",
  M: "/api/augusta-live/J180A/J180A_M.glb",
  L: "/api/augusta-live/J180A/J180A_L.glb",
  XL: "/api/augusta-live/J180A/J180A_XL.glb",
  "2XL": "/api/augusta-live/J180A/J180A_2XL.glb",
  "3XL": "/api/augusta-live/J180A/J180A_3XL.glb",
  "4XL": "/api/augusta-live/J180A/J180A_4XL.glb",
};

const LABELS: Record<Slot, string> = { front: "Front", back: "Back", left: "Wearer left", right: "Wearer right" };

export default function J180ATestPage() {
  const [images, setImages] = useState<Images>({});
  const [size, setSize] = useState("M");
  const [ready, setReady] = useState(false);
  const [warning, setWarning] = useState("");
  const objectUrls = useRef<string[]>([]);

  useEffect(() => () => objectUrls.current.forEach((url) => URL.revokeObjectURL(url)), []);

  function select(slot: Slot, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    objectUrls.current.push(url);
    setReady(false);
    setWarning("");
    setImages((current) => ({ ...current, [slot]: url }));
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f0f0f1", paddingBottom: 64 }}>
      <header style={{ background: "#000", color: "#fff", padding: "22px 32px" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20 }}>
          <div>
            <div style={{ font: "900 21px/1.1 Montserrat, sans-serif", letterSpacing: ".08em" }}>CUSTOM SUBLIMATION</div>
            <div style={{ color: "#a9a9ad", marginTop: 6, fontSize: 12 }}>Separate J180A size-coupled proof laboratory</div>
          </div>
          <a href="/testing.html" style={{ color: "#fff", font: "800 11px Montserrat, sans-serif", letterSpacing: ".06em" }}>OPEN 228180 TEST</a>
        </div>
      </header>
      <div className="grad-rule" />

      <section style={{ maxWidth: 1320, margin: "32px auto 0", padding: "0 24px" }}>
        <div className="card" style={{ padding: 28, marginBottom: 24 }}>
          <p style={{ color: "#005568", font: "800 11px Montserrat, sans-serif", letterSpacing: ".14em", textTransform: "uppercase" }}>Official J180A contract</p>
          <h1 style={{ fontSize: "clamp(28px, 4vw, 48px)", marginTop: 10 }}>J180A Baseball Test</h1>
          <p style={{ color: "#525257", lineHeight: 1.6, marginTop: 12 }}>This remains separate from 228180 because J180A uses size-specific GLBs, plackets and a different SVG-to-UV contract.</p>
          <div style={{ marginTop: 18, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ fontWeight: 800 }}>Proof size&nbsp;
              <select value={size} onChange={(event) => setSize(event.target.value)} style={{ padding: "9px 30px 9px 12px", background: "#fff", border: "1px solid #c6c6c9" }}>
                {Object.keys(MODEL_URLS).map((modelSize) => <option key={modelSize}>{modelSize}</option>)}
              </select>
            </label>
            <a className="btn btn-secondary" href="/api/augusta-live/J180A/prod-J180A-decorations.svg" target="_blank" rel="noreferrer" style={{ padding: "11px 18px", fontSize: 11 }}>Open J180A SVG</a>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14, marginBottom: 24 }}>
          {(Object.keys(LABELS) as Slot[]).map((slot) => (
            <div className="card" key={slot} style={{ padding: 14 }}>
              <strong style={{ display: "block", font: "800 12px Montserrat, sans-serif", textTransform: "uppercase", marginBottom: 10 }}>{LABELS[slot]}{slot === "front" ? " *" : ""}</strong>
              <label style={{ display: "block", minHeight: 150, border: "1px dashed #85858a", background: "#fff", cursor: "pointer", overflow: "hidden" }}>
                {images[slot] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={images[slot]} alt={`${LABELS[slot]} source`} style={{ display: "block", width: "100%", height: 150, objectFit: "contain" }} />
                ) : <span style={{ height: 150, display: "grid", placeItems: "center", color: "#85858a", fontSize: 13 }}>Choose image</span>}
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => select(slot, event)} style={{ display: "none" }} />
              </label>
            </div>
          ))}
        </div>

        <div className="card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "22px 26px", borderBottom: "1px solid #e2e2e4", display: "flex", justifyContent: "space-between", gap: 16 }}>
            <div><h2 style={{ fontSize: 21 }}>J180A interactive proof</h2><p style={{ color: "#525257", marginTop: 5 }}>Official {size} GLB plus the matching SVG size group.</p></div>
            <span style={{ color: ready ? "#1a7f4b" : "#85858a", fontWeight: 800 }}>{ready ? "VERIFIED & READY" : images.front ? "LOADING PROOF" : "FRONT REQUIRED"}</span>
          </div>
          <div className="viewer-wrap" style={{ border: 0, minHeight: 680 }}>
            {images.front ? (
              <J180AProof
                frontImageUrl={images.front}
                backImageUrl={images.back}
                leftImageUrl={images.left}
                rightImageUrl={images.right}
                modelUrls={MODEL_URLS}
                cutSvgUrl="/api/augusta-live/J180A/prod-J180A-decorations.svg"
                normalMapUrl="/api/augusta-live/J180A/nmm.jpg"
                size={size}
                onReady={setReady}
                onWarning={setWarning}
              />
            ) : <div className="viewer-status"><strong>Upload the J180A front view to begin.</strong></div>}
          </div>
          {warning && <div className="error-box" style={{ margin: 18 }}>{warning}</div>}
        </div>
      </section>
    </main>
  );
}
