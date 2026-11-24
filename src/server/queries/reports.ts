import "server-only";
import { actorOf, authorizeRead } from "../auth";
import { getDb } from "../db";
import { activityPeople, listActivity, type ActivityFilter } from "../domain/activity";
import { financeSummary } from "../domain/finance";
import { incomeReport, occupancyReport, type Department, type ReportRange } from "../domain/reports";

export async function moneyPageData(range: ReportRange, department: Department | null = null) {
  const staff = await authorizeRead(["reports.view", "reports.hotel"]);
  const db = await getDb();
  const [income, finance] = await Promise.all([incomeReport(db, actorOf(staff), range, undefined, department), financeSummary(db, actorOf(staff), range)]);
  return { income, finance };
}

export async function occupancyPageData(range: ReportRange) {
  const staff = await authorizeRead(["reports.view", "reports.hotel"]);
  return occupancyReport(await getDb(), actorOf(staff), range);
}

export async function activityPageData(f: ActivityFilter) {
  const staff = await authorizeRead("activity.view");
  const db = await getDb();
  const [list, people] = await Promise.all([listActivity(db, actorOf(staff), f), activityPeople(db, actorOf(staff))]);
  return { ...list, people };
}
