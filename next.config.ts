import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    // Photos are served by our own /media route (from R2); no remote images,
    // so next/image is never an open proxy.
    localPatterns: [
      { pathname: "/media/**", search: "" },
      { pathname: "/brand/**", search: "" },
    ],
  },
  experimental: {
    // Photo uploads (5 MB max per file) plus multipart overhead.
    serverActions: { bodySizeLimit: "6mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

// `next dev` gets the same bindings as the Worker (local D1 and R2 under
// .wrangler/state), so the app runs locally exactly as on Cloudflare.
if (process.env.NODE_ENV === "development") void initOpenNextCloudflareForDev();
