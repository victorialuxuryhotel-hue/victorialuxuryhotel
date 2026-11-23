import type { NextConfig } from "next";
import { homedir } from "node:os";
import { join } from "node:path";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  images: {
    localPatterns: [
      { pathname: "/media/**", search: "" },
      { pathname: "/brand/**", search: "" },
    ],
  },
  experimental: {
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

const LOCAL_STATE = join(homedir(), ".cache", "victoria-hotel", "wrangler");
if (process.env.NODE_ENV === "development") void initOpenNextCloudflareForDev({ persist: { path: join(LOCAL_STATE, "v3") } });
