import { describe, expect, it } from "vitest";
import type { Actor } from "@/server/db";
import { addMenuItem, chargesFor, recordSale, settleRoomCharges, voidSale } from "@/server/domain/pos";
import { checkOutReservation } from "@/server/domain/reservations";
import { day, db, desk, exec, gm, insertReservation, makeCategory, owner, q1, rejects, status } from "./helpers";

const bar: Actor = { id: owner!.id, role: "restaurant_bar" };

async function staying() {
  const c = await makeCategory(1);
  const id = await insertReservation({ categoryId: c.id, checkIn: day(0), checkOut: day(1), roomId: c.roomIds[0], status: "confirmed" });
  await exec("UPDATE reservations SET status = 'checked_in' WHERE id = ?", id);
  return id;
}

describe("restaurant and bar", () => {
  it("sells at the counter with running numbers, and only managers change the menu", async () => {
    const beer = await addMenuItem(db, gm, { name: `Beer ${crypto.randomUUID().slice(0, 4)}`, outlet: "bar", priceKobo: 150_000 });
    await rejects(addMenuItem(db, bar, { name: "Nope", outlet: "bar", priceKobo: 100 }), /role does not allow/);
    const a = await recordSale(db, bar, { outlet: "bar", items: [{ menuItemId: beer, quantity: 3 }], method: "cash" });
    const b = await recordSale(db, bar, { outlet: "bar", items: [{ menuItemId: beer, quantity: 1 }], method: "pos_terminal" });
    expect(a.totalKobo).toBe(450_000);
    expect(b.number).toBe(a.number + 1);
    await rejects(recordSale(db, bar, { outlet: "restaurant", items: [{ menuItemId: beer, quantity: 1 }], method: "cash" }), /no longer on this menu/);
    await rejects(recordSale(db, desk, { outlet: "bar", items: [{ menuItemId: beer, quantity: 1 }], method: "cash" }), /role does not allow/);
    await rejects(exec("UPDATE sales SET total_kobo = 1 WHERE id = ?", a.id), /sale_immutable/);
    await rejects(voidSale(db, bar, a.id, "Mistake"), /role does not allow/);
    await voidSale(db, gm, a.id, "Rang up twice");
    expect((await q1<{ status: string }>("SELECT status FROM sales WHERE id = ?", a.id)).status).toBe("void");
  });

  it("charges only guests staying now; check-out waits until charges are settled", async () => {
    const meal = await addMenuItem(db, gm, { name: `Jollof ${crypto.randomUUID().slice(0, 4)}`, outlet: "restaurant", priceKobo: 600_000 });
    const c = await makeCategory(1);
    const notYet = await insertReservation({ categoryId: c.id, checkIn: day(5), checkOut: day(6), status: "confirmed" });
    await rejects(recordSale(db, bar, { outlet: "restaurant", items: [{ menuItemId: meal, quantity: 1 }], reservationId: notYet }), /staying now/);

    const res = await staying();
    await recordSale(db, bar, { outlet: "restaurant", items: [{ menuItemId: meal, quantity: 2 }], reservationId: res });
    expect((await chargesFor(db, desk, res)).map((x) => x.status)).toEqual(["room_charge"]);
    await rejects(checkOutReservation(db, desk, res), /unpaid/);
    expect(await settleRoomCharges(db, desk, res, "cash")).toBe(1_200_000);
    await checkOutReservation(db, desk, res);
    expect(await status(res)).toBe("checked_out");
  });
});
