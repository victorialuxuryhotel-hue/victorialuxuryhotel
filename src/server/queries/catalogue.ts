import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient, publicImageUrl, ROOM_IMAGES, SITE_IMAGES } from "@/lib/supabase/public";

/**
 * Public catalogue: what website visitors see about room types and photos.
 * Cached (no cookies involved) and tagged "catalogue"; staff changes call
 * updateTag("catalogue") so the website updates immediately. Rates shown here
 * are "from" prices only; the price of a stay always comes from live
 * availability.
 */

export type PublicPhoto = { image: string; alt: string };

export type PublicCategory = {
  slug: string;
  name: string;
  summary: string;
  description: string;
  amenities: string[];
  maxOccupancy: number;
  fromRateKobo: number;
  photos: PublicPhoto[]; // cover first
};

export async function getPublicCategories(): Promise<PublicCategory[]> {
  "use cache";
  cacheTag("catalogue");
  cacheLife("hours");
  const { data, error } = await createPublicClient()
    .from("room_categories")
    .select("slug, name, short_description, description, amenities, max_occupancy, nightly_rate_kobo, sort_order, room_category_images(storage_path, alt_text, sort_order, is_cover)")
    .eq("is_active", true)
    .order("sort_order")
    .order("nightly_rate_kobo");
  if (error) throw new Error("Could not load room types", { cause: error });
  return data.map((c) => ({
    slug: c.slug,
    name: c.name,
    summary: c.short_description ?? "",
    description: c.description ?? "",
    amenities: c.amenities,
    maxOccupancy: c.max_occupancy,
    fromRateKobo: c.nightly_rate_kobo,
    photos: [...c.room_category_images]
      .sort((a, b) => Number(b.is_cover) - Number(a.is_cover) || a.sort_order - b.sort_order)
      .map((p) => ({ image: publicImageUrl(ROOM_IMAGES, p.storage_path), alt: p.alt_text })),
  }));
}

export async function getPublicCategory(slug: string): Promise<PublicCategory | null> {
  return (await getPublicCategories()).find((c) => c.slug === slug) ?? null;
}

export type SitePhotos = {
  slots: Partial<Record<string, PublicPhoto>>;
  gallery: Array<PublicPhoto & { group: string }>;
};

export async function getSitePhotos(): Promise<SitePhotos> {
  "use cache";
  cacheTag("catalogue");
  cacheLife("hours");
  const { data, error } = await createPublicClient().from("site_photos").select("slot, gallery_group, storage_path, alt_text, sort_order").order("sort_order");
  if (error) throw new Error("Could not load website photos", { cause: error });
  const slots: SitePhotos["slots"] = {};
  const gallery: SitePhotos["gallery"] = [];
  for (const p of data) {
    const photo = { image: publicImageUrl(SITE_IMAGES, p.storage_path), alt: p.alt_text };
    if (p.slot === "gallery") gallery.push({ ...photo, group: p.gallery_group! });
    else slots[p.slot] = photo;
  }
  return { slots, gallery };
}
