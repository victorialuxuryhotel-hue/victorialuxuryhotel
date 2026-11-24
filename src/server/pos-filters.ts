import "server-only";
import { hotelToday, isIsoDate } from "@/lib/hotel-date";
import { recordId } from "@/lib/ids";
import { ORDER_STATUS, OUTLETS, PAY_METHODS, type OrderFilter, type OrderStatus, type Outlet, type PayMethod } from "./domain/pos";

type SP = Record<string, string | string[] | undefined> | URLSearchParams;
const read = (sp: SP, k: string) => {
  const v = sp instanceof URLSearchParams ? sp.get(k) : sp[k];
  return typeof v === "string" ? v : "";
};

export function orderFilters(sp: SP): OrderFilter {
  const today = hotelToday();
  const from = isIsoDate(read(sp, "from")) && read(sp, "from") <= today ? read(sp, "from") : today;
  const to = isIsoDate(read(sp, "to")) && read(sp, "to") >= from && read(sp, "to") <= today ? read(sp, "to") : from;
  return {
    from,
    to,
    method: read(sp, "method") in PAY_METHODS ? (read(sp, "method") as PayMethod) : undefined,
    status: read(sp, "status") in ORDER_STATUS ? (read(sp, "status") as OrderStatus) : undefined,
    outlet: read(sp, "outlet") in OUTLETS ? (read(sp, "outlet") as Outlet) : undefined,
    staffId: recordId().safeParse(read(sp, "staff")).success ? read(sp, "staff") : undefined,
    q: read(sp, "q").slice(0, 60) || undefined,
  };
}
