import "server-only";
import type { ManagedPhoto } from "@/components/management/photo-manager";
import { publicImageUrl, SITE_IMAGES } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";

/** Website photos for the management screen (read as the signed-in manager). */
export async function listSitePhotos(): Promise<{ bySlot: Record<string, ManagedPhoto>; gallery: ManagedPhoto[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("site_photos").select("id, slot, gallery_group, storage_path, alt_text, sort_order").order("sort_order");
  if (error) throw new Error("Could not load website photos", { cause: error });
  const bySlot: Record<string, ManagedPhoto> = {};
  const gallery: ManagedPhoto[] = [];
  for (const p of data) {
    const photo = { id: p.id, url: publicImageUrl(SITE_IMAGES, p.storage_path), alt: p.alt_text, group: p.gallery_group ?? undefined };
    if (p.slot === "gallery") gallery.push(photo);
    else bySlot[p.slot] = photo;
  }
  return { bySlot, gallery };
}
