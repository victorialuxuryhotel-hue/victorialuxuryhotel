import { actorOf, authorizeRead } from "@/server/auth";
import { csvResponse, deniedResponse, lagosDate, lagosTime, logDownload } from "@/server/csv";
import { getDb } from "@/server/db";
import { rangeDates, reportRange } from "@/server/domain/reports";
import { MOVE_KINDS, stockMoves } from "@/server/domain/stock";
import { businessDate } from "@/lib/hotel-date";

export async function GET(request: Request) {
  let staff;
  try {
    staff = await authorizeRead(["inventory.view", "inventory.manage"]);
  } catch (err) {
    return deniedResponse(err);
  }
  const { from, to } = rangeDates(reportRange(new URL(request.url).searchParams.get("range") ?? undefined), businessDate());
  const rows = await stockMoves(await getDb(), actorOf(staff), { from, to, limit: 5000 });
  await logDownload(staff, `stock movements, ${from} to ${to}`, { from, to });
  return csvResponse(
    `stock-movements-${from}-to-${to}.csv`,
    ["Date", "Time", "Item", "What happened", "Change", "Unit", "Order", "Note", "By"],
    [...rows].reverse().map((m) => [lagosDate(m.created_at), lagosTime(m.created_at), m.item, MOVE_KINDS[m.kind], m.change, m.unit, m.order_number, m.note, m.who]),
  );
}
