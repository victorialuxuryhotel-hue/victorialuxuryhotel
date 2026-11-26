import { afterEach, describe, expect, it, vi } from "vitest";

const robotsFor = async (url: string) => {
  vi.resetModules();
  vi.doMock("@/lib/seo", () => ({ SITE_URL: url }));
  return (await import("./robots")).default();
};
afterEach(() => vi.doUnmock("@/lib/seo"));

describe("robots", () => {
  it("lets search engines in on the hotel's domain only", async () => {
    const live = await robotsFor("https://victorialuxuryhotel.com");
    expect(live.sitemap).toBe("https://victorialuxuryhotel.com/sitemap.xml");
    expect(JSON.stringify(live.rules)).toContain('"allow":"/"');
  });
  it("keeps them out of staging and anywhere else", async () => {
    expect((await robotsFor("https://staging.victorialuxuryhotel.com")).rules).toEqual([{ userAgent: "*", disallow: "/" }]);
    expect((await robotsFor("http://localhost:3000")).rules).toEqual([{ userAgent: "*", disallow: "/" }]);
  });
});
