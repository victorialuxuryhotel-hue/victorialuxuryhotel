import { actorOf, authorizeRead } from "@/server/auth";
import { tableResponse, deniedResponse, lagosDate, lagosTime, naira, logDownload } from "@/server/csv";
import { getDb } from "@/server/db";
import { listOrders, ORDER_STATUS, OUTLETS, PAY_METHODS } from "@/server/domain/pos";
import { orderFilters } from "@/server/pos-filters";

export async function GET(request: Request) {
  let staff;
  try {
    staff = await authorizeRead("pos.view");
  } catch (err) {
    return deniedResponse(err);
  }
  const f = orderFilters(new URL(request.url).searchParams);
  const rows = await listOrders(await getDb(), actorOf(staff), f, 20_000);
  await logDownload(staff, `restaurant & bar orders, ${f.from} to ${f.to}`, { ...f });
  return tableResponse(
    request,
    `restaurant-bar-orders-${f.from}-to-${f.to}`,
    "Orders",
    ["Date", "Time", "Order", "Receipt", "Counter", "Status", "Items", "Paid by", "Amount (NGN)", "Attendant", "Table or customer"],
    [...rows].reverse().map((o) => [
      lagosDate(o.paid_at ?? o.created_at),
      lagosTime(o.paid_at ?? o.created_at),
      o.number,
      o.receipt_number,
      OUTLETS[o.outlet],
      ORDER_STATUS[o.status],
      o.items,
      o.method ? PAY_METHODS[o.method] : null,
      naira(o.total_kobo),
      o.taken_by ?? o.created_by_name,
      o.note,
    ]),
  );
}
