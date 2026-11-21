import "server-only";
import type { ManagedPhoto } from "@/components/management/photo-manager";
import { mediaUrl } from "@/lib/media";
import { authorize } from "../auth";
import { all, getDb } from "../db";

/** Website photos for the management screen. */
export async function listSitePhotos(): Promise<{ bySlot: Record<string, ManagedPhoto>; gallery: ManagedPhoto[] }> {
  await authorize("categories.manage");
  const rows = await all<{ id: string; slot: string; gallery_group: string | null; storage_path: string; alt_text: string }>(
    await getDb(),
    "SELECT id, slot, gallery_group, storage_path, alt_text FROM site_photos ORDER BY sort_order, created_at",
  );
  const bySlot: Record<string, ManagedPhoto> = {};
  const gallery: ManagedPhoto[] = [];
  for (const p of rows) {
    const photo = { id: p.id, url: mediaUrl(p.storage_path), alt: p.alt_text, group: p.gallery_group ?? undefined };
    if (p.slot === "gallery") gallery.push(photo);
    else bySlot[p.slot] = photo;
  }
  return { bySlot, gallery };
}
