import { AppError } from "@/lib/errors";
import { formatNaira } from "@/lib/format";
import { hotelToday } from "@/lib/hotel-date";
import { vatIncluded } from "@/lib/vat";
import { activity, activityIfChanged, all, EXPENSE_RECORDERS, FINANCE, first, requireRole, uuid, writeBatch, type Actor, type Db } from "../db";
import { rangeDates, type ReportRange } from "./reports";

export const EXPENSE_CATEGORIES = {
  supplies: "Supplies", food_drink: "Food & drink", utilities: "Utilities", fuel: "Fuel & generator", maintenance: "Repairs & maintenance",
  salaries: "Salaries", laundry: "Laundry", marketing: "Marketing", tax: "Tax & levies", cooking_gas: "Cooking gas", cleaning: "Cleaning materials", other: "Other",
} as const;
export type ExpenseCategory = keyof typeof EXPENSE_CATEGORIES;
export const EXPENSE_METHODS = { cash: "Cash", bank_transfer: "Bank transfer", pos_terminal: "POS", card: "Card", other: "Other" } as const;
export type ExpenseMethod = keyof typeof EXPENSE_METHODS;
export const EXPENSE_DEPARTMENTS = { general: "Whole hotel", rooms: "Rooms", restaurant: "Restaurant", bar: "Bar", hall: "Conference hall" } as const;
export type ExpenseDepartment = keyof typeof EXPENSE_DEPARTMENTS;

export { vatIncluded };

export async function recordExpense(
  db: Db,
  actor: Actor,
  v: { spentOn: string; category: ExpenseCategory; description: string; amountKobo: number; method: ExpenseMethod; reference: string | null; department?: ExpenseDepartment },
): Promise<string> {
  requireRole(actor, EXPENSE_RECORDERS);
  if (actor.role === "restaurant_bar_manager" && v.department !== "restaurant" && v.department !== "bar") {
    throw new AppError("FORBIDDEN", "Restaurant & bar managers record restaurant or bar expenses only.");
  }
  if (v.spentOn > hotelToday()) throw new AppError("VALIDATION", "The date can't be in the future.");
  const id = uuid();
  await writeBatch(db, actor, [
    db
      .prepare("INSERT INTO expenses (id, spent_on, category, description, amount_kobo, method, reference, recorded_by, department) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, v.spentOn, v.category, v.description.trim(), v.amountKobo, v.method, v.reference?.trim() || null, actor!.id, v.department ?? "general"),
    activity(db, "expense.recorded", "expense", id, `Expense ${formatNaira(v.amountKobo)}: ${v.description.trim()} (${EXPENSE_CATEGORIES[v.category]})`, { spent_on: v.spentOn }),
  ]);
  return id;
}

export async function voidExpense(db: Db, actor: Actor, id: string, reason: string): Promise<void> {
  requireRole(actor, EXPENSE_RECORDERS);
  if (actor.role === "restaurant_bar_manager" && !(await first(db, "SELECT 1 FROM expenses WHERE id = ? AND department IN ('restaurant', 'bar')", id))) {
    throw new AppError("FORBIDDEN", "Restaurant & bar managers can void restaurant or bar expenses only.");
  }
  const why = reason.trim();
  if (why.length < 3) throw new AppError("VALIDATION", "Give a reason.");
  const [r] = await writeBatch(db, actor, [
    db.prepare("UPDATE expenses SET voided_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), voided_by = ?, void_reason = ? WHERE id = ? AND voided_at IS NULL").bind(actor!.id, why, id),
    activityIfChanged(db, "expense.voided", "expense", id, `Expense voided: ${why}`),
  ]);
  if (!r?.meta.changes) throw new AppError("NOT_FOUND", "Expense not found or already voided.");
}

export type ExpenseRow = {
  id: string; spent_on: string; category: ExpenseCategory; description: string; amount_kobo: number; method: ExpenseMethod;
  reference: string | null; recorded_by_name: string | null; voided_at: string | null; void_reason: string | null; department: ExpenseDepartment;
};

export async function listExpenses(db: Db, actor: Actor, range: ReportRange, today = hotelToday(), opts: { limit?: number; department?: ExpenseDepartment } = {}) {
  requireRole(actor, EXPENSE_RECORDERS);
  const rbOnly = actor.role === "restaurant_bar_manager";
  const { from, to } = rangeDates(range, today);
  const rows = await all<ExpenseRow>(
    db,
    `SELECT e.id, e.spent_on, e.category, e.description, e.amount_kobo, e.method, e.reference, s.full_name AS recorded_by_name, e.voided_at, e.void_reason, e.department
     FROM expenses e LEFT JOIN staff_profiles s ON s.id = e.recorded_by
     WHERE e.spent_on BETWEEN ? AND ? AND (? IS NULL OR e.department = ?) ${rbOnly ? "AND e.department IN ('restaurant', 'bar')" : ""} ORDER BY e.spent_on DESC, e.created_at DESC LIMIT ?`,
    from,
    to,
    opts.department ?? null,
    opts.department ?? null,
    Math.min(opts.limit ?? 500, 10_000),
  );
  const live = rows.filter((r) => !r.voided_at);
  const byCategory = new Map<ExpenseCategory, number>();
  for (const r of live) byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + r.amount_kobo);
  return { from, to, rows, totalKobo: live.reduce((s, r) => s + r.amount_kobo, 0), byCategory: [...byCategory.entries()].sort((a, b) => b[1] - a[1]) };
}

export async function financeSummary(db: Db, actor: Actor, range: ReportRange, today = hotelToday()) {
  requireRole(actor, FINANCE);
  const { from, to } = rangeDates(range, today);
  const [rooms, sales, halls, expenses, settings] = await Promise.all([
    first<{ kobo: number }>(
      db,
      `SELECT coalesce(sum(CASE WHEN kind = 'payment' THEN amount_kobo ELSE -amount_kobo END), 0) AS kobo FROM payments
       WHERE status = 'successful' AND date(paid_at, '+1 hour') BETWEEN ? AND ?`,
      from, to,
    ),
    all<{ outlet: "restaurant" | "bar"; kobo: number }>(
      db,
      `SELECT outlet, sum(total_kobo) AS kobo FROM pos_orders WHERE status = 'paid' AND date(paid_at, '+1 hour') BETWEEN ? AND ? GROUP BY outlet`,
      from, to,
    ),
    first<{ kobo: number }>(db, "SELECT coalesce(sum(amount_kobo), 0) AS kobo FROM hall_payments WHERE paid_on BETWEEN ? AND ?", from, to),
    all<{ department: ExpenseDepartment; kobo: number }>(
      db,
      "SELECT department, sum(amount_kobo) AS kobo FROM expenses WHERE voided_at IS NULL AND spent_on BETWEEN ? AND ? GROUP BY department",
      from, to,
    ),
    first<{ vat_rate_bp: number }>(db, "SELECT vat_rate_bp FROM hotel_settings WHERE id = 1"),
  ]);
  const outletKobo = (o: "restaurant" | "bar") => sales.find((x) => x.outlet === o)?.kobo ?? 0;
  const income = { rooms: rooms?.kobo ?? 0, restaurant: outletKobo("restaurant"), bar: outletKobo("bar"), hall: halls?.kobo ?? 0 };
  const incomeTotal = income.rooms + income.restaurant + income.bar + income.hall;
  const spent = (d: ExpenseDepartment) => expenses.find((e) => e.department === d)?.kobo ?? 0;
  const expensesKobo = expenses.reduce((t, e) => t + e.kobo, 0);
  const rate = settings?.vat_rate_bp ?? 750;
  const departments = (
    [
      ["rooms", "rooms", income.rooms],
      ["restaurant", "restaurant", income.restaurant],
      ["bar", "bar", income.bar],
      ["hall", "hall", income.hall],
      ["general", "general", 0],
    ] as const
  ).map(([key, dept, kobo]) => ({ key, label: EXPENSE_DEPARTMENTS[dept], incomeKobo: kobo, expensesKobo: spent(dept), netKobo: kobo - spent(dept), vatKobo: vatIncluded(kobo, rate) }));
  return { from, to, income, incomeTotal, expensesKobo, netKobo: incomeTotal - expensesKobo, vatRateBp: rate, vatKobo: vatIncluded(incomeTotal, rate), departments };
}
