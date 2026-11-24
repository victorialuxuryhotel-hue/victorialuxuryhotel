import { actorOf, authorizeRead } from "@/server/auth";
import { csvResponse, deniedResponse, naira, logDownload } from "@/server/csv";
import { getDb } from "@/server/db";
import { MENU_CATEGORIES, OUTLETS, type Outlet } from "@/server/domain/pos";
import { posReport } from "@/server/domain/pos-reports";
import { reportRange } from "@/server/domain/reports";

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
  await logDownload(staff, `restaurant & bar sales by item, ${r.from} to ${r.to}`, { from: r.from, to: r.to, outlet });
  return csvResponse(
    `restaurant-bar-items-${r.from}-to-${r.to}.csv`,
    ["Item", "Counter", "Quantity sold", "Sales (NGN)"],
    [
      ...r.byItem.map((i) => [i.name, OUTLETS[i.outlet], i.qty, naira(i.kobo)]),
      [],
      ["Category", "", "Quantity sold", "Sales (NGN)"],
      ...r.byCategory.map((c) => [MENU_CATEGORIES[c.category] ?? c.category, "", c.qty, naira(c.kobo)]),
    ],
  );
}
