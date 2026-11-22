import { describe, expect, it } from "vitest";
import { recordOfflinePayment, recordPaymentCorrection } from "@/server/domain/payments";
import { createWebsiteReservation } from "@/server/domain/reservations";
import { cashUp, csvField, moneyReport, occupancyReport, paymentsForCsv, rangeDates, reportRange } from "@/server/domain/reports";
import { addDays, hotelInstant, hotelToday } from "@/lib/hotel-date";
import { day, db, desk, exec, gm, insertReservation, makeCategory, owner, rejects } from "./helpers";

async function booking() {
  const c = await makeCategory(1, { rateKobo: 10_000_000 });
  return createWebsiteReservation(db, {
    categorySlug: c.slug, checkIn: day(50), checkOut: day(53), guests: 1, fullName: "Report Guest",
    email: `rep-${crypto.randomUUID().slice(0, 8)}@example.com`, phone: "+2348000000004",
  });
}

describe("report ranges (Lagos dates)", () => {
  it("today, 14 days and month to date, all ending today", () => {
    expect(rangeDates("today", "2026-12-09")).toEqual({ from: "2026-12-09", to: "2026-12-09", days: ["2026-12-09"] });
    const d14 = rangeDates("14d", "2026-12-09");
    expect([d14.from, d14.days.length]).toEqual(["2026-11-26", 14]);
    expect(rangeDates("month", "2026-12-09").days).toHaveLength(9);
    expect(rangeDates("month", "2026-12-01").days).toEqual(["2026-12-01"]);
    expect([reportRange("month"), reportRange("bogus"), reportRange(undefined)]).toEqual(["month", "14d", "14d"]);
  });
});

describe("money and cash-up", () => {
  it("are net of corrections, counted on the Lagos day, and grouped by who took the money", async () => {
    const today = hotelToday();
    const beforeMoney = await moneyReport(db, gm, "today");
    const beforeCash = await cashUp(db, gm);
    const mine = (rows: Awaited<ReturnType<typeof cashUp>>) => rows.find((r) => r.staffId === desk!.id);

    const b = await booking();
    const p1 = await recordOfflinePayment(db, desk, { reservationId: b.id, amountKobo: 5_000_000, method: "cash", paidOn: day(0), confirmReceived: true });
    await recordOfflinePayment(db, desk, { reservationId: b.id, amountKobo: 2_000_000, method: "bank_transfer", paidOn: day(0), confirmReceived: true });
    await recordPaymentCorrection(db, gm, { paymentId: p1.paymentId, amountKobo: 1_000_000, reason: "Typed too much" });
    // Paid at 23:30 UTC yesterday = 00:30 today in Lagos: counts today.
    await exec(
      `INSERT INTO payments (id, reservation_id, amount_kobo, provider, method, status, paid_at, verified_at, recorded_by)
       VALUES (?, ?, 300000, 'offline', 'cash', 'successful', ?, ?, ?)`,
      crypto.randomUUID(), b.id, hotelInstant(today, "00:30:00"), hotelInstant(today, "00:30:00"), desk!.id,
    );

    const after = await moneyReport(db, gm, "today");
    expect(after.total - beforeMoney.total).toBe(5_000_000 + 2_000_000 - 1_000_000 + 300_000);
    const desk1 = mine(await cashUp(db, gm))!;
    const desk0 = mine(beforeCash) ?? { counts: { cash: 0, transfer: 0 }, totalKobo: 0 };
    expect(desk1.counts.cash - desk0.counts.cash).toBe(2);
    expect(desk1.counts.transfer - desk0.counts.transfer).toBe(1);
    expect(desk1.totalKobo - desk0.totalKobo).toBe(7_300_000);

    const csv = await paymentsForCsv(db, owner, "today");
    expect(csv.filter((r) => r.reference === b.reference).map((r) => r.kind).sort()).toEqual(["payment", "payment", "payment", "refund"]);
  });

  it("are for managers and the owner only", async () => {
    await rejects(moneyReport(db, desk, "14d"), /role does not allow/);
    await rejects(cashUp(db, desk), /role does not allow/);
    await rejects(occupancyReport(db, desk, "14d"), /role does not allow/);
    await rejects(paymentsForCsv(db, desk, "14d"), /role does not allow/);
  });
});

describe("occupancy", () => {
  it("counts staying guests per night against rooms in service, and room-nights by type", async () => {
    const today = hotelToday();
    const before = await occupancyReport(db, gm, "today");
    const c = await makeCategory(2);
    await insertReservation({ categoryId: c.id, checkIn: addDays(today, -1), checkOut: addDays(today, 1), status: "confirmed" });
    const after = await occupancyReport(db, gm, "today");
    expect(after.roomsInService - before.roomsInService).toBe(2);
    expect(after.nights[0]!.occupied - before.nights[0]!.occupied).toBe(1);
    expect(after.byType.find((t) => t.name === `Test ${c.slug}`)?.nights).toBe(1);
  });
});

describe("CSV fields", () => {
  it("keeps numbers as numbers and stops text from running as a formula", () => {
    expect(csvField(-1000)).toBe("-1000");
    expect(csvField('Ada "Ola"')).toBe('"Ada ""Ola"""');
    expect(csvField("=HYPERLINK(1)")).toBe(`"'=HYPERLINK(1)"`);
    expect(csvField("-cmd")).toBe(`"'-cmd"`);
    expect(csvField(null)).toBe('""');
  });
});
