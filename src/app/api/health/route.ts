import { NextResponse } from "next/server";
import { getDb } from "@/server/db";

export async function GET() {
  let ok = false;
  try {
    ok = Boolean(await (await getDb()).prepare("SELECT 1 AS up FROM hotel_settings LIMIT 1").first());
  } catch {
    ok = false;
  }
  return NextResponse.json({ ok }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
