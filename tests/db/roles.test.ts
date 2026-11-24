import { describe, expect, it } from "vitest";
import type { Actor } from "@/server/db";
import { createStaffProfile, ROLE, saveCategory, updateBookingRules, updateStaffProfile } from "@/server/domain/admin";
import { listActivity } from "@/server/domain/activity";
import { financeSummary } from "@/server/domain/finance";
import { recordOfflinePayment, recordPaymentCorrection } from "@/server/domain/payments";
import { incomeRows } from "@/server/domain/reports";
import { assignRoom, cancelReservation, overridePaymentRequirement, resolveAttention } from "@/server/domain/reservations";
import { day, db, exec, gm, insertReservation, makeCategory, owner, q1, rejects } from "./helpers";

const rand = () => crypto.randomUUID().slice(0, 8);

async function staffAs(role: NonNullable<Actor>["role"]): Promise<NonNullable<Actor>> {
  const id = await createStaffProfile(db, owner, { fullName: `Test ${role}`, email: `${role}-${rand()}@example.com`, role });
  return { id, role };
}

const roleOf = async (id: string) => (await q1<{ role: string }>(`SELECT ${ROLE} AS role FROM staff_profiles WHERE id = ?`, id)).role;

describe("role storage", () => {
  it("keeps each of the seven roles through create and change", async () => {
    const hm = await staffAs("hotel_manager");
    expect(await roleOf(hm.id)).toBe("hotel_manager");
    for (const role of ["restaurant_bar_manager", "restaurant_bar", "finance", "front_desk", "general_manager", "hotel_manager"] as const) {
      await updateStaffProfile(db, owner, { staffId: hm.id, role, isActive: true });
      expect(await roleOf(hm.id)).toBe(role);
    }
  });

  it("the database refuses a manager flag on any other role", async () => {
    const f = await staffAs("finance");
    await rejects(exec("UPDATE staff_profiles SET department_lead = 1 WHERE id = ?", f.id), /lead_needs_restaurant_bar/);
    const g = await staffAs("general_manager");
    await rejects(exec("UPDATE staff_profiles SET department_lead = 1 WHERE id = ?", g.id), /lead_needs_restaurant_bar/);
  });
});

describe("hotel manager", () => {
  it("manages room types and booking rules, and can extend a hold", async () => {
    const hm = await staffAs("hotel_manager");
    const c = await makeCategory(1);
    await saveCategory(db, hm, { name: `HM ${rand()}`, slug: `hm-${rand()}`, shortDescription: null, description: null, amenities: [], nightlyRateKobo: 4_000_000, maxOccupancy: 2, sortOrder: 0, isActive: true });
    await updateBookingRules(db, hm, { checkInTime: "14:00", checkOutTime: "12:00", websiteHoldMinutes: 30, staffHoldHours: 24, cancellationPolicy: null, freeCancelHours: 24, lateCancelFeePct: 50, vatRatePct: 750 });
    const held = await insertReservation({ categoryId: c.id, checkIn: day(40), checkOut: day(41), status: "pending_payment" });
    await overridePaymentRequirement(db, hm, held, "extend", "Guest sending transfer tomorrow");
  });

  it("cannot correct payments, resolve refund flags or give free upgrades", async () => {
    const hm = await staffAs("hotel_manager");
    const std = await makeCategory(2, { rateKobo: 5_000_000 });
    const dlx = await makeCategory(1, { rateKobo: 7_000_000 });
    const id = await insertReservation({ categoryId: std.id, checkIn: day(0), checkOut: day(2), roomId: std.roomIds[0], status: "confirmed" });
    const pay = await q1<{ id: string }>("SELECT id FROM payments WHERE reservation_id = ?", id);
    await rejects(recordPaymentCorrection(db, hm, { paymentId: pay.id, amountKobo: 100, reason: "Wrong amount" }), /role does not allow/);
    await exec("UPDATE reservations SET attention_reason = 'Overpaid' WHERE id = ?", id);
    await rejects(resolveAttention(db, hm, id, "Refunded the guest"), /role does not allow/);
    await rejects(assignRoom(db, hm, id, dlx.roomIds[0]!, { waiveCharge: true }), /Only the general manager or owner/);
    await resolveAttention(db, gm, id, "Refunded the guest");
  });

  it("sees hotel income and hotel activity only", async () => {
    const hm = await staffAs("hotel_manager");
    const s = await financeSummary(db, hm, "month");
    expect(s.departments.map((d) => d.key)).toEqual(["rooms"]);
    expect(s.income.restaurant + s.income.bar + s.income.hall).toBe(0);
    expect((await incomeRows(db, hm, "month")).every((r) => r.department === "rooms")).toBe(true);
    const { rows } = await listActivity(db, hm, { range: "month", category: "all", routine: true, page: 1, size: 500 });
    expect(rows.some((r) => /^(staff|pos|stock|export|sale)\./.test(r.action))).toBe(false);
  });
});

describe("finance", () => {
  it("can read reports but cannot change bookings or payments", async () => {
    const fin = await staffAs("finance");
    const c = await makeCategory(1, { rateKobo: 5_000_000 });
    const id = await insertReservation({ categoryId: c.id, checkIn: day(50), checkOut: day(51), status: "pending_payment" });
    await financeSummary(db, fin, "month");
    await rejects(recordOfflinePayment(db, fin, { reservationId: id, amountKobo: 5_000_000, method: "cash", paidOn: day(0), confirmReceived: true }), /role does not allow/);
    await rejects(cancelReservation(db, fin, id, "Not needed"), /role does not allow/);
    await rejects(overridePaymentRequirement(db, fin, id, "extend", "Guest asked for time"), /role does not allow/);
    await rejects(resolveAttention(db, fin, id, "Handled it"), /role does not allow/);
    const paid = await insertReservation({ categoryId: c.id, checkIn: day(60), checkOut: day(61), status: "confirmed" });
    const pay = await q1<{ id: string }>("SELECT id FROM payments WHERE reservation_id = ?", paid);
    await rejects(recordPaymentCorrection(db, fin, { paymentId: pay.id, amountKobo: 100, reason: "Wrong amount" }), /role does not allow/);
  });
});
