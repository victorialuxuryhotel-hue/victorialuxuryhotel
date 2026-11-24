import { logDownload } from "@/server/csv";
import { actorOf, authorizeRead } from "@/server/auth";
import { getDb } from "@/server/db";
import { activityCategory, activityForCsv } from "@/server/domain/activity";
import { csvField, rangeDates, reportRange } from "@/server/domain/reports";
import { hotelToday } from "@/lib/hotel-date";
import { toActionError } from "@/lib/errors";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const lagos = (iso: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", ...opts }).format(new Date(iso));

export async function GET(request: Request) {
  let staff;
  try {
    staff = await authorizeRead("activity.view");
  } catch (err) {
    const e = toActionError(err);
    return new Response(e.message, { status: e.code === "UNAUTHENTICATED" ? 401 : 403 });
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
  const header = ["Date", "Time", "Who", "What", "Action"];
  const lines = rows.map((r) =>
    [
      csvField(lagos(r.created_at, { year: "numeric", month: "2-digit", day: "2-digit" })),
      csvField(lagos(r.created_at, { hour: "2-digit", minute: "2-digit", hour12: false })),
      csvField(r.actor ?? (r.actor_type === "system" ? "System" : "Staff")),
      csvField(r.summary),
      csvField(r.action),
    ].join(","),
  );
  await logDownload(staff, `the activity log, ${from} to ${to}`, { from, to });
  return new Response([header.map(csvField).join(","), ...lines].join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="activity-${from}-to-${to}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
