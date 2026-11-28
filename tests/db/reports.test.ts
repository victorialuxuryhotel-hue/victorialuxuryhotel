import { describe, expect, it } from "vitest";
import { recordPaymentCorrection } from "@/server/domain/payments";
import { createWebsiteReservation } from "@/server/domain/reservations";
import { createHallBooking, recordHallPayment } from "@/server/domain/events";
import { financeSummary } from "@/server/domain/finance";
import { payOrder, saveMenuItem } from "@/server/domain/pos";
import { csvField, incomeReport, incomeRows, occupancyReport, pickedRangeError, rangeDates, rangeLabel, recentMonths, reportRange, roomRevenue } from "@/server/domain/reports";
import { addDays, businessDate, hotelInstant, hotelToday } from "@/lib/hotel-date";
import { day, db, desk, exec, gm, insertReservation, makeCategory, owner, rejects, rawPayment } from "./helpers";

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

  it("every range the parser can return has a label (the default 14 days used to crash Sales reports)", () => {
    const ranges = [undefined, "bogus", "today", "7d", "14d", "month", "2026-11"].map((r) => reportRange(r, "2027-01-15"));
    expect(ranges.map(rangeLabel)).toEqual(["14 days", "14 days", "Today", "7 days", "14 days", "This month", "November 2026"]);
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
  it("covers rooms (net of corrections), restaurant & bar and the hall, on the Lagos day", async () => {
    const today = hotelToday();
    const before = await incomeReport(db, gm, "today");
    const mine = (r: typeof before) => r.byStaff.find((t) => t.staffId === desk!.id) ?? { byMethod: { cash: 0, transfer: 0, pos: 0 }, total: 0 };

    const b = await booking();
    const p1 = await rawPayment(b.id, 5_000_000, { method: "cash" });
    await rawPayment(b.id, 2_000_000, { method: "bank_transfer" });
    await recordPaymentCorrection(db, gm, { paymentId: p1, amountKobo: 1_000_000, reason: "Typed too much" });
    await exec(
      `INSERT INTO payments (id, reservation_id, amount_kobo, provider, method, status, paid_at, verified_at, recorded_by)
       VALUES (?, ?, 300000, 'offline', 'cash', 'successful', ?, ?, ?)`,
      crypto.randomUUID(), b.id, hotelInstant(today, "00:30:00"), hotelInstant(today, "00:30:00"), desk!.id,
    );
    const item = await saveMenuItem(db, owner, { name: `Chapman ${crypto.randomUUID().slice(0, 4)}`, outlet: "bar", category: "soft_drinks", priceKobo: 350_000, available: true, active: true });
    await payOrder(db, { id: desk!.id, role: "restaurant_bar" }, { id: crypto.randomUUID(), outlet: "bar", lines: [{ menuItemId: item, quantity: 2 }], method: "pos_terminal", slipLast4: "4821", terminal: "Bar terminal", duplicateOk: true });
    const hall = await createHallBooking(db, desk, {
      title: "AGM", customerName: "Ondo Co-op", phone: null, email: null, guests: 50, priceKobo: 20_000_000, notes: null,
      eventDate: day(200 + Math.floor(Math.random() * 300)), startTime: "08:00", endTime: "09:00",
    });
    await recordHallPayment(db, desk, { bookingId: hall, amountKobo: 4_000_000, method: "bank_transfer", paidOn: day(0), reference: "TRF-1" });

    const after = await incomeReport(db, gm, "today");
    // Restaurant & bar sales belong to the trading day (5am to 5am): between midnight and 5am they count for yesterday.
    const bar = businessDate() === today ? 700_000 : 0;
    const d0 = before.daily[0]!;
    const d1 = after.daily[0]!;
    expect(d1.rooms - d0.rooms).toBe(5_000_000 + 2_000_000 - 1_000_000 + 300_000);
    expect(d1.bar - d0.bar).toBe(bar);
    expect(d1.hall - d0.hall).toBe(4_000_000);
    expect(after.total - before.total).toBe(6_300_000 + bar + 4_000_000);

    const t0 = mine(before);
    const t1 = mine(after);
    expect(t1.byMethod.cash - t0.byMethod.cash).toBe(5_300_000);
    expect(t1.byMethod.transfer - t0.byMethod.transfer).toBe(2_000_000 + 4_000_000);
    expect(t1.byMethod.pos - t0.byMethod.pos).toBe(bar);

    const s = await financeSummary(db, gm, "today");
    expect(s.incomeTotal).toBe(after.total);
    expect(s.income).toEqual({ rooms: d1.rooms, restaurant: d1.restaurant, bar: d1.bar, hall: d1.hall });

    const rows = await incomeRows(db, owner, "today");
    expect(rows.filter((r) => r.reference === b.reference).map((r) => r.correction).sort()).toEqual([false, false, false, true]);
    expect(rows.some((r) => r.department === "hall" && r.document === "TRF-1")).toBe(true);
  });

  it("are for finance, managers and the owner only", async () => {
    await rejects(incomeReport(db, desk, "14d"), /role can't do this/);
    await rejects(incomeRows(db, desk, "14d"), /role can't do this/);
    await rejects(occupancyReport(db, desk, "14d"), /role can't do this/);
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

describe("average rate (ADR) and RevPAR, from nights stayed", () => {
  it("counts only the nights inside the period, at the booked rate, less their share of the discount", async () => {
    // A window far ahead that nothing else books, so the report holds only these bookings.
    const from = day(3000 + Math.floor(Math.random() * 3000));
    const to = addDays(from, 6);
    const c = await makeCategory(3);
    // Straddles the start: 2 of its 4 nights (from, from+1) fall in the period.
    await insertReservation({ categoryId: c.id, checkIn: addDays(from, -2), checkOut: addDays(from, 2), status: "confirmed", rateKobo: 10_000_000 });
    // Straddles the end with a ₦40,000 discount over 4 nights: 2 nights in the period, so ₦20,000 off.
    const discounted = await insertReservation({ categoryId: c.id, checkIn: addDays(from, 5), checkOut: addDays(from, 9), status: "confirmed", rateKobo: 8_000_000 });
    await exec("UPDATE reservations SET discount_kobo = 4000000 WHERE id = ?", discounted);
    // Left early: booked 4 nights from+1 → from+5, checked out on the morning of from+2, so 1 night stayed.
    const early = await insertReservation({ categoryId: c.id, roomId: c.roomIds[2], checkIn: addDays(from, 1), checkOut: addDays(from, 5), status: "confirmed", rateKobo: 6_000_000 });
    await exec("UPDATE reservations SET status = 'checked_in' WHERE id = ?", early);
    await exec("UPDATE reservations SET status = 'checked_out', checked_out_at = ? WHERE id = ?", hotelInstant(addDays(from, 2), "10:00:00"), early);
    // Cancelled and awaiting-payment bookings earn nothing.
    const cancelled = await insertReservation({ categoryId: c.id, checkIn: from, checkOut: addDays(from, 3), status: "confirmed", unpaid: true, rateKobo: 9_000_000 });
    await exec("UPDATE reservations SET status = 'cancelled' WHERE id = ?", cancelled);
    await insertReservation({ categoryId: c.id, checkIn: from, checkOut: addDays(from, 2), rateKobo: 9_000_000 });

    expect(await roomRevenue(db, from, to)).toEqual({ kobo: 2 * 10_000_000 + (2 * 8_000_000 - 2_000_000) + 6_000_000, nights: 5 });

    const r = await occupancyReport(db, gm, reportRange(`${from}_${to}`, to), to);
    const revenue = 20_000_000 + 14_000_000 + 6_000_000;
    expect([r.soldNights, r.roomRevenueKobo]).toEqual([5, revenue]);
    expect(r.adrKobo).toBe(revenue / 5);
    expect(r.availableNights).toBe(7 * r.roomsInService);
    expect(r.revparKobo).toBe(Math.round(revenue / (7 * r.roomsInService)));
  });
});

describe("This week and picked dates", () => {
  it("this week runs Monday to today", () => {
    expect(rangeDates("week", "2026-11-28")).toMatchObject({ from: "2026-11-23", to: "2026-11-28" }); // a Saturday
    expect(rangeDates("week", "2026-11-23").days).toEqual(["2026-11-23"]); // a Monday
    expect(rangeDates("week", "2026-11-29").days).toHaveLength(7); // a Sunday
    expect(rangeLabel(reportRange("week"))).toBe("This week");
  });

  it("picked dates are checked: real dates, in order, not past today, at most 92 days", () => {
    const today = "2026-11-28";
    expect(reportRange("2026-11-02_2026-11-20", today)).toBe("2026-11-02_2026-11-20");
    expect(rangeDates("2026-11-02_2026-11-20", today).days).toHaveLength(19);
    expect(rangeLabel("2026-11-02_2026-11-20")).toBe("2 Nov – 20 Nov 2026");
    expect(rangeLabel("2025-12-30_2026-01-02")).toBe("30 Dec 2025 – 2 Jan 2026");
    expect(pickedRangeError("2026-08-29", "2026-11-28", today)).toBeNull(); // 92 days
    expect(pickedRangeError("2026-08-28", "2026-11-28", today)).toMatch(/at most 92/);
    expect(pickedRangeError("2026-11-20", "2026-11-02", today)).toMatch(/on or before/);
    expect(pickedRangeError("2026-11-20", "2026-11-29", today)).toMatch(/past today/);
    expect(pickedRangeError("2026-02-30", "2026-03-02", today)).toMatch(/valid/);
    expect(pickedRangeError(undefined, "2026-11-02", today)).toMatch(/both/);
    expect(reportRange("2026-08-28_2026-11-28", today)).toBe("14d");
    expect(reportRange("2026-11-02_2026-11-29", today)).toBe("14d");
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
