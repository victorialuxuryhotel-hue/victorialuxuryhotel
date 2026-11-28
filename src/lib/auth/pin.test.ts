import { describe, expect, it } from "vitest";
import { hashPin, newToken, pinProblem, tokenHash, verifyPin } from "./pin";

describe("PINs", () => {
  it("accepts 4 to 6 digits and refuses weak or malformed ones", () => {
    expect(pinProblem("2580")).toBeNull();
    expect(pinProblem("739164")).toBeNull();
    expect(pinProblem("123")).toMatch(/4 to 6/);
    expect(pinProblem("1234567")).toMatch(/4 to 6/);
    expect(pinProblem("12a4")).toMatch(/4 to 6/);
    expect(pinProblem("0000")).toMatch(/same digit/);
    expect(pinProblem("1234")).toMatch(/straight run/);
    expect(pinProblem("6543")).toMatch(/straight run/);
  });

  it("verifies the right PIN only, never stores it, and salts each hash", async () => {
    const a = await hashPin("2580", "pepper");
    const b = await hashPin("2580", "pepper");
    expect(a).not.toContain("2580");
    expect(a).not.toBe(b);
    expect(await verifyPin("2580", a, "pepper")).toBe(true);
    expect(await verifyPin("2581", a, "pepper")).toBe(false);
    expect(await verifyPin("2580", a, "other")).toBe(false); // the pepper is part of it
    expect(await verifyPin("2580", null)).toBe(false);
    expect(await verifyPin("2580", "pbkdf2$9999999$x$y")).toBe(false);
  });

  it("makes random tokens and keeps only their hash", async () => {
    const t = newToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newToken()).not.toBe(t);
    expect(await tokenHash(t)).toMatch(/^[0-9a-f]{64}$/);
  });
});
