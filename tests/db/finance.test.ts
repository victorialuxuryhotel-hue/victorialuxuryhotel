import { describe, expect, it } from "vitest";
import type { Actor } from "@/server/db";
import { financeSummary, listExpenses, recordExpense, voidExpense } from "@/server/domain/finance";
import { moneyReport } from "@/server/domain/reports";
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
    await moneyReport(db, fin, "today");
    const s = await financeSummary(db, fin, "month");
    expect(s.vatRateBp).toBe(750);
    expect(s.vatKobo).toBe(Math.round((s.incomeTotal * 750) / 10_750));
    expect(s.netKobo).toBe(s.incomeTotal - s.expensesKobo);
    await rejects(financeSummary(db, desk, "month"), /role does not allow/);
  });
});
