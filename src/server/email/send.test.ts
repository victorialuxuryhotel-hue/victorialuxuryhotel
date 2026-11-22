import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { allowed } = await import("./send");

describe("email allowlist", () => {
  it("sends to everyone when unset", () => {
    expect(allowed("guest@example.com", undefined)).toBe(true);
    expect(allowed("guest@example.com", "")).toBe(true);
  });
  it("sends only to listed addresses, ignoring case and spaces", () => {
    expect(allowed("Me@Example.com", " me@example.com , other@example.com")).toBe(true);
    expect(allowed("guest@example.com", "me@example.com")).toBe(false);
  });
  it("sends to nobody with none", () => {
    expect(allowed("me@example.com", "none")).toBe(false);
  });
});
