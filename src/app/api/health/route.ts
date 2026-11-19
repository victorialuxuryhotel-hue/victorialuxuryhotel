import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Uptime check for an external monitor (e.g. Better Stack, UptimeRobot).
 * Confirms the app can reach the database. Reveals nothing else.
 */
export async function GET() {
  const { error } = await createAdminClient().from("hotel_settings").select("id").limit(1);
  return NextResponse.json({ ok: !error }, { status: error ? 503 : 200, headers: { "Cache-Control": "no-store" } });
}
