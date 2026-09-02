"use client";

import { useEffect, useState } from "react";

interface ManufacturerSvgCutsProps {
  svgUrl: string;
  size: string;
  styleName: string;
  expanded?: boolean;
}

/** Read-only view of the exact manufacturer cut geometry used by the proof.
 * It never rewrites or approximates paths; it only selects the configured
 * size group from the allow-listed production SVG. */
export function ManufacturerSvgCuts({
  svgUrl,
  size,
  styleName,
  expanded = false,
}: ManufacturerSvgCutsProps) {
  const [previewUrl, setPreviewUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let disposed = false;
    let objectUrl = "";
    setPreviewUrl("");
    setError("");

    (async () => {
      try {
        const response = await fetch(svgUrl);
        if (!response.ok) throw new Error(`Manufacturer SVG is unavailable (${response.status}).`);
        const documentNode = new DOMParser().parseFromString(await response.text(), "image/svg+xml");
        if (documentNode.querySelector("parsererror")) throw new Error("Manufacturer SVG could not be parsed.");

        documentNode.querySelectorAll("script, foreignObject").forEach((node) => node.remove());
        const groups = [...documentNode.querySelectorAll<SVGGElement>('g[id^="Garment_x5F_"]')];
        const selectedPrefix = `Garment_x5F_${size}`;
        let selected = false;
        for (const group of groups) {
          const visible = group.id === selectedPrefix || group.id.startsWith(`${selectedPrefix}_`);
          group.setAttribute("display", visible ? "inline" : "none");
          group.style.display = visible ? "inline" : "none";
          selected ||= visible;
        }
        if (!selected) throw new Error(`The production SVG has no ${size} cut group.`);

        const svg = documentNode.documentElement;
        svg.setAttribute("width", "100%");
        svg.setAttribute("height", "100%");
        svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
        objectUrl = URL.createObjectURL(new Blob(
          [new XMLSerializer().serializeToString(documentNode)],
          { type: "image/svg+xml" },
        ));
        if (!disposed) setPreviewUrl(objectUrl);
      } catch (reason) {
        if (!disposed) setError(reason instanceof Error ? reason.message : "Could not display the manufacturer SVG.");
      }
    })();

    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [size, svgUrl]);

  return (
    <details className="manufacturer-cuts" open={expanded}>
      <summary>
        <span>
          <small>Production geometry</small>
          <strong>View the {size} SVG cut pieces</strong>
        </span>
        <em>{previewUrl ? "Verified source loaded" : error ? "Review needed" : "Loading"}</em>
      </summary>
      <div className="manufacturer-cuts-body">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt={`${styleName} ${size} manufacturer SVG cut pieces`} />
        ) : (
          <div className={error ? "error-box" : "viewer-status"}>{error || "Preparing the selected size group…"}</div>
        )}
      </div>
      <footer>
        <span>Exact manufacturer SVG · size {size}</span>
        <a href={svgUrl} target="_blank" rel="noreferrer">Open source SVG</a>
      </footer>
    </details>
  );
}
