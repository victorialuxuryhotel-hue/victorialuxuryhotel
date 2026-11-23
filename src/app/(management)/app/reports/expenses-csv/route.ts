import { actorOf, authorizeRead } from "@/server/auth";
import { csvResponse, deniedResponse, naira } from "@/server/csv";
import { getDb } from "@/server/db";
import { EXPENSE_CATEGORIES, EXPENSE_METHODS, listExpenses } from "@/server/domain/finance";
import { reportRange } from "@/server/domain/reports";

export async function GET(request: Request) {
  let staff;
  try {
    staff = await authorizeRead(["reports.view", "expenses.manage"]);
  } catch (err) {
    return deniedResponse(err);
  }
  const range = reportRange(new URL(request.url).searchParams.get("range") ?? undefined);
  const { from, to, rows } = await listExpenses(await getDb(), actorOf(staff), range, undefined, { limit: 10_000 });
  return csvResponse(
    `expenses-${from}-to-${to}.csv`,
    ["Date", "Category", "Description", "Method", "Reference", "Amount (NGN)", "Recorded by", "Status", "Void reason"],
    [...rows].reverse().map((r) => [
      r.spent_on,
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
