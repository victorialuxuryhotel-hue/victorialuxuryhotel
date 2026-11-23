import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("./db", () => ({ getDb: async () => ({}) }));

describe("networkOf", () => {
  it("groups IPv6 addresses by /64 and leaves IPv4 alone", async () => {
    const { networkOf } = await import("./rate-limit");
    expect(networkOf("102.89.33.4")).toBe("102.89.33.4");
    expect(networkOf("2001:db8:0:1:aaaa::1")).toBe(networkOf("2001:0db8:0000:0001:ffff:1:2:3"));
    expect(networkOf("2001:db8:0:1::5")).toBe("2001:db8:0:1::/64");
    expect(networkOf("2001:db8:0:2::5")).not.toBe(networkOf("2001:db8:0:1::5"));
    expect(networkOf("::1")).toBe("0:0:0:0::/64");
  });
});
