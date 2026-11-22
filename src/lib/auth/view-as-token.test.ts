import { describe, expect, it } from "vitest";
import { signViewAs, verifyViewAs, VIEW_AS_MINUTES } from "./view-as-token";

const secret = "a".repeat(40);

describe("view-as token", () => {
  it("round-trips for the same secret before expiry", async () => {
    const t = await signViewAs(secret, "owner-1", "sess-1", 1_000);
    expect(await verifyViewAs(secret, t, 2_000)).toEqual({ staffId: "owner-1", sessionId: "sess-1", exp: 1_000 + VIEW_AS_MINUTES * 60_000 });
  });

  it("is refused after 30 minutes", async () => {
    const t = await signViewAs(secret, "owner-1", "sess-1", 0);
    expect(await verifyViewAs(secret, t, VIEW_AS_MINUTES * 60_000)).toBeNull();
  });

  it("is refused with another secret, a changed body, or garbage", async () => {
    const t = await signViewAs(secret, "owner-1", "sess-1");
    expect(await verifyViewAs("b".repeat(40), t)).toBeNull();
    const [body, sig] = t.split(".");
    const forged = btoa(JSON.stringify({ staffId: "someone-else", sessionId: "sess-1", exp: Date.now() + 1e6 })).replace(/=+$/, "");
    expect(await verifyViewAs(secret, `${forged}.${sig}`)).toBeNull();
    expect(await verifyViewAs(secret, `${body}.`)).toBeNull();
    expect(await verifyViewAs(secret, "not-a-token")).toBeNull();
    expect(await verifyViewAs(secret, undefined)).toBeNull();
  });

  it("is off without a strong secret", async () => {
    const t = await signViewAs("short", "owner-1", "sess-1");
    expect(await verifyViewAs("short", t)).toBeNull();
  });
});
