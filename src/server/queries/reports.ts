import "server-only";
import { actorOf, authorizeRead } from "../auth";
import { getDb } from "../db";
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
