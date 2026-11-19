import type { Photo } from "@/content/site";
import type { SitePhotos } from "@/server/queries/catalogue";

/** The uploaded photo for a website place, or the content placeholder until one exists. */
export function sitePhoto(photos: SitePhotos, slot: string, fallback: Photo): Photo {
  const p = photos.slots[slot];
  return p ? { image: p.image, alt: p.alt } : fallback;
}
