/**
 * Client-side image compression utility for CDL Express.
 *
 * Compresses and downscales user-uploaded camera / high-res photos in the browser
 * before uploading to Vercel serverless functions.
 *
 * Vercel Serverless Functions enforce a strict 4.5 MB request body limit.
 * High-resolution phone photos (5-15MB each) easily exceed this limit when multiple
 * views are uploaded together. Downscaling to a maximum of 2048px (maintaining aspect ratio)
 * and compressing to high-quality JPEG (0.88) reduces file size to ~300KB-700KB per view
 * without losing fidelity for Gemini Vision analysis or 3D texture baking.
 */

export async function compressImageForUpload(
  file: File,
  maxDimension: number = 2048,
  quality: number = 0.88
): Promise<File> {
  // If file is already under 600KB and reasonably sized, avoid re-encoding
  if (file.size < 600 * 1024 && !file.type.includes('heic')) {
    return file;
  }

  // Only process standard browser-supported image MIME types
  if (!file.type.startsWith('image/')) {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;
      if (width === 0 || height === 0) {
        resolve(file);
        return;
      }

      // Compute downscaled dimensions preserving aspect ratio
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      // Convert heavy PNGs/HEICs to clean JPEGs for 90% size reduction
      const targetMime = file.type === 'image/png' && file.size > 1.5 * 1024 * 1024 ? 'image/jpeg' : file.type || 'image/jpeg';

      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) {
            resolve(file);
            return;
          }

          const ext = targetMime === 'image/jpeg' ? 'jpg' : 'png';
          const cleanName = file.name.replace(/\.[^/.]+$/, '') + `.${ext}`;
          const compressed = new File([blob], cleanName, { type: targetMime });
          resolve(compressed);
        },
        targetMime,
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };

    img.src = objectUrl;
  });
}
