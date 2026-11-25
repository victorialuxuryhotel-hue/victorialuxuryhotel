import { describe, expect, it } from "vitest";
import type { Actor, StaffRole } from "@/server/db";
import { financeSummary } from "@/server/domain/finance";
import {
  cancelOrder,
  closeDay,
  closingSummary,
  getOrder,
  listMenu,
  listOrders,
  payOrder,
  saveMenuItem,
  saveOrder,
  topSellers,
  setMenuItemStock,
  verifyClosing,
  voidOrder,
} from "@/server/domain/pos";
import { posReport } from "@/server/domain/pos-reports";
import { incomeRows } from "@/server/domain/reports";
import { addStockItem, recordMove } from "@/server/domain/stock";
import { businessDate, hotelToday } from "@/lib/hotel-date";
import { db, exec, gm, owner, q, q1, rejects } from "./helpers";

const rand = () => crypto.randomUUID().slice(0, 6);

async function staff(role: Extract<StaffRole, "restaurant_bar" | "restaurant_bar_manager" | "finance">): Promise<NonNullable<Actor>> {
  const id = crypto.randomUUID();
  await exec(
    "INSERT INTO staff_profiles (id, full_name, email, role, department, department_lead) VALUES (?, ?, ?, 'front_desk', ?, ?)",
    id, `Staff ${rand()}`, `s-${rand()}@example.com`, role === "finance" ? "finance" : "restaurant_bar", role === "restaurant_bar_manager" ? 1 : 0,
  );
  return { id, role };
}

async function drink(mgr: Actor, onHand = 10) {
  const stockId = await addStockItem(db, mgr, { name: `Malt ${rand()}`, unit: "bottles", category: "drinks", minQuantity: 2, opening: onHand });
  const itemId = await saveMenuItem(db, mgr, { name: `Malt ${rand()}`, outlet: "bar", category: "soft_drinks", priceKobo: 100_000, available: true, active: true });
  await setMenuItemStock(db, mgr, itemId, [{ stockItemId: stockId, quantity: 1 }]);
  return { stockId, itemId };
}
const onHand = async (id: string) => (await q1<{ quantity: number }>("SELECT quantity FROM stock_items WHERE id = ?", id)).quantity;

describe("restaurant & bar menu", () => {
  it("managers keep the menu; attendants and the general manager can't; unavailable items can't be sold", async () => {
    const mgr = await staff("restaurant_bar_manager");
    const att = await staff("restaurant_bar");
    await rejects(saveMenuItem(db, att, { name: "Nope", outlet: "bar", category: "other", priceKobo: 100, available: true, active: true }), /role can't do this/);
    await rejects(saveMenuItem(db, gm, { name: "Nope", outlet: "bar", category: "other", priceKobo: 100, available: true, active: true }), /role can't do this/);
    const id = await saveMenuItem(db, mgr, { name: `Suya ${rand()}`, outlet: "restaurant", category: "snacks", priceKobo: 250_000, available: false, active: true });
    expect((await listMenu(db, att)).find((m) => m.id === id)).toMatchObject({ category: "snacks", is_available: 0 });
    await rejects(payOrder(db, att, { id: crypto.randomUUID(), outlet: "restaurant", lines: [{ menuItemId: id, quantity: 1 }], method: "cash" }), /unavailable today/);
    await rejects(payOrder(db, att, { id: crypto.randomUUID(), outlet: "bar", lines: [{ menuItemId: id, quantity: 1 }], method: "cash" }), /unavailable today|on the restaurant menu/);
  });
});

describe("selling", () => {
  it("a paid sale gets a receipt number, records who took it, works out change and takes linked stock", async () => {
    const mgr = await staff("restaurant_bar_manager");
    const att = await staff("restaurant_bar");
    const { stockId, itemId } = await drink(mgr, 10);
    const sale = await payOrder(db, att, { id: crypto.randomUUID(), outlet: "bar", lines: [{ menuItemId: itemId, quantity: 2 }, { menuItemId: itemId, quantity: 1 }], method: "cash", cashReceivedKobo: 500_000 });
    expect(sale.totalKobo).toBe(300_000);
    expect(sale.changeKobo).toBe(200_000);
    expect(sale.receiptNumber).toMatch(/^RB-\d{4}-\d{6}$/);
    expect(await onHand(stockId)).toBe(7);
    const o = (await getOrder(db, att, sale.id))!;
    expect(o).toMatchObject({ status: "paid", method: "cash", total_kobo: 300_000, cash_received_kobo: 500_000 });
    expect(o.lines).toEqual([expect.objectContaining({ quantity: 3, unit_price_kobo: 100_000 })]);
    const next = await payOrder(db, att, { id: crypto.randomUUID(), outlet: "bar", lines: [{ menuItemId: itemId, quantity: 1 }], method: "pos_terminal", paymentReference: "4821" });
    expect(Number(next.receiptNumber.slice(-6))).toBe(Number(sale.receiptNumber.slice(-6)) + 1);
    await rejects(payOrder(db, att, { id: crypto.randomUUID(), outlet: "bar", lines: [{ menuItemId: itemId, quantity: 1 }], method: "cash", cashReceivedKobo: 50_000 }), /at least/);
  });

  it("won't sell more than is in stock, and says which item", async () => {
    const mgr = await staff("restaurant_bar_manager");
    const att = await staff("restaurant_bar");
    const { stockId, itemId } = await drink(mgr, 2);
    await rejects(payOrder(db, att, { id: crypto.randomUUID(), outlet: "bar", lines: [{ menuItemId: itemId, quantity: 3 }], method: "cash" }), /Not enough Malt .* 2 bottles left, 3 needed/);
    expect(await onHand(stockId)).toBe(2);
    const sold = (await listMenu(db, att)).find((m) => m.id === itemId)!;
    expect(sold.stock_left).toBe(2);
  });

  it("an unpaid order isn't a sale and takes no stock until paid; it can be changed, paid once, or cancelled", async () => {
    const mgr = await staff("restaurant_bar_manager");
    const att = await staff("restaurant_bar");
    const { stockId, itemId } = await drink(mgr, 10);
    const before = await posReport(db, mgr, "today", "bar");
    const order = await saveOrder(db, att, { id: crypto.randomUUID(), outlet: "bar", lines: [{ menuItemId: itemId, quantity: 1 }], note: "Table 4" });
    await saveOrder(db, att, { id: order.id, outlet: "bar", lines: [{ menuItemId: itemId, quantity: 4 }], note: "Table 4" });
    expect(await onHand(stockId)).toBe(10);
    expect((await posReport(db, mgr, "today", "bar")).salesKobo).toBe(before.salesKobo);

    const results = await Promise.all([1, 2, 3].map(() => payOrder(db, att, { id: order.id, method: "bank_transfer", paymentReference: "4821", transferChecked: true })));
    expect(new Set(results.map((r) => r.receiptNumber)).size).toBe(1);
    expect(results.filter((r) => !r.alreadyPaid)).toHaveLength(1);
    expect(await onHand(stockId)).toBe(6);
    expect((await posReport(db, mgr, "today", "bar")).salesKobo - before.salesKobo).toBe(400_000);
    await rejects(saveOrder(db, att, { id: order.id, outlet: "bar", lines: [{ menuItemId: itemId, quantity: 1 }] }), /already paid/);
    await rejects(cancelOrder(db, att, order.id, "Changed mind"), /Only unpaid/);

    const dropped = await saveOrder(db, att, { id: crypto.randomUUID(), outlet: "bar", lines: [{ menuItemId: itemId, quantity: 1 }] });
    await rejects(cancelOrder(db, att, dropped.id, null), /Say why the order is cancelled/);
    await rejects(cancelOrder(db, att, dropped.id, "  "), /Say why the order is cancelled/);
    await cancelOrder(db, att, dropped.id, "Customer left");
    expect((await getOrder(db, mgr, dropped.id))!.status).toBe("cancelled");
    const listed = (await posReport(db, mgr, "today", "bar")).cancelled.find((c) => c.number === dropped.number);
    expect(listed).toMatchObject({ reason: "Customer left", kobo: 100_000 });
    await rejects(payOrder(db, att, { id: dropped.id, method: "cash" }), /cancelled/);
  });

  it("paid sales can't be edited or deleted; only a manager voids, with a reason, and stock comes back", async () => {
    const mgr = await staff("restaurant_bar_manager");
    const att = await staff("restaurant_bar");
    const { stockId, itemId } = await drink(mgr, 5);
    const sale = await payOrder(db, att, { id: crypto.randomUUID(), outlet: "bar", lines: [{ menuItemId: itemId, quantity: 2 }], method: "cash" });
    await rejects(exec("UPDATE pos_orders SET total_kobo = 1 WHERE id = ?", sale.id), /order_immutable/);
    await rejects(exec("DELETE FROM pos_orders WHERE id = ?", sale.id), /order_immutable/);
    await rejects(exec("UPDATE pos_order_items SET quantity = 1 WHERE order_id = ?", sale.id), /order_immutable/);
    await rejects(voidOrder(db, att, sale.id, "Mistake"), /role can't do this/);
    await rejects(voidOrder(db, mgr, sale.id, "x"), /Give a reason/);
    await voidOrder(db, mgr, sale.id, "Rang up twice");
    expect(await onHand(stockId)).toBe(5);
    expect(await getOrder(db, mgr, sale.id)).toMatchObject({ status: "void", close_reason: "Rang up twice", receipt_number: sale.receiptNumber });
    await rejects(voidOrder(db, mgr, sale.id, "Again"), /Only paid/);
    expect((await q("SELECT 1 FROM stock_moves WHERE order_id = ? AND kind = 'returned'", sale.id)).length).toBe(1);
  });

  it("attendants see only their own sales; viewers see everyone's", async () => {
    const mgr = await staff("restaurant_bar_manager");
    const a1 = await staff("restaurant_bar");
    const a2 = await staff("restaurant_bar");
    const { itemId } = await drink(mgr, 10);
    const s1 = await payOrder(db, a1, { id: crypto.randomUUID(), outlet: "bar", lines: [{ menuItemId: itemId, quantity: 1 }], method: "cash" });
    const s2 = await payOrder(db, a2, { id: crypto.randomUUID(), outlet: "bar", lines: [{ menuItemId: itemId, quantity: 1 }], method: "cash" });
    const today = businessDate();
    const mine = await listOrders(db, a1, { from: today, to: today });
    expect(mine.some((o) => o.id === s1.id)).toBe(true);
    expect(mine.some((o) => o.id === s2.id)).toBe(false);
    expect(await getOrder(db, a1, s2.id)).toBeNull();
    const all = await listOrders(db, mgr, { from: today, to: today, q: s2.receiptNumber });
    expect(all.map((o) => o.id)).toEqual([s2.id]);
  });
});

describe("daily closing", () => {
  it("counts cash against cash sales, needs a reason for a difference, blocks open orders and selling after, and a manager signs off", async () => {
    const mgr = await staff("restaurant_bar_manager");
    const att = await staff("restaurant_bar");
    const { itemId } = await drink(mgr, 20);
    await payOrder(db, att, { id: crypto.randomUUID(), outlet: "bar", lines: [{ menuItemId: itemId, quantity: 3 }], method: "cash" });
    await payOrder(db, att, { id: crypto.randomUUID(), outlet: "bar", lines: [{ menuItemId: itemId, quantity: 2 }], method: "pos_terminal", paymentReference: "4821" });
    const open = await saveOrder(db, att, { id: crypto.randomUUID(), outlet: "bar", lines: [{ menuItemId: itemId, quantity: 1 }] });
    await rejects(closeDay(db, att, { countedCashKobo: 300_000, explanation: null }), /still unpaid/);
    await cancelOrder(db, att, open.id, "Customer walked out");

    const s = await closingSummary(db, att, att.id);
    expect(s).toMatchObject({ sales: 2, salesKobo: 500_000, byMethod: { cash: 300_000, bank_transfer: 0, pos_terminal: 200_000 }, openOrders: 0 });
    // Blind count: the first count is recorded and shown against the expected cash; it's final.
    expect(await closeDay(db, att, { countedCashKobo: 250_000, explanation: null })).toEqual({ closed: false, expectedKobo: 300_000, countedKobo: 250_000 });
    expect(await closeDay(db, att, { countedCashKobo: 300_000, explanation: null })).toEqual({ closed: false, expectedKobo: 300_000, countedKobo: 250_000 });
    const closed = await closeDay(db, att, { countedCashKobo: 300_000, explanation: "Gave wrong change" });
    if (!closed.closed) throw new Error("should have closed");
    const id = closed.id;
    await rejects(closeDay(db, att, { countedCashKobo: 300_000, explanation: null }), /already closed/);
    await rejects(payOrder(db, att, { id: crypto.randomUUID(), outlet: "bar", lines: [{ menuItemId: itemId, quantity: 1 }], method: "cash" }), /already closed today/);

    await rejects(verifyClosing(db, att, id, null), /role can't do this/);
    await verifyClosing(db, mgr, id, "Checked the till");
    await rejects(verifyClosing(db, mgr, id, null), /already signed off/);
    await rejects(exec("UPDATE pos_closings SET counted_cash_kobo = 300000 WHERE id = ?", id), /closing_immutable/);
    expect(await q1("SELECT expected_cash_kobo AS e, counted_cash_kobo AS c FROM pos_closings WHERE id = ?", id)).toEqual({ e: 300_000, c: 250_000 });

    const mgrSale = await payOrder(db, mgr, { id: crypto.randomUUID(), outlet: "bar", lines: [{ menuItemId: itemId, quantity: 1 }], method: "cash" });
    const own = await closeDay(db, mgr, { countedCashKobo: mgrSale.totalKobo, explanation: null });
    if (!own.closed) throw new Error("a matching count closes at once");
    await rejects(verifyClosing(db, mgr, own.id, null), /Another manager or the owner/);
    await verifyClosing(db, owner, own.id, null);
  });
});

describe("restaurant & bar reports and the hotel's books", () => {
  it("sales by item, category, attendant and method; voids apart; restaurant and bar kept separate from each other and from rooms", async () => {
    const mgr = await staff("restaurant_bar_manager");
    const att = await staff("restaurant_bar");
    const { itemId: maltId } = await drink(mgr, 50);
    const rice = await saveMenuItem(db, mgr, { name: `Rice ${rand()}`, outlet: "restaurant", category: "meals", priceKobo: 850_000, available: true, active: true });
    const before = await financeSummary(db, gm, "today");
    const beforeBar = await posReport(db, mgr, "today", "bar");

    await payOrder(db, att, { id: crypto.randomUUID(), outlet: "bar", lines: [{ menuItemId: maltId, quantity: 2 }], method: "cash" });
    const food = await payOrder(db, att, { id: crypto.randomUUID(), outlet: "restaurant", lines: [{ menuItemId: rice, quantity: 1 }], method: "bank_transfer", paymentReference: "ADA OKAFOR", transferChecked: true });
    const oops = await payOrder(db, att, { id: crypto.randomUUID(), outlet: "bar", lines: [{ menuItemId: maltId, quantity: 1 }], method: "cash" });
    await voidOrder(db, mgr, oops.id, "Wrong drink");

    const bar = await posReport(db, mgr, "today", "bar");
    expect(bar.salesKobo - beforeBar.salesKobo).toBe(200_000);
    expect(bar.voids - beforeBar.voids).toBe(1);
    expect(bar.byStaff.find((s) => s.staff_id === att.id)).toMatchObject({ n: 1, kobo: 200_000 });
    expect(bar.byItem.some((i) => i.name.startsWith("Malt"))).toBe(true);
    expect(bar.byCategory.find((c) => c.category === "soft_drinks")!.kobo).toBeGreaterThanOrEqual(200_000);

    const after = await financeSummary(db, gm, "today");
    // The hotel's "today" is the calendar day; sales between midnight and 5am belong to yesterday's trading day.
    const sameDay = businessDate() === hotelToday();
    expect(after.income.bar - before.income.bar).toBe(sameDay ? 200_000 : 0);
    expect(after.income.restaurant - before.income.restaurant).toBe(sameDay ? 850_000 : 0);
    expect(after.income.rooms).toBe(before.income.rooms);
    const rows = await incomeRows(db, gm, sameDay ? "today" : "7d");
    expect(rows.find((r) => r.document === food.receiptNumber)).toMatchObject({ department: "restaurant", method: "transfer", kobo: 850_000 });
    expect(rows.some((r) => r.document === oops.receiptNumber)).toBe(false);
    // Fix 4: the manager's list of transfers to check against the bank statement carries the reference.
    const kitchen = await posReport(db, mgr, "today", "restaurant");
    expect(kitchen.transfers.find((t) => t.receipt_number === food.receiptNumber)).toMatchObject({ reference: "ADA OKAFOR", kobo: 850_000, outlet: "restaurant" });
    expect(kitchen.transfers.every((t) => t.outlet === "restaurant")).toBe(true);
  });

  it("the till's favourites are each counter's best sellers, most sold first", async () => {
    const mgr = await staff("restaurant_bar_manager");
    const att = await staff("restaurant_bar");
    const a = await drink(mgr, 900);
    const b = await drink(mgr, 900);
    const sell = (itemId: string, quantity: number) => payOrder(db, att, { id: crypto.randomUUID(), outlet: "bar", lines: [{ menuItemId: itemId, quantity }], method: "cash" });
    await sell(a.itemId, 90); // the till caps a line at 99
    await sell(b.itemId, 95);
    const fav = await topSellers(db, att);
    expect(fav.bar.indexOf(b.itemId)).toBeLessThan(fav.bar.indexOf(a.itemId));
    expect(fav.bar.length).toBeLessThanOrEqual(8);
    expect(fav.restaurant).not.toContain(a.itemId);
  });

  it("I15 a POS/card sale at the till needs the last 4 digits of the slip", async () => {
    const mgr = await staff("restaurant_bar_manager");
    const att = await staff("restaurant_bar");
    const { itemId } = await drink(mgr);
    const sale = { id: crypto.randomUUID(), outlet: "bar" as const, lines: [{ menuItemId: itemId, quantity: 1 }], method: "pos_terminal" as const };
    await rejects(payOrder(db, att, sale), /last 4 digits of the POS slip/);
    await rejects(payOrder(db, att, { ...sale, paymentReference: "48a1" }), /last 4 digits of the POS slip/);
    const paid = await payOrder(db, att, { ...sale, paymentReference: "0042" });
    expect((await q1<{ payment_reference: string }>("SELECT payment_reference FROM pos_orders WHERE id = ?", paid.id)).payment_reference).toBe("0042");
    const listed = (await posReport(db, mgr, "today", "bar")).transfers.find((t) => t.receipt_number === paid.receiptNumber);
    expect(listed).toMatchObject({ method: "pos_terminal", reference: "0042" });
  });

  it("a transfer at the till needs the reference and the bank-app tick", async () => {
    const mgr = await staff("restaurant_bar_manager");
    const att = await staff("restaurant_bar");
    const { itemId } = await drink(mgr);
    const sale = { id: crypto.randomUUID(), outlet: "bar" as const, lines: [{ menuItemId: itemId, quantity: 1 }], method: "bank_transfer" as const };
    await rejects(payOrder(db, att, { ...sale, transferChecked: true }), /last 4 characters of the transfer reference or the sender's name/);
    await rejects(payOrder(db, att, { ...sale, paymentReference: "4821" }), /Check the hotel's bank app first/);
    const paid = await payOrder(db, att, { ...sale, paymentReference: "4821", transferChecked: true });
    expect((await q1<{ payment_reference: string }>("SELECT payment_reference FROM pos_orders WHERE id = ?", paid.id)).payment_reference).toBe("4821");
  });

  it("restaurant & bar managers record stock waste; finance can view reports but not sell", async () => {
    const mgr = await staff("restaurant_bar_manager");
    const fin = await staff("finance");
    const { stockId, itemId } = await drink(mgr, 6);
    await rejects(recordMove(db, mgr, { itemId: stockId, kind: "wasted", quantity: 2, note: null }), /Say what happened/);
    await recordMove(db, mgr, { itemId: stockId, kind: "wasted", quantity: 2, note: "2 bottles broken" });
    expect(await onHand(stockId)).toBe(4);
    await rejects(recordMove(db, await staff("restaurant_bar"), { itemId: stockId, kind: "received", quantity: 1, note: null }), /role can't do this/);
    await rejects(payOrder(db, fin, { id: crypto.randomUUID(), outlet: "bar", lines: [{ menuItemId: itemId, quantity: 1 }], method: "cash" }), /role can't do this/);
    const rep = await posReport(db, fin, "today", "restaurant");
    expect(rep).not.toHaveProperty("expensesKobo");
  });

  it("stores the Restaurant/Bar Manager role and keeps it to a restaurant & bar record", async () => {
    const mgr = await staff("restaurant_bar_manager");
    expect(await q1(`SELECT (CASE WHEN department = 'restaurant_bar' AND department_lead = 1 THEN 'restaurant_bar_manager' ELSE coalesce(department, role) END) AS r FROM staff_profiles WHERE id = ?`, mgr.id)).toEqual({ r: "restaurant_bar_manager" });
    await rejects(exec("UPDATE staff_profiles SET department = 'finance' WHERE id = ?", mgr.id), /lead_needs_restaurant_bar/);
  });

  it("a retried payment after a dropped connection returns the first receipt and takes stock once", async () => {
    const mgr = await staff("restaurant_bar_manager");
    const att = await staff("restaurant_bar");
    const { stockId, itemId } = await drink(mgr, 10);
    const id = crypto.randomUUID();
    const pay = () => payOrder(db, att, { id, outlet: "bar", lines: [{ menuItemId: itemId, quantity: 2 }], method: "cash", cashReceivedKobo: 500_000 });
    const first = await pay();
    const again = await pay();
    expect(again).toMatchObject({ receiptNumber: first.receiptNumber, alreadyPaid: true, changeKobo: 300_000 });
    const both = await Promise.all([1, 2].map(() => payOrder(db, att, { id: crypto.randomUUID(), outlet: "bar", lines: [{ menuItemId: itemId, quantity: 1 }], method: "cash" })));
    expect(both[0]!.receiptNumber).not.toBe(both[1]!.receiptNumber);
    expect(await onHand(stockId)).toBe(6);
    const saved = crypto.randomUUID();
    await Promise.all([1, 2].map(() => saveOrder(db, att, { id: saved, outlet: "bar", lines: [{ menuItemId: itemId, quantity: 1 }] })));
    expect((await q("SELECT 1 FROM pos_orders WHERE id = ?", saved)).length).toBe(1);
  });

  it("a price change while an order is open: the customer pays what the till shows", async () => {
    const mgr = await staff("restaurant_bar_manager");
    const att = await staff("restaurant_bar");
    const itemId = await saveMenuItem(db, mgr, { name: `Fanta ${rand()}`, outlet: "bar", category: "soft_drinks", priceKobo: 70_000, available: true, active: true });
    const order = await saveOrder(db, att, { id: crypto.randomUUID(), outlet: "bar", lines: [{ menuItemId: itemId, quantity: 2 }] });
    expect(order.totalKobo).toBe(140_000);
    await saveMenuItem(db, mgr, { id: itemId, name: (await listMenu(db, mgr)).find((m) => m.id === itemId)!.name, outlet: "bar", category: "soft_drinks", priceKobo: 80_000, available: true, active: true });
    const paid = await payOrder(db, att, { id: order.id, outlet: "bar", lines: [{ menuItemId: itemId, quantity: 2 }], method: "pos_terminal", paymentReference: "4821" });
    expect(paid.totalKobo).toBe(160_000);
    expect((await getOrder(db, mgr, order.id))!.lines[0]!.unit_price_kobo).toBe(80_000);
  });

  it("a sale at 1:30am counts toward the night before, in the closing and the reports", async () => {
    const mgr = await staff("restaurant_bar_manager");
    const att = await staff("restaurant_bar");
    const id = crypto.randomUUID();
    await exec(
      `INSERT INTO pos_orders (id, number, outlet, status, total_kobo, method, receipt_number, created_by, paid_by, paid_at, created_at)
       VALUES (?, 900000 + abs(random() % 99999), 'bar', 'paid', 150000, 'cash', ?, ?, ?, '2026-03-11T00:30:00.000Z', '2026-03-11T00:20:00.000Z')`,
      id, `RB-TEST-${rand()}`, att.id, att.id,
    );
    expect((await closingSummary(db, mgr, att.id, "2026-03-10")).byMethod.cash).toBe(150_000);
    expect((await closingSummary(db, mgr, att.id, "2026-03-11")).sales).toBe(0);
    const march = await posReport(db, mgr, "2026-03", "bar", "2026-03-31");
    expect(march.daily.find((d) => d.day === "2026-03-10")!.kobo).toBeGreaterThanOrEqual(150_000);
    expect(march.daily.find((d) => d.day === "2026-03-11")!.kobo).toBe(0);
  });
});
