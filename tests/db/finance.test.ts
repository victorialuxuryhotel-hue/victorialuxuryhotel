import { describe, expect, it } from "vitest";
import type { Actor } from "@/server/db";
import { financeSummary, listExpenses, recordExpense, voidExpense } from "@/server/domain/finance";
import { incomeReport } from "@/server/domain/reports";
import { day, db, desk, exec, gm, owner, rejects } from "./helpers";

describe("finance", () => {
  it("records expenses, voids with a reason (never edits), and counts only live ones", async () => {
    const fin: Actor = { id: owner!.id, role: "finance" };
    const before = (await listExpenses(db, gm, "today")).totalKobo;
    const id = await recordExpense(db, fin, { spentOn: day(0), category: "fuel", description: "Diesel", amountKobo: 4_500_000, method: "cash", reference: null });
    expect((await listExpenses(db, gm, "today")).totalKobo).toBe(before + 4_500_000);
    await rejects(exec("UPDATE expenses SET amount_kobo = 1 WHERE id = ?", id), /expense_immutable/);
    await rejects(exec("DELETE FROM expenses WHERE id = ?", id), /expense_immutable/);
    await voidExpense(db, fin, id, "Entered twice");
    expect((await listExpenses(db, gm, "today")).totalKobo).toBe(before);
    await rejects(voidExpense(db, fin, id, "Again"), /already voided/);
    await rejects(recordExpense(db, desk, { spentOn: day(0), category: "other", description: "Nope", amountKobo: 100, method: "cash", reference: null }), /role does not allow/);
    await rejects(recordExpense(db, gm, { spentOn: day(1), category: "other", description: "Future", amountKobo: 100, method: "cash", reference: null }), /future/);
  });

  it("finance can read the money report; the summary shows VAT inside income", async () => {
    const fin: Actor = { id: owner!.id, role: "finance" };
    await incomeReport(db, fin, "today");
    const s = await financeSummary(db, fin, "month");
    expect(s.vatRateBp).toBe(750);
    expect(s.vatKobo).toBe(Math.round((s.incomeTotal * 750) / 10_750));
    expect(s.netKobo).toBe(s.incomeTotal - s.expensesKobo);
    await rejects(financeSummary(db, desk, "month"), /role does not allow/);
  });

  it("each department has its own income, expenses and result; whole-hotel costs stay separate", async () => {
    const before = await financeSummary(db, gm, "today");
    const dept = (sum: typeof before, key: string) => sum.departments.find((d) => d.key === key)!;
    await recordExpense(db, gm, { spentOn: day(0), category: "food_drink", description: "Drinks restock", amountKobo: 900_000, method: "cash", reference: null, department: "restaurant_bar" });
    await recordExpense(db, gm, { spentOn: day(0), category: "fuel", description: "Diesel", amountKobo: 1_200_000, method: "cash", reference: null });
    const after = await financeSummary(db, gm, "today");
    expect(dept(after, "restaurantBar").expensesKobo - dept(before, "restaurantBar").expensesKobo).toBe(900_000);
    expect(dept(after, "general").expensesKobo - dept(before, "general").expensesKobo).toBe(1_200_000);
    expect(dept(after, "rooms").expensesKobo).toBe(dept(before, "rooms").expensesKobo);
    expect(after.expensesKobo - before.expensesKobo).toBe(2_100_000);
    expect(after.departments.reduce((t, d) => t + d.netKobo, 0)).toBe(after.netKobo);
    for (const d of after.departments) expect(d.netKobo).toBe(d.incomeKobo - d.expensesKobo);

    const bar = await listExpenses(db, gm, "today", undefined, { department: "restaurant_bar" });
    expect(bar.rows.every((r) => r.department === "restaurant_bar")).toBe(true);
    expect(bar.rows.some((r) => r.description === "Drinks restock")).toBe(true);

    const all = await incomeReport(db, gm, "today");
    const rooms = await incomeReport(db, gm, "today", undefined, "rooms");
    expect(rooms.rows.every((r) => r.department === "rooms")).toBe(true);
    expect(rooms.total).toBe(all.rows.filter((r) => r.department === "rooms").reduce((t, r) => t + r.kobo, 0));
    await rejects(exec("UPDATE expenses SET department = 'bar' WHERE description = 'Diesel'"), /expense_immutable|CHECK/);
  });
});
