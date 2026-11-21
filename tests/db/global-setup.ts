import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";

/**
 * A fresh, throwaway D1 database for every run: migrations, then the seed.
 * Separate from the dev database (.wrangler/state), so tests never touch the
 * data you're looking at in `pnpm dev`, and runs are reproducible.
 */
export const TEST_DB_DIR = ".tmp/test-d1";

export default function setup() {
  rmSync(TEST_DB_DIR, { recursive: true, force: true });
  const wrangler = (...args: string[]) =>
    execFileSync("pnpm", ["exec", "wrangler", "d1", ...args, "--local", "--persist-to", TEST_DB_DIR], { stdio: "pipe" });
  wrangler("migrations", "apply", "victoria-hotel-db");
  wrangler("execute", "victoria-hotel-db", "--file", "db/seed.sql");
  // Mutation testing: `DROP_TRIGGERS=a,b pnpm test:db` must make some test fail.
  for (const name of process.env.DROP_TRIGGERS?.split(",").filter(Boolean) ?? []) {
    wrangler("execute", "victoria-hotel-db", "--command", `DROP TRIGGER ${name.replace(/[^a-z_]/g, "")}`);
  }
}
