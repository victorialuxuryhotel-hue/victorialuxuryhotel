import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Clients that talk to the local Supabase API exactly as the app does, so RLS
 * and function grants are exercised for real (unlike the superuser SQL helpers).
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const secret = process.env.SUPABASE_SECRET_KEY ?? "";
if (!/127\.0\.0\.1|localhost/.test(url) || !publishable || !secret) {
  throw new Error("API tests need the local Supabase URL and keys in .env.local");
}

export type Client = SupabaseClient<Database>;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

export const admin: Client = createClient<Database>(url, secret, opts);

// After `supabase db reset` the API containers restart; wait until they answer
// so a test run straight after a reset doesn't fail in setup.
for (let i = 0; i < 30; i++) {
  const { error } = await admin.from("hotel_settings").select("id").limit(1);
  const { error: authError } = await admin.auth.admin.listUsers({ perPage: 1 });
  if (!error && !authError) break;
  await new Promise((r) => setTimeout(r, 500));
}
export const anon = (): Client => createClient<Database>(url, publishable, opts);

export type Role = Database["public"]["Enums"]["staff_role"];
export type TestUser = { id: string; email: string; client: Client };

const PASSWORD = "test-password-123";

/** Creates an auth user (optionally with a staff profile) and returns a signed-in client. */
export async function makeUser(role: Role | null, opts: { active?: boolean } = {}): Promise<TestUser> {
  const email = `t-${randomUUID().slice(0, 8)}@victoria.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  if (role) {
    const { error: e } = await admin
      .from("staff_profiles")
      .insert({ id: data.user.id, full_name: `Test ${role}`, email, role, is_active: opts.active ?? true });
    if (e) throw e;
  }
  const client = anon();
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInError) throw signInError;
  return { id: data.user.id, email, client };
}

/** Asserts a write was refused: either an error, or RLS silently matched zero rows. */
export function refused(result: { error: unknown; data?: unknown; count?: number | null }) {
  if (result.error) return true;
  const rows = Array.isArray(result.data) ? result.data : result.data ? [result.data] : [];
  return rows.length === 0;
}
