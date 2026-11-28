import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@clerk/nextjs/server", () => ({ clerkMiddleware: (fn: unknown) => fn }));
const { staffAddress } = await import("./proxy");

const req = (url: string) => new NextRequest(url, { headers: { host: new URL(url).host } });

describe("the staff app on its own address (APP_HOST)", () => {
  beforeEach(() => vi.stubEnv("APP_HOST", "app.victorialuxuryhotel.com"));
  afterEach(() => vi.unstubAllEnvs());

  it("moves the main site's staff paths to the app address, keeping path and query", () => {
    for (const path of ["/login?next=%2Fapp%2Ftoday", "/app", "/app/reservations/abc", "/station", "/two-step/security", "/auth/accept"]) {
      const r = staffAddress(req(`https://victorialuxuryhotel.com${path}`))!;
      expect(r.status).toBe(308);
      expect(r.headers.get("location")).toBe(`https://app.victorialuxuryhotel.com${path}`);
    }
    expect(staffAddress(req("https://www.victorialuxuryhotel.com/login"))?.headers.get("location")).toBe("https://app.victorialuxuryhotel.com/login");
  });

  it("leaves guest pages, payments and webhooks alone, and the app address opens the staff app", () => {
    for (const path of ["/", "/rooms/deluxe", "/book", "/pay/abc", "/api/paystack/callback?reference=x", "/application"]) {
      expect(staffAddress(req(`https://victorialuxuryhotel.com${path}`))).toBeNull();
    }
    expect(staffAddress(req("https://app.victorialuxuryhotel.com/"))?.headers.get("location")).toBe("https://app.victorialuxuryhotel.com/app");
    expect(staffAddress(req("https://app.victorialuxuryhotel.com/app/today"))).toBeNull();
  });

  it("does nothing on localhost, staging or workers.dev, or when APP_HOST isn't set", () => {
    expect(staffAddress(req("http://localhost:3000/login"))).toBeNull();
    expect(staffAddress(req("https://staging.victorialuxuryhotel.com/login"))).toBeNull();
    expect(staffAddress(req("https://victorialuxuryhotel.victorialuxuryhotel.workers.dev/app"))).toBeNull();
    vi.stubEnv("APP_HOST", "");
    expect(staffAddress(req("https://victorialuxuryhotel.com/login"))).toBeNull();
  });
});
