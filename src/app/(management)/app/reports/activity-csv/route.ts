import { deniedResponse, logDownload, tableResponse } from "@/server/csv";
import { actorOf, authorizeRead } from "@/server/auth";
import { getDb } from "@/server/db";
import { activityCategory, activityForCsv } from "@/server/domain/activity";
import { rangeDates, reportRange } from "@/server/domain/reports";
import { hotelToday } from "@/lib/hotel-date";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const lagos = (iso: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", ...opts }).format(new Date(iso));

export async function GET(request: Request) {
  let staff;
  try {
    staff = await authorizeRead("activity.view");
  } catch (err) {
    return deniedResponse(err);
  }
  const q = new URL(request.url).searchParams;
  const range = reportRange(q.get("range") ?? undefined);
  const who = q.get("who");
  const rows = await activityForCsv(await getDb(), actorOf(staff), {
    range,
    category: activityCategory(q.get("cat") ?? undefined),
    actorId: who && UUID.test(who) ? who : null,
    routine: q.get("routine") === "1",
  });
  const { from, to } = rangeDates(range, hotelToday());
  await logDownload(staff, `the activity log, ${from} to ${to}`, { from, to });
  return tableResponse(
    request,
    `activity-${from}-to-${to}`,
    "Activity",
    ["Date", "Time", "Who", "What", "Action"],
    rows.map((r) => [
      lagos(r.created_at, { year: "numeric", month: "2-digit", day: "2-digit" }),
      lagos(r.created_at, { hour: "2-digit", minute: "2-digit", hour12: false }),
      r.actor ?? (r.actor_type === "system" ? "System" : "Staff"),
      r.summary,
      r.action,
    ]),
  );
}
