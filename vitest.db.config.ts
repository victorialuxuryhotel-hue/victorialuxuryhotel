import { defineConfig } from "vitest/config";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";

// Database integration tests. Require the local stack: `pnpm db:start && pnpm db:reset`.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/db/**/*.test.ts"],
    // Supabase URL and keys for API-level (RLS) tests come from .env.local.
    env: existsSync(".env.local") ? (parseEnv(readFileSync(".env.local", "utf8")) as Record<string, string>) : {},
    environment: "node",
    // Tests share one database; run files serially to keep fixtures isolated.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
