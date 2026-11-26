"use server";

import { refresh } from "next/cache";
import { actorOf, authorizeRead } from "./auth";
import { getDb } from "./db";
import { setFirstDayTick } from "./domain/first-day";

/** Tick or untick one job on "Your first day". Every signed-in staff member, their own list only. */
export async function tickFirstDay(item: string, done: boolean): Promise<{ ok: boolean }> {
  try {
    const staff = await authorizeRead(["reservations.manage", "pos.sell"]);
    await setFirstDayTick(await getDb(), actorOf(staff), String(item).slice(0, 40), Boolean(done));
    refresh();
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
