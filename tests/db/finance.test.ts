import { describe, expect, it } from "vitest";
import type { Actor } from "@/server/db";
import { financeSummary } from "@/server/domain/finance";
import { incomeReport } from "@/server/domain/reports";
import { db, desk, gm, owner, rejects } from "./helpers";

describe("finance", () => {
  it("finance reads sales and payments for every department, with the VAT inside them; nothing about expenses", async () => {
    const fin: Actor = { id: owner!.id, role: "finance" };
    await incomeReport(db, fin, "today");
    const s = await financeSummary(db, fin, "month");
    expect(s.vatRateBp).toBe(750);
    expect(s.vatKobo).toBe(Math.round((s.incomeTotal * 750) / 10_750));
    expect(s.departments.map((d) => d.key)).toEqual(["rooms", "restaurant", "bar", "hall"]);
    expect(s.departments.reduce((t, d) => t + d.incomeKobo, 0)).toBe(s.incomeTotal);
    expect(s).not.toHaveProperty("expensesKobo");
    await rejects(financeSummary(db, desk, "month"), /role can't do this/);
  });

  it("only rooms money counts as rooms, and so on", async () => {
    const all = await incomeReport(db, gm, "today");
    const rooms = await incomeReport(db, gm, "today", undefined, "rooms");
    expect(rooms.rows.every((r) => r.department === "rooms")).toBe(true);
    expect(rooms.total).toBe(all.rows.filter((r) => r.department === "rooms").reduce((t, r) => t + r.kobo, 0));
  });
});
