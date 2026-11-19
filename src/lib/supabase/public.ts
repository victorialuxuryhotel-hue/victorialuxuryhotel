import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Anonymous, cookie-free client for public catalogue reads (room types, photos).
 * Runs under RLS as a website visitor, so it can only see what the public may
 * see, and can be used inside "use cache" functions.
 */
export function createPublicClient() {
  const env = publicEnv();
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const ROOM_IMAGES = "room-images";
export const SITE_IMAGES = "site-images";

export function publicImageUrl(bucket: string, path: string) {
  return `${publicEnv().NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`;
}
