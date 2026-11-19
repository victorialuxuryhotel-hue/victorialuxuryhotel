import type { NextConfig } from "next";

const supabaseUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321");

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    // Only our own public storage buckets may be optimized: no open image proxy.
    remotePatterns: [
      {
        protocol: supabaseUrl.protocol.replace(":", "") as "http" | "https",
        hostname: supabaseUrl.hostname,
        port: supabaseUrl.port,
        pathname: "/storage/v1/object/public/**",
        search: "",
      },
    ],
    // Local Supabase runs on 127.0.0.1. Never allowed in production (SSRF risk).
    dangerouslyAllowLocalIP: process.env.NODE_ENV === "development",
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
