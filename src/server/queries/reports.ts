import "server-only";
import { actorOf, authorizeRead } from "../auth";
import { getDb } from "../db";
import { activityPeople, listActivity, type ActivityFilter } from "../domain/activity";
import { cashUp, moneyReport, occupancyReport, type ReportRange } from "../domain/reports";

/** Reports page data. Managers and the owner only; ranges are Lagos dates. */
export async function moneyPageData(range: ReportRange) {
  const staff = await authorizeRead("reports.view");
  const db = await getDb();
  const [money, cash] = await Promise.all([moneyReport(db, actorOf(staff), range), cashUp(db, actorOf(staff))]);
  return { money, cash };
}

export async function occupancyPageData(range: ReportRange) {
  const staff = await authorizeRead("reports.view");
  return occupancyReport(await getDb(), actorOf(staff), range);
}

/** Activity log tab (managers and the owner). */
export async function activityPageData(f: ActivityFilter) {
  const staff = await authorizeRead("activity.view");
  const db = await getDb();
  const [list, people] = await Promise.all([listActivity(db, actorOf(staff), f), activityPeople(db, actorOf(staff))]);
  return { ...list, people };
}
