import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit tests: pure business logic, no database.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
