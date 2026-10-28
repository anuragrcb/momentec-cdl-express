/**
 * Client-side image preparation for CDL Express uploads.
 * The proof API takes at most 4 MB of images per job (sent as base64 JSON), so every image is
 * downscaled and re-encoded as JPEG on white before it leaves the browser.
 */

export async function prepareImageForSubmit(file: File, maxDimension = 1600, quality = 0.85): Promise<File> {
  const image = await loadImage(file);
  let width = image.naturalWidth;
  let height = image.naturalHeight;
  if (width === 0 || height === 0) throw new Error("Could not read one of the images.");
  const longEdge = Math.max(width, height);
  if (longEdge > maxDimension) {
    const scale = maxDimension / longEdge;
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare one of the images.");
  // JPEG has no transparency; paint white first so transparent PNGs do not turn black.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("Could not prepare one of the images.");
  const name = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
  return new File([blob], name, { type: "image/jpeg" });
}

function loadImage(source: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(source);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read one of the images."));
    };
    image.src = url;
  });
}
