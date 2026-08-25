import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Uploaded reference images and baked previews are read from local disk
  // (public/uploads) rather than a remote image CDN.
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
