import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Database tests: business rules against a throwaway local D1 database (the
// real D1 engine via wrangler), created fresh for each run by global-setup.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Domain modules import "server-only"; outside Next it would throw.
      "server-only": fileURLToPath(new URL("./tests/db/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/db/**/*.test.ts"],
    globalSetup: ["tests/db/global-setup.ts"],
    environment: "node",
    // One database; run files serially to keep fixtures isolated.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
