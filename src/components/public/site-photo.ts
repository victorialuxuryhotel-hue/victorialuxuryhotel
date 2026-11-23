import type { Photo } from "@/content/site";
import type { SitePhotos } from "@/server/queries/catalogue";

export function sitePhoto(photos: SitePhotos, slot: string, fallback: Photo): Photo {
  const p = photos.slots[slot];
  return p ? { image: p.image, alt: p.alt } : fallback;
}
