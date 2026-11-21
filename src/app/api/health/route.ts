import { NextResponse } from "next/server";
import { getDb } from "@/server/db";

/**
 * Uptime check for an external monitor (e.g. Better Stack, UptimeRobot).
 * Confirms the app can reach the database. Reveals nothing else.
 */
export async function GET() {
  let ok = false;
  try {
    ok = Boolean(await (await getDb()).prepare("SELECT 1 AS up FROM hotel_settings LIMIT 1").first());
  } catch {
    ok = false;
  }
  return NextResponse.json({ ok }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
