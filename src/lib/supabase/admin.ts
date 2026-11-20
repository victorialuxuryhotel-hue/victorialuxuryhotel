import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import type { Database } from "./database.types";

/**
 * Privileged client using the secret key. It BYPASSES Row Level Security.
 *
 * Only for trusted server paths that have no staff session and have already
 * authenticated the caller another way: the Paystack webhook (signature
 * verified), the public booking flow (calls narrowly scoped database
 * functions), and scheduled jobs (CRON_SECRET). Never import from client code.
 */
export function createAdminClient() {
  // Deliberately NOT cached across requests. On Cloudflare Workers, an object
  // holding a pending promise from one request (supabase-js starts auth
  // initialisation on construction) can't be awaited by a later request; the
  // runtime rejects it. A client is just an object, so creating one per use
  // is cheap.
  return createClient<Database>(publicEnv().NEXT_PUBLIC_SUPABASE_URL, serverEnv.supabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
