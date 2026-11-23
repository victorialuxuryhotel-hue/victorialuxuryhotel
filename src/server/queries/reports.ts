import "server-only";
import { actorOf, authorizeRead } from "../auth";
import { getDb } from "../db";
import { activityPeople, listActivity, type ActivityFilter } from "../domain/activity";
import { financeSummary } from "../domain/finance";
import { cashUp, moneyReport, occupancyReport, type ReportRange } from "../domain/reports";

export async function moneyPageData(range: ReportRange) {
  const staff = await authorizeRead("reports.view");
  const db = await getDb();
  const [money, cash, finance] = await Promise.all([moneyReport(db, actorOf(staff), range), cashUp(db, actorOf(staff)), financeSummary(db, actorOf(staff), range)]);
  return { money, cash, finance };
}

export async function occupancyPageData(range: ReportRange) {
  const staff = await authorizeRead("reports.view");
  return occupancyReport(await getDb(), actorOf(staff), range);
}

export async function activityPageData(f: ActivityFilter) {
  const staff = await authorizeRead("activity.view");
  const db = await getDb();
  const [list, people] = await Promise.all([listActivity(db, actorOf(staff), f), activityPeople(db, actorOf(staff))]);
  return { ...list, people };
}
