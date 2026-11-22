import { describe, expect, it } from "vitest";
import { hashCode, signGuest, verifyGuest } from "./guest-token";

const secret = "x".repeat(40);

describe("guest session token", () => {
  it("round-trips, expires, and rejects tampering or a short secret", async () => {
    const t = await signGuest(secret, "ada@example.com", 1_000);
    expect(await verifyGuest(secret, t, 2_000)).toBe("ada@example.com");
    expect(await verifyGuest(secret, t, 1_000 + 8 * 86_400_000)).toBeNull();
    expect(await verifyGuest("y".repeat(40), t, 2_000)).toBeNull();
    expect(await verifyGuest(secret, t.replace(/.$/, (c) => (c === "A" ? "B" : "A")), 2_000)).toBeNull();
    expect(await verifyGuest("short", t, 2_000)).toBeNull();
  });
  it("hashes codes per email", async () => {
    expect(await hashCode("A@x.com", "123456")).toBe(await hashCode("a@x.com", "123456"));
    expect(await hashCode("a@x.com", "123456")).not.toBe(await hashCode("b@x.com", "123456"));
  });
});
