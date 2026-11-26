// "Your first day" ticks (interface brief I10). Each staff member ticks their own list only.

import { firstDay } from "@/content/help";
import { AppError } from "@/lib/errors";
import { all, type Actor, type Db } from "../db";

export async function firstDayTicks(db: Db, actor: Actor): Promise<string[]> {
  if (!actor) return [];
  return (await all<{ item: string }>(db, "SELECT item FROM staff_first_day WHERE staff_id = ?", actor.id)).map((r) => r.item);
}

export async function setFirstDayTick(db: Db, actor: Actor, item: string, done: boolean): Promise<void> {
  if (!actor) throw new AppError("UNAUTHENTICATED", "Your session has ended. Please sign in again.");
  if (!firstDay[actor.role]?.some((i) => i.key === item)) throw new AppError("VALIDATION", "That isn't on your first-day list.");
  await db
    .prepare(done ? "INSERT INTO staff_first_day (staff_id, item) VALUES (?, ?) ON CONFLICT DO NOTHING" : "DELETE FROM staff_first_day WHERE staff_id = ? AND item = ?")
    .bind(actor.id, item)
    .run();
}
