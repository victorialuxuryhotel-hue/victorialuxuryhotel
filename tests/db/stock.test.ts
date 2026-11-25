import { describe, expect, it } from "vitest";
import type { Actor } from "@/server/db";
import { addStockItem, listStock, recordMove, stockMoves } from "@/server/domain/stock";
import { db, desk, exec, gm, owner, q1, rejects } from "./helpers";

const attendant: Actor = { id: owner!.id, role: "restaurant_bar" };
const manager: Actor = { id: owner!.id, role: "restaurant_bar_manager" };

describe("stock", () => {
  it("moves change the quantity, never below zero; only the restaurant & bar manager or owner records them", async () => {
    const id = await addStockItem(db, manager, { name: `Lager ${crypto.randomUUID().slice(0, 6)}`, unit: "bottles", category: "drinks", minQuantity: 5, opening: 12 });
    await recordMove(db, manager, { itemId: id, kind: "used", quantity: 8, note: null });
    expect((await q1<{ quantity: number }>("SELECT quantity FROM stock_items WHERE id = ?", id)).quantity).toBe(4);
    await rejects(recordMove(db, manager, { itemId: id, kind: "used", quantity: 5, note: null }), /isn't that much/);
    await rejects(recordMove(db, attendant, { itemId: id, kind: "received", quantity: 24, note: "Supplier" }), /role can't do this/);
    await rejects(recordMove(db, gm, { itemId: id, kind: "received", quantity: 24, note: "Supplier" }), /role can't do this/);
    await recordMove(db, owner, { itemId: id, kind: "received", quantity: 24, note: "Supplier" });
    await rejects(recordMove(db, manager, { itemId: id, kind: "adjusted", quantity: -2, note: null }), /Say why/);
    await recordMove(db, manager, { itemId: id, kind: "adjusted", quantity: -2, note: "Counted 26" });
    await recordMove(db, manager, { itemId: id, kind: "wasted", quantity: 1, note: "Bottle broke" });
    expect((await q1<{ quantity: number }>("SELECT quantity FROM stock_items WHERE id = ?", id)).quantity).toBe(25);
    await rejects(exec("DELETE FROM stock_moves WHERE item_id = ?", id), /stock_move_immutable/);
    expect((await listStock(db, gm)).find((i) => i.id === id)).toMatchObject({ quantity: 25, category: "drinks" });
    expect((await stockMoves(db, gm, { itemId: id, kind: "wasted" })).map((m) => m.change)).toEqual([-1]);
    await rejects(listStock(db, desk), /role can't do this/);
    await rejects(listStock(db, attendant), /role can't do this/);
  });
});
