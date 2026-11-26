"use server";

import { activity, getDb, writeBatch } from "./db";
import { actorOf, authorize } from "./auth";
import { logger } from "@/lib/logger";

/**
 * Hardware brief H8: note the browser a staff member uses, once per sign-in session, so support
 * can see which computer and browser a problem came from. Best effort: never shows an error.
 */
export async function noteBrowser(userAgent: string): Promise<void> {
  try {
    const staff = await authorize();
    const ua = String(userAgent ?? "").slice(0, 400);
    if (!ua) return;
    const db = await getDb();
    await writeBatch(db, actorOf(staff), [activity(db, "staff.browser", "staff_profile", staff.id, `Using ${ua.slice(0, 120)}`, { user_agent: ua })]);
  } catch (err) {
    logger.error("staff.browser_note_failed", err);
  }
}
