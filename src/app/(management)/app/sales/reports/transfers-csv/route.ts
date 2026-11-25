import { actorOf, authorizeRead } from "@/server/auth";
import { tableResponse, deniedResponse, naira, logDownload } from "@/server/csv";
import { getDb } from "@/server/db";
import { OUTLETS, type Outlet } from "@/server/domain/pos";
import { posReport } from "@/server/domain/pos-reports";
import { reportRange } from "@/server/domain/reports";

/** Transfer sales by salesperson, to check against the bank statement. */
export async function GET(request: Request) {
  let staff;
  try {
    staff = await authorizeRead("pos.view");
  } catch (err) {
    return deniedResponse(err);
  }
  const q = new URL(request.url).searchParams;
  const outlet = q.get("outlet") === "restaurant" || q.get("outlet") === "bar" ? (q.get("outlet") as Outlet) : null;
  const r = await posReport(await getDb(), actorOf(staff), reportRange(q.get("range") ?? undefined), outlet);
  await logDownload(staff, `restaurant & bar transfers, ${r.from} to ${r.to}`, { from: r.from, to: r.to, outlet });
  return tableResponse(
    request,
    `restaurant-bar-transfers-${r.from}-to-${r.to}`,
    "Transfers",
    ["Sold by", "Paid at", "Receipt", "Counter", "Amount (NGN)", "Reference", "Seen on statement"],
    r.transfers.map((t) => [t.who, t.paid_at, t.receipt_number, OUTLETS[t.outlet], naira(t.kobo), t.reference ?? "", ""]),
  );
}
