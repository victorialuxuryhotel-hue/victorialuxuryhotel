import { actorOf, authorizeRead } from "@/server/auth";
import { csvResponse, deniedResponse, naira } from "@/server/csv";
import { getDb } from "@/server/db";
import { EXPENSE_CATEGORIES, EXPENSE_DEPARTMENTS, EXPENSE_METHODS, listExpenses } from "@/server/domain/finance";
import { reportRange } from "@/server/domain/reports";

export async function GET(request: Request) {
  let staff;
  try {
    staff = await authorizeRead(["reports.view", "expenses.manage"]);
  } catch (err) {
    return deniedResponse(err);
  }
  const q = new URL(request.url).searchParams;
  const range = reportRange(q.get("range") ?? undefined);
  const dept = ({ rooms: "rooms", restaurant: "restaurant", bar: "bar", hall: "hall", general: "general" } as const)[q.get("dept") as "rooms"] ?? undefined;
  const { from, to, rows } = await listExpenses(await getDb(), actorOf(staff), range, undefined, { limit: 10_000, department: dept });
  return csvResponse(
    `expenses-${from}-to-${to}.csv`,
    ["Date", "Department", "Category", "Description", "Method", "Reference", "Amount (NGN)", "Recorded by", "Status", "Void reason"],
    [...rows].reverse().map((r) => [
      r.spent_on,
      EXPENSE_DEPARTMENTS[r.department ?? "general"],
      EXPENSE_CATEGORIES[r.category],
      r.description,
      EXPENSE_METHODS[r.method],
      r.reference,
      naira(r.amount_kobo),
      r.recorded_by_name,
      r.voided_at ? "Voided" : "Recorded",
      r.void_reason,
    ]),
  );
}
