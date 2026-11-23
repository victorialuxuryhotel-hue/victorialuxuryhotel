import { describe, expect, it } from "vitest";
import { recordOfflinePayment, recordPaymentCorrection } from "@/server/domain/payments";
import { createWebsiteReservation } from "@/server/domain/reservations";
import { createHallBooking, recordHallPayment } from "@/server/domain/events";
import { financeSummary } from "@/server/domain/finance";
import { csvField, incomeReport, incomeRows, occupancyReport, rangeDates, recentMonths, reportRange } from "@/server/domain/reports";
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

  it("a past month runs first to last day; this month or a future one isn't a past month", () => {
    expect(rangeDates("2026-11", "2027-01-15")).toMatchObject({ from: "2026-11-01", to: "2026-11-30" });
    expect(rangeDates("2026-11", "2027-01-15").days).toHaveLength(30);
    expect(rangeDates("2026-12", "2027-01-15").to).toBe("2026-12-31");
    expect(reportRange("2026-12", "2027-01-15")).toBe("2026-12");
    expect(reportRange("2027-01", "2027-01-15")).toBe("month");
    expect(reportRange("2027-02", "2027-01-15")).toBe("14d");
    expect(reportRange("2025-12", "2027-01-15")).toBe("14d");
    expect(reportRange("2026-13", "2027-01-15")).toBe("14d");
    expect(recentMonths("2027-01-15")).toEqual(["2027-01", "2026-12", "2026-11"]);
  });
});

describe("income by day, by staff and method, and the accountant's download", () => {
  it("covers rooms (net of corrections) and the hall, on the Lagos day", async () => {
    const today = hotelToday();
    const before = await incomeReport(db, gm, "today");
    const mine = (r: typeof before) => r.byStaff.find((t) => t.staffId === desk!.id) ?? { byMethod: { cash: 0, transfer: 0, pos: 0 }, total: 0 };

    const b = await booking();
    const p1 = await recordOfflinePayment(db, desk, { reservationId: b.id, amountKobo: 5_000_000, method: "cash", paidOn: day(0), confirmReceived: true });
    await recordOfflinePayment(db, desk, { reservationId: b.id, amountKobo: 2_000_000, method: "bank_transfer", paidOn: day(0), confirmReceived: true });
    await recordPaymentCorrection(db, gm, { paymentId: p1.paymentId, amountKobo: 1_000_000, reason: "Typed too much" });
    await exec(
      `INSERT INTO payments (id, reservation_id, amount_kobo, provider, method, status, paid_at, verified_at, recorded_by)
       VALUES (?, ?, 300000, 'offline', 'cash', 'successful', ?, ?, ?)`,
      crypto.randomUUID(), b.id, hotelInstant(today, "00:30:00"), hotelInstant(today, "00:30:00"), desk!.id,
    );
    const hall = await createHallBooking(db, desk, {
      title: "AGM", customerName: "Ondo Co-op", phone: null, email: null, guests: 50, priceKobo: 20_000_000, notes: null,
      eventDate: day(200 + Math.floor(Math.random() * 300)), startTime: "08:00", endTime: "09:00", status: "confirmed",
    });
    await recordHallPayment(db, desk, { bookingId: hall, amountKobo: 4_000_000, method: "bank_transfer", paidOn: day(0), reference: "TRF-1" });

    const after = await incomeReport(db, gm, "today");
    const d0 = before.daily[0]!;
    const d1 = after.daily[0]!;
    expect(d1.rooms - d0.rooms).toBe(5_000_000 + 2_000_000 - 1_000_000 + 300_000);
    expect(d1.hall - d0.hall).toBe(4_000_000);
    expect(after.total - before.total).toBe(6_300_000 + 4_000_000);

    const t0 = mine(before);
    const t1 = mine(after);
    expect(t1.byMethod.cash - t0.byMethod.cash).toBe(5_300_000);
    expect(t1.byMethod.transfer - t0.byMethod.transfer).toBe(2_000_000 + 4_000_000);

    const s = await financeSummary(db, gm, "today");
    expect(s.incomeTotal).toBe(after.total);
    expect(s.income).toEqual({ rooms: d1.rooms, hall: d1.hall });

    const rows = await incomeRows(db, owner, "today");
    expect(rows.filter((r) => r.reference === b.reference).map((r) => r.correction).sort()).toEqual([false, false, false, true]);
    expect(rows.some((r) => r.department === "hall" && r.document === "TRF-1")).toBe(true);
  });

  it("are for finance, managers and the owner only", async () => {
    await rejects(incomeReport(db, desk, "14d"), /role does not allow/);
    await rejects(incomeRows(db, desk, "14d"), /role does not allow/);
    await rejects(occupancyReport(db, desk, "14d"), /role does not allow/);
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
