import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/** Public pages are open to search engines and AI assistants; staff, booking-in-progress and guest pages are not. */
const PRIVATE = ["/app", "/login", "/auth", "/account", "/api", "/preview", "/book/details", "/book/review", "/book/confirmation", "/book/receipt", "/book/return"];
const AI_BOTS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "Claude-User", "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot-Extended", "Bingbot"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE },
      { userAgent: AI_BOTS, allow: "/", disallow: PRIVATE },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
