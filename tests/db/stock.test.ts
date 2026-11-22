import { describe, expect, it } from "vitest";
import type { Actor } from "@/server/db";
import { addStockItem, listStock, recordMove } from "@/server/domain/stock";
import { db, desk, exec, gm, owner, q1, rejects } from "./helpers";

const bar: Actor = { id: owner!.id, role: "restaurant_bar" };

describe("stock", () => {
  it("moves change the quantity, never below zero; only managers receive or fix counts", async () => {
    const id = await addStockItem(db, gm, { name: `Lager ${crypto.randomUUID().slice(0, 6)}`, unit: "bottles", minQuantity: 5, opening: 12 });
    await recordMove(db, bar, { itemId: id, kind: "used", quantity: 8, note: null });
    expect((await q1<{ quantity: number }>("SELECT quantity FROM stock_items WHERE id = ?", id)).quantity).toBe(4);
    expect((await listStock(db, bar)).find((i) => i.id === id)!.quantity).toBe(4);
    await rejects(recordMove(db, bar, { itemId: id, kind: "used", quantity: 5, note: null }), /isn't that much/);
    await rejects(recordMove(db, bar, { itemId: id, kind: "received", quantity: 24, note: "Supplier" }), /role does not allow/);
    await recordMove(db, gm, { itemId: id, kind: "received", quantity: 24, note: "Supplier" });
    await rejects(recordMove(db, gm, { itemId: id, kind: "adjusted", quantity: -2, note: null }), /Say why/);
    await recordMove(db, gm, { itemId: id, kind: "adjusted", quantity: -2, note: "Broken" });
    expect((await q1<{ quantity: number }>("SELECT quantity FROM stock_items WHERE id = ?", id)).quantity).toBe(26);
    await rejects(exec("DELETE FROM stock_moves WHERE item_id = ?", id), /stock_move_immutable/);
    await rejects(listStock(db, desk), /role does not allow/);
  });
});
