import { describe, expect, it } from "vitest";
import { createWebsiteReservation } from "@/server/domain/reservations";

import { frontDeskSummary, listPaymentsFor } from "@/server/domain/payment-list";
import { checkPayment } from "@/server/domain/payment-checks";
import { addDays, hotelInstant, hotelToday } from "@/lib/hotel-date";
import { day, db, desk, exec, gm, makeCategory, owner, rawPayment } from "./helpers";

async function booking() {
  const c = await makeCategory(1, { rateKobo: 10_000_000 });
  return createWebsiteReservation(db, {
    categorySlug: c.slug, checkIn: day(40), checkOut: day(43), guests: 1, fullName: "Scope Guest",
    email: `scope-${crypto.randomUUID().slice(0, 8)}@example.com`, phone: "+2348000000003",
  });
}

const pay = async (actor: typeof desk, reservationId: string, paidOn: string, amountKobo: number, method = "cash") => ({
  paymentId: await rawPayment(reservationId, amountKobo, { method, paidAt: paidOn === hotelToday() ? new Date().toISOString() : hotelInstant(paidOn, "12:00:00"), recordedBy: actor!.id }),
});

async function payAt(reservationId: string, paidAt: string, amountKobo: number, recordedBy: string) {
  const id = crypto.randomUUID();
  await exec(
    `INSERT INTO payments (id, reservation_id, amount_kobo, provider, method, status, paid_at, verified_at, recorded_by, created_at)
     VALUES (?, ?, ?, 'offline', 'cash', 'successful', ?, ?, ?, ?)`,
    id, reservationId, amountKobo, paidAt, paidAt, recordedBy, paidAt,
  );
  return id;
}

const amounts = async (actor: typeof desk, reservationId: string, view?: string) => {
  const { view: used, rows } = await listPaymentsFor(db, actor, { view, size: 500 });
  return { used, amounts: rows.filter((r) => r.reservation_id === reservationId).map((r) => r.amount_kobo).sort((a, b) => a - b) };
};

describe("payments the front desk can see", () => {
  it("lists money received only: online attempts that didn't complete stay on the booking", async () => {
    const b = await booking();
    for (const status of ["pending", "failed", "abandoned"]) {
      await exec(
        "INSERT INTO payments (id, reservation_id, amount_kobo, provider, method, provider_reference, status) VALUES (?, ?, 30000000, 'paystack', 'card', ?, ?)",
        crypto.randomUUID(), b.id, `att-${crypto.randomUUID().slice(0, 8)}`, status,
      );
    }
    await pay(gm, b.id, day(0), 2_000_000);
    expect((await amounts(gm, b.id, "all")).amounts).toEqual([2_000_000]);
  });

  it("today's payments and their own; never an older payment someone else recorded, whatever they ask for", async () => {
    const b = await booking();
    await pay(gm, b.id, day(-3), 1_000_000); // older, by the manager: hidden from front desk
    await pay(gm, b.id, day(0), 2_000_000); // today, by the manager: visible today
    await pay(desk, b.id, day(-3), 3_000_000); // older, by front desk: visible under "Recorded by me"

    expect(await amounts(desk, b.id)).toEqual({ used: "today", amounts: [2_000_000] });
    expect(await amounts(desk, b.id, "mine")).toEqual({ used: "mine", amounts: [3_000_000] });
    expect(await amounts(desk, b.id, "all")).toEqual({ used: "today", amounts: [2_000_000] });
    expect(await amounts(desk, b.id, "anything")).toEqual({ used: "today", amounts: [2_000_000] });

    expect(await amounts(gm, b.id)).toEqual({ used: "all", amounts: [1_000_000, 2_000_000, 3_000_000] });
    expect(await amounts(owner, b.id, "today")).toEqual({ used: "all", amounts: [1_000_000, 2_000_000, 3_000_000] });
  });

  it("'today' follows Lagos time, not UTC, at both ends of the day", async () => {
    const b = await booking();
    const today = hotelToday();
    await payAt(b.id, hotelInstant(today, "00:30:00"), 4_100_000, gm!.id); // 23:30 UTC yesterday: today in Lagos
    await payAt(b.id, hotelInstant(addDays(today, -1), "23:30:00"), 4_200_000, gm!.id); // yesterday in Lagos
    expect((await amounts(desk, b.id)).amounts).toEqual([4_100_000]);
  });

  it("counts and today's takings, net of corrections, grouped by how they were paid", async () => {
    const before = await frontDeskSummary(db, desk);
    const b = await booking();
    await pay(desk, b.id, day(0), 1_500_000);
    await pay(desk, b.id, day(-2), 700_000);
    const after = await frontDeskSummary(db, desk);
    expect(after.todayCount - before.todayCount).toBe(1);
    expect(after.mineCount - before.mineCount).toBe(2);
    expect(after.totals.cash - before.totals.cash).toBe(1_500_000);
  });

  it("marks transfers and POS payments waiting in Payments to confirm, until a manager checks them", async () => {
    const b = await booking();
    const before = await frontDeskSummary(db, desk);
    const transfer = await rawPayment(b.id, 900_000, { method: "bank_transfer", recordedBy: desk!.id });
    const cash = await rawPayment(b.id, 400_000, { method: "cash", recordedBy: desk!.id });
    const flag = async (id: string) => (await listPaymentsFor(db, gm, { size: 500 })).rows.find((r) => r.id === id)?.to_confirm;
    expect(await flag(transfer)).toBe(1);
    expect(await flag(cash)).toBe(0);
    const waiting = await frontDeskSummary(db, desk);
    expect(waiting.toConfirm.count - before.toConfirm.count).toBe(1);
    expect(waiting.toConfirm.kobo - before.toConfirm.kobo).toBe(900_000);
    await checkPayment(db, gm, { sourceType: "payment", sourceId: transfer, outcome: "matched" });
    expect(await flag(transfer)).toBe(0);
    expect((await frontDeskSummary(db, desk)).toConfirm.count).toBe(before.toConfirm.count);
  });

  it("counts refunds asked for and not yet decided", async () => {
    const b = await booking();
    const before = await frontDeskSummary(db, desk);
    await exec(
      "INSERT INTO refund_requests (id, reservation_id, amount_kobo, method, reason, requested_by) VALUES (?, ?, 200000, 'cash', 'Guest left early', ?)",
      crypto.randomUUID(), b.id, desk!.id,
    );
    const after = await frontDeskSummary(db, desk);
    expect(after.refundsDue.count - before.refundsDue.count).toBe(1);
    expect(after.refundsDue.kobo - before.refundsDue.kobo).toBe(200_000);
  });
});
