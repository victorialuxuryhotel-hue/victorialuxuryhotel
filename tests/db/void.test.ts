// Void at the counter with a manager's PIN (FUNCTIONALITY.md section 3, design X9).
import { describe, expect, it } from "vitest";
import type { Actor } from "@/server/db";
import { closingSummary, payOrder, saveMenuItem, setMenuItemStock, voidOrder } from "@/server/domain/pos";
import { createStation, setStaffPin, stationByToken, type Station } from "@/server/domain/stations";
import { addStockItem } from "@/server/domain/stock";
import { db, exec, gm, owner, q1, rejects } from "./helpers";

const PEPPER = "test-pepper";
const rand = () => crypto.randomUUID().slice(0, 8);

async function person(role: "restaurant_bar" | "restaurant_bar_manager", pin = "2580"): Promise<NonNullable<Actor>> {
  const id = crypto.randomUUID();
  await exec(
    "INSERT INTO staff_profiles (id, full_name, email, role, department, department_lead) VALUES (?, ?, ?, 'front_desk', 'restaurant_bar', ?)",
    id, `Staff ${rand()}`, `v-${rand()}@example.com`, role === "restaurant_bar_manager" ? 1 : 0,
  );
  await setStaffPin(db, owner, id, pin, PEPPER);
  return { id, role };
}

async function bar(): Promise<Station> {
  const { token } = await createStation(db, gm, { name: `Bar ${rand()}`, type: "bar" });
  return (await stationByToken(db, token))!;
}

async function cashSale(seller: NonNullable<Actor>, mgr: NonNullable<Actor>) {
  const stockId = await addStockItem(db, mgr, { name: `Smirnoff ${rand()}`, unit: "bottles", category: "drinks", minQuantity: 1, opening: 10 });
  const itemId = await saveMenuItem(db, mgr, { name: `Smirnoff Ice ${rand()}`, outlet: "bar", category: "soft_drinks", priceKobo: 250_000, available: true, active: true });
  await setMenuItemStock(db, mgr, itemId, [{ stockItemId: stockId, quantity: 1 }]);
  const sale = await payOrder(db, seller, { id: crypto.randomUUID(), outlet: "bar", lines: [{ menuItemId: itemId, quantity: 2 }], method: "cash" });
  return { sale, stockId };
}

const onHand = async (id: string) => (await q1<{ quantity: number }>("SELECT quantity FROM stock_items WHERE id = ?", id)).quantity;

describe("void with a manager's PIN at the counter", () => {
  it("can't void without a manager's PIN; the right PIN voids it, logs both names, puts stock back and lowers expected cash", async () => {
    const st = await bar();
    const seller = await person("restaurant_bar");
    const mgr = await person("restaurant_bar_manager", "7391");
    const { sale, stockId } = await cashSale(seller, mgr);
    const before = await closingSummary(db, seller, seller.id);
    const base = { id: sale.id, reasonCode: "customer_changed_mind" as const, cashReturned: true };
    await rejects(voidOrder(db, seller, base, { station: st, pepper: PEPPER }), /manager picks their name and enters their PIN/);
    await rejects(voidOrder(db, seller, { ...base, approver: { staffId: mgr.id, pin: "1111" } }, { station: st, pepper: PEPPER }), /Wrong PIN/);
    expect((await q1<{ status: string }>("SELECT status FROM pos_orders WHERE id = ?", sale.id)).status).toBe("paid");

    const r = await voidOrder(db, seller, { ...base, approver: { staffId: mgr.id, pin: "7391" } }, { station: st, pepper: PEPPER });
    expect(r.approvedBy).toMatch(/^Staff /);
    expect(await q1("SELECT status, closed_by, void_approved_by, void_reason_code, void_cash_returned FROM pos_orders WHERE id = ?", sale.id)).toEqual({
      status: "void", closed_by: seller.id, void_approved_by: mgr.id, void_reason_code: "customer_changed_mind", void_cash_returned: 1,
    });
    const log = await q1<{ summary: string }>("SELECT summary FROM activity_log WHERE entity_id = ? AND action = 'pos.order_voided'", sale.id);
    expect(log.summary).toMatch(/voided by Staff .*, approved by Staff /);
    expect(await onHand(stockId)).toBe(10);
    const after = await closingSummary(db, seller, seller.id);
    expect(before.byMethod.cash - after.byMethod.cash).toBe(500_000);
  });

  it("a manager can't approve a void of a sale they made themselves", async () => {
    const st = await bar();
    const mgr = await person("restaurant_bar_manager");
    const other = await person("restaurant_bar_manager", "4826");
    const { sale } = await cashSale(mgr, other);
    await rejects(voidOrder(db, mgr, { id: sale.id, reasonCode: "rung_up_wrongly", cashReturned: true, approver: { staffId: mgr.id, pin: "2580" } }, { station: st, pepper: PEPPER }), /can't be the person who made the sale/);
    // Off a station, the signed-in manager can't approve their own sale either.
    await rejects(voidOrder(db, mgr, { id: sale.id, reasonCode: "rung_up_wrongly", cashReturned: true }), /You made this sale/);
    // The database refuses it too.
    await rejects(
      exec("UPDATE pos_orders SET status = 'void', closed_by = ?, closed_at = ?, close_reason = 'xxx', void_approved_by = ?, void_reason_code = 'other', void_cash_returned = 1 WHERE id = ?", mgr.id, new Date().toISOString(), mgr.id, sale.id),
      /void_needs_manager/,
    );
    await voidOrder(db, mgr, { id: sale.id, reasonCode: "rung_up_wrongly", cashReturned: true, approver: { staffId: other.id, pin: "4826" } }, { station: st, pepper: PEPPER });
  });

  it("a salesperson can't approve; 3 wrong manager PINs refuse the void and the manager is told", async () => {
    const st = await bar();
    const seller = await person("restaurant_bar");
    const helper = await person("restaurant_bar");
    const mgr = await person("restaurant_bar_manager", "7391");
    const { sale } = await cashSale(seller, mgr);
    const base = { id: sale.id, reasonCode: "item_unavailable" as const, cashReturned: true };
    await rejects(voidOrder(db, seller, { ...base, approver: { staffId: helper.id, pin: "2580" } }, { station: st, pepper: PEPPER }), /can't approve voids/);
    for (let i = 0; i < 2; i++) await rejects(voidOrder(db, seller, { ...base, approver: { staffId: mgr.id, pin: "0000" } }, { station: st, pepper: PEPPER }), /Wrong PIN/);
    await rejects(voidOrder(db, seller, { ...base, approver: { staffId: mgr.id, pin: "0000" } }, { station: st, pepper: PEPPER }), /3 wrong PINs\. The void is refused/);
    // Refused: even the right PIN now waits out the lock.
    await rejects(voidOrder(db, seller, { ...base, approver: { staffId: mgr.id, pin: "7391" } }, { station: st, pepper: PEPPER }), /Too many wrong PINs/);
    expect((await q1<{ status: string }>("SELECT status FROM pos_orders WHERE id = ?", sale.id)).status).toBe("paid");
    const told = await q1<{ n: number }>("SELECT count(*) AS n FROM activity_log WHERE action = 'staff.approval_refused' AND entity_id = ?", mgr.id);
    expect(told.n).toBe(1);
  });
});
