import { describe, expect, it } from "vitest";
import { BASE_SECURITY_HEADERS, CONTENT_SECURITY_POLICY, HSTS, withSecurityHeaders } from "./security-headers";

describe("security headers", () => {
  it("blocks framing and embeds a CSP that allows Clerk, maps and Paystack", () => {
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("https://*.clerk.com");
    expect(CONTENT_SECURITY_POLICY).toContain("https://www.google.com");
    expect(CONTENT_SECURITY_POLICY).toContain("https://checkout.paystack.com");
    expect(CONTENT_SECURITY_POLICY).toMatch(/connect-src [^;]*https:\/\/\*\.clerk\.com:\*/);
    expect(BASE_SECURITY_HEADERS.some(([n, v]) => n === "X-Frame-Options" && v === "DENY")).toBe(true);
  });

  it("adds HSTS only on https and strips x-powered-by", async () => {
    const insecure = withSecurityHeaders(
      new Request("http://localhost:3000/"),
      new Response("ok", { headers: { "x-powered-by": "Next.js" } }),
    );
    expect(insecure.headers.get("x-powered-by")).toBeNull();
    expect(insecure.headers.get("Strict-Transport-Security")).toBeNull();
    expect(insecure.headers.get("Content-Security-Policy")).toContain("default-src 'self'");

    const secure = withSecurityHeaders(new Request("https://victorialuxuryhotel.com/"), new Response("ok"));
    expect(secure.headers.get("Strict-Transport-Security")).toBe(HSTS);
  });
});
