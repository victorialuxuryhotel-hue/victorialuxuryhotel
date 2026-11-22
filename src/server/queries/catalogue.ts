import "server-only";
import { connection } from "next/server";
import { cache } from "react";
import { mediaUrl } from "@/lib/media";
import { all, getDb, type Db } from "../db";

/**
 * Public catalogue: what website visitors see about room types and photos.
 *
 * Read from the database on each request (de-duplicated within a request with
 * React cache). Deliberately not stored in Next's data cache, so staff changes
 * appear on the very next page view and the Worker needs no writable cache.
 * Rates shown here are "from" prices only; the price of a stay always comes
 * from live availability.
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

export const getPublicCategories = cache(async (): Promise<PublicCategory[]> => {
  // The catalogue lives in D1 and staff can change it at any time: always read
  // it at request time, never during the build (there is no database then).
  await connection();
  const db = await getDb();
  const [categories, photos] = await Promise.all([
    all<{ id: string; slug: string; name: string; short_description: string | null; description: string | null; amenities: string; max_occupancy: number; nightly_rate_kobo: number }>(
      db,
      `SELECT id, slug, name, short_description, description, amenities, max_occupancy, nightly_rate_kobo
       FROM room_categories WHERE is_active = 1 ORDER BY sort_order, nightly_rate_kobo`,
    ),
    all<{ category_id: string; storage_path: string; alt_text: string }>(
      db,
      `SELECT i.category_id, i.storage_path, i.alt_text FROM room_category_images i
       JOIN room_categories c ON c.id = i.category_id AND c.is_active = 1
       ORDER BY i.is_cover DESC, i.sort_order, i.created_at`,
    ),
  ]);
  return categories.map((c) => ({
    slug: c.slug,
    name: c.name,
    summary: c.short_description ?? "",
    description: c.description ?? "",
    amenities: JSON.parse(c.amenities) as string[],
    maxOccupancy: c.max_occupancy,
    fromRateKobo: c.nightly_rate_kobo,
    photos: photos.filter((p) => p.category_id === c.id).map((p) => ({ image: mediaUrl(p.storage_path), alt: p.alt_text })),
  }));
});

export async function getPublicCategory(slug: string): Promise<PublicCategory | null> {
  return (await getPublicCategories()).find((c) => c.slug === slug) ?? null;
}

export type SitePhotos = {
  slots: Partial<Record<string, PublicPhoto>>;
  gallery: Array<PublicPhoto & { group: string }>;
};

export const getSitePhotos = cache(async (): Promise<SitePhotos> => {
  await connection();
  const rows = await all<{ slot: string; gallery_group: string | null; storage_path: string; alt_text: string }>(
    await getDb(),
    "SELECT slot, gallery_group, storage_path, alt_text FROM site_photos ORDER BY sort_order, created_at",
  );
  const slots: SitePhotos["slots"] = {};
  const gallery: SitePhotos["gallery"] = [];
  for (const p of rows) {
    const photo = { image: mediaUrl(p.storage_path), alt: p.alt_text };
    if (p.slot === "gallery") gallery.push({ ...photo, group: p.gallery_group! });
    else slots[p.slot] = photo;
  }
  return { slots, gallery };
});

/** Each room type's first real photo (the cover, else the first), by slug. */
export async function coverPhotos(db: Db): Promise<Map<string, PublicPhoto>> {
  const rows = await all<{ slug: string; storage_path: string; alt_text: string }>(
    db,
    `SELECT c.slug, i.storage_path, i.alt_text FROM room_category_images i
     JOIN room_categories c ON c.id = i.category_id
     ORDER BY i.is_cover DESC, i.sort_order, i.created_at`,
  );
  const out = new Map<string, PublicPhoto>();
  for (const r of rows) if (!out.has(r.slug)) out.set(r.slug, { image: mediaUrl(r.storage_path), alt: r.alt_text });
  return out;
}
