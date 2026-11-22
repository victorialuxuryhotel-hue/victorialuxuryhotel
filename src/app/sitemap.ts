import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { SITE_URL } from "@/lib/seo";
import { getPublicCategories } from "@/server/queries/catalogue";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const pages = ["", "/rooms", "/facilities", "/gallery", "/about", "/contact", "/book"];
  const rooms = await getPublicCategories().catch(() => []);
  return [
    ...pages.map((p) => ({ url: `${SITE_URL}${p}`, changeFrequency: "weekly" as const, priority: p === "" ? 1 : 0.8 })),
    ...rooms.map((r) => ({ url: `${SITE_URL}/rooms/${r.slug}`, changeFrequency: "weekly" as const, priority: 0.9 })),
  ];
}
