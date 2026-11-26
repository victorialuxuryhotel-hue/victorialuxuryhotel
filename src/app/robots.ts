import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

const PRIVATE = ["/app", "/login", "/auth", "/account", "/api", "/preview", "/book/details", "/book/review", "/book/confirmation", "/book/receipt", "/book/return"];
const AI_BOTS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "Claude-User", "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot-Extended", "Bingbot"];

/** Only the hotel's own domain is indexed; staging and any other address ask search engines to stay out. */
export const PRODUCTION_HOST = "victorialuxuryhotel.com";

export default function robots(): MetadataRoute.Robots {
  if (new URL(SITE_URL).hostname !== PRODUCTION_HOST) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE },
      { userAgent: AI_BOTS, allow: "/", disallow: PRIVATE },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
