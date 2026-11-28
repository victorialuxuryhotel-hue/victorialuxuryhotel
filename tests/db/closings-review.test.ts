import { describe, expect, it } from "vitest";
import type { Actor, StaffRole } from "@/server/db";
import { closeDay, closingsReview, notClosed, payOrder, saveMenuItem, setMenuItemStock, verifyClosing, weekStart } from "@/server/domain/pos";
import { addStockItem, recordDelivery, stockMoves } from "@/server/domain/stock";
import { addDays, businessDate, hotelInstant } from "@/lib/hotel-date";
import { db, exec, gm, q1, rejects } from "./helpers";

const rand = () => crypto.randomUUID().slice(0, 6);

async function staff(role: Extract<StaffRole, "restaurant_bar" | "restaurant_bar_manager" | "owner">): Promise<NonNullable<Actor>> {
  const id = crypto.randomUUID();
  await exec(
    "INSERT INTO staff_profiles (id, full_name, email, role, department, department_lead) VALUES (?, ?, ?, 'front_desk', 'restaurant_bar', ?)",
    id, `Staff ${rand()}`, `s-${rand()}@example.com`, role === "restaurant_bar" ? 0 : 1,
  );
  return { id, role };
}

async function drink(mgr: Actor) {
  const stockId = await addStockItem(db, mgr, { name: `Malt ${rand()}`, unit: "bottles", category: "drinks", minQuantity: 2, opening: 50 });
  const itemId = await saveMenuItem(db, mgr, { name: `Malt ${rand()}`, outlet: "bar", category: "soft_drinks", priceKobo: 100_000, available: true, active: true });
  await setMenuItemStock(db, mgr, itemId, [{ stockItemId: stockId, quantity: 1 }]);
  return { stockId, itemId };
}

async function closeWith(att: Actor, itemId: string, countedKobo: number, why: string | null) {
  await payOrder(db, att, { id: crypto.randomUUID(), outlet: "bar", lines: [{ menuItemId: itemId, quantity: 2 }], method: "cash" });
  const r = await closeDay(db, att, { countedCashKobo: countedKobo, explanation: why });
  if (!r.closed) throw new Error("should have closed");
  return r.id;
}

describe("closings review (X11)", () => {
  it("needs a note to check a short or over closing, and nobody checks their own, the owner included", async () => {
    const mgr = await staff("restaurant_bar_manager");
    const other = await staff("restaurant_bar_manager");
    const boss = await staff("owner");
    const { itemId } = await drink(mgr);

    const short = await closeWith(await staff("restaurant_bar"), itemId, 150_000, "Gave wrong change");
    await rejects(verifyClosing(db, mgr, short, null), /short\. Add a note/);
    await rejects(verifyClosing(db, mgr, short, "  "), /Add a note/);
    await verifyClosing(db, mgr, short, "Counted again, ₦500 short");
    expect(await q1("SELECT verified_by AS v, verify_note AS n FROM pos_closings WHERE id = ?", short)).toEqual({ v: mgr.id, n: "Counted again, ₦500 short" });

    const over = await closeWith(await staff("restaurant_bar"), itemId, 220_000, "Tip left in drawer");
    await rejects(verifyClosing(db, mgr, over, null), /over\. Add a note/);

    const exact = await closeWith(await staff("restaurant_bar"), itemId, 200_000, null);
    await verifyClosing(db, mgr, exact, null);

    const own = await closeWith(mgr, itemId, 200_000, null);
    await rejects(verifyClosing(db, mgr, own, null), /Another manager must check your own closing/);
    await verifyClosing(db, other, own, null);

    const owners = await closeWith(boss, itemId, 200_000, null);
    await rejects(verifyClosing(db, boss, owners, null), /Another manager must check your own closing/);
    await verifyClosing(db, mgr, owners, null);
  });

  it("lists staff who sold and didn't close by 10:00 the next day, and works out this week's short and over", async () => {
    const mgr = await staff("restaurant_bar_manager");
    const late = await staff("restaurant_bar");
    const { itemId } = await drink(mgr);
    await payOrder(db, late, { id: crypto.randomUUID(), outlet: "bar", lines: [{ menuItemId: itemId, quantity: 1 }], method: "cash" });
    const today = businessDate();
    const before = new Date(Date.parse(hotelInstant(addDays(today, 1), "09:59:00")));
    const after = new Date(Date.parse(hotelInstant(addDays(today, 1), "10:00:00")));
    expect((await notClosed(db, gm, today, before)).some((n) => n.staff_id === late.id)).toBe(false);
    expect((await notClosed(db, gm, today, after)).find((n) => n.staff_id === late.id)).toMatchObject({ sales: 1, kobo: 100_000 });
    await closeDay(db, late, { countedCashKobo: 100_000, explanation: null });
    expect((await notClosed(db, gm, today, after)).some((n) => n.staff_id === late.id)).toBe(false);

    const before2 = await closingsReview(db, gm);
    await closeWith(await staff("restaurant_bar"), itemId, 150_000, "Short by 500");
    await closeWith(await staff("restaurant_bar"), itemId, 230_000, "Over by 300");
    const r = await closingsReview(db, gm);
    expect(r.short).toEqual({ kobo: before2.short.kobo - 50_000, n: before2.short.n + 1 });
    expect(r.over).toEqual({ kobo: before2.over.kobo + 30_000, n: before2.over.n + 1 });
    expect(r.toCheck).toBe(before2.toCheck + 2);
    expect(r.rows[0]).toMatchObject({ outlets: "bar" });
    expect(weekStart("2026-11-28")).toBe("2026-11-23");
    expect(weekStart("2026-11-23")).toBe("2026-11-23");
    await rejects(closingsReview(db, await staff("restaurant_bar")), /role can't do this/);
  });
});

describe("record a delivery (X12)", () => {
  it("adds a received move with the supplier and cost; only managers can", async () => {
    const mgr = await staff("restaurant_bar_manager");
    const id = await addStockItem(db, mgr, { name: `Star ${rand()}`, unit: "bottles", category: "drinks", minQuantity: 5, opening: 12 });
    await recordDelivery(db, mgr, { itemId: id, quantity: 24, supplier: "Nigerian Breweries", costKobo: 1_440_000, note: "Invoice NB-2231" });
    expect((await q1<{ quantity: number }>("SELECT quantity FROM stock_items WHERE id = ?", id)).quantity).toBe(36);
    const [m] = await stockMoves(db, gm, { itemId: id, kind: "received" });
    expect(m).toMatchObject({ change: 24, supplier: "Nigerian Breweries", cost_kobo: 1_440_000, note: "Invoice NB-2231", who: expect.any(String) });
    await recordDelivery(db, mgr, { itemId: id, quantity: 6, supplier: "Market", costKobo: null, note: null });
    expect((await stockMoves(db, gm, { itemId: id, kind: "received" }))[0]).toMatchObject({ change: 6, cost_kobo: null });
    await rejects(recordDelivery(db, mgr, { itemId: id, quantity: 0, supplier: "Market", costKobo: null, note: null }), /how many came in/);
    await rejects(recordDelivery(db, mgr, { itemId: id, quantity: 2, supplier: " ", costKobo: null, note: null }), /who supplied it/);
    await rejects(recordDelivery(db, await staff("restaurant_bar"), { itemId: id, quantity: 2, supplier: "Market", costKobo: null, note: null }), /role can't do this/);
    await rejects(recordDelivery(db, gm, { itemId: id, quantity: 2, supplier: "Market", costKobo: null, note: null }), /role can't do this/);
  });
});
