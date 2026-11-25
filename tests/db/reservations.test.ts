import { describe, expect, it, vi } from "vitest";
import { freeNights, searchAvailability } from "@/server/domain/inventory";
import {
  assignRoom,
  cancelReservation,
  changeReservationDates,
  checkInReservation,
  checkOutReservation,
  createStaffReservation,
  createWebsiteReservation,
  expireUnpaidReservations,
  markNoShow,
  overridePaymentRequirement,
  undoAction,
  UNDO_WINDOW_MS,
  updateReservationDetails,
  updateRoomStatus,
} from "@/server/domain/reservations";
import { day, db, desk, exec, gm, insertReservation, lapseHold, makeCategory, makeRoom, owner, q, q1, rejects, status } from "./helpers";

const website = (slug: string, checkIn: string, checkOut: string, extra: Partial<Parameters<typeof createWebsiteReservation>[1]> = {}) =>
  createWebsiteReservation(db, {
    categorySlug: slug, checkIn, checkOut, guests: 1, fullName: "Web Guest",
    email: `web-${crypto.randomUUID().slice(0, 8)}@example.com`, phone: "+2348000000000", ...extra,
  });

const staffBooking = (categoryId: string, checkIn: string, checkOut: string, actor = desk) =>
  createStaffReservation(db, actor, { categoryId, checkIn, checkOut, guests: 1, source: "phone", fullName: "Phone Guest", phone: "+2348000000001" });

describe("availability search (public)", () => {
  it("returns prices and a yes/no flag, never room counts", async () => {
    const c = await makeCategory(1, { rateKobo: 7_000_000 });
    const rows = await searchAvailability(db, day(30), day(33), 2);
    const row = rows.find((r) => r.slug === c.slug)!;
    expect(row).toMatchObject({ nightly_rate_kobo: 7_000_000, nights: 3, total_kobo: 21_000_000, is_available: true });
    expect(Object.keys(row)).not.toContain("free");
    await insertReservation({ categoryId: c.id, checkIn: day(31), checkOut: day(32), status: "confirmed" });
    expect((await searchAvailability(db, day(30), day(33), 2)).find((r) => r.slug === c.slug)!.is_available).toBe(false);
  });

  it("marks a room type unavailable when the party is larger than it sleeps", async () => {
    const c = await makeCategory(3, { maxOccupancy: 2 });
    expect((await searchAvailability(db, day(30), day(31), 3)).find((r) => r.slug === c.slug)!.is_available).toBe(false);
  });

  it("validates the stay", async () => {
    await rejects(searchAvailability(db, day(-1), day(1), 1), /can't be in the past/);
    await rejects(searchAvailability(db, day(5), day(5), 1), /must be after check-in/);
    await rejects(searchAvailability(db, day(5), day(100), 1), /longer than 90 nights/);
    await rejects(searchAvailability(db, day(800), day(801), 1), /two years ahead/);
  });
});

describe("capacity", () => {
  it("sells exactly the number of rooms, then reports unavailable", async () => {
    const c = await makeCategory(2);
    await website(c.slug, day(40), day(42));
    await website(c.slug, day(41), day(43));
    await rejects(website(c.slug, day(41), day(42)), /no longer available/, "UNAVAILABLE");
  });

  it("treats check-out day as free for the next arrival", async () => {
    const c = await makeCategory(1);
    await website(c.slug, day(40), day(42));
    await website(c.slug, day(42), day(44));
  });

  it("releases inventory the moment a hold lapses, before the clean-up job runs", async () => {
    const c = await makeCategory(1);
    const first = await website(c.slug, day(40), day(41));
    await lapseHold(first.id);
    await website(c.slug, day(40), day(41));
    expect(await status(first.id)).toBe("pending_payment");
  });

  it("excludes rooms under maintenance", async () => {
    const c = await makeCategory(0);
    await makeRoom(c.id, { serviceStatus: "maintenance" });
    await rejects(website(c.slug, day(40), day(41)), /no longer available/);
  });

  it("frees inventory when a reservation is cancelled", async () => {
    const c = await makeCategory(1);
    const r = await staffBooking(c.id, day(40), day(41));
    await cancelReservation(db, desk, r.id, "Guest changed plans");
    await website(c.slug, day(40), day(41));
  });

  it("never oversells under simultaneous booking attempts", async () => {
    const c = await makeCategory(3);
    const attempts = await Promise.allSettled(Array.from({ length: 20 }, () => website(c.slug, day(50), day(52))));
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(3);
    const live = await q1<{ n: number }>("SELECT count(*) AS n FROM reservations WHERE category_id = ? AND status = 'pending_payment'", c.id);
    expect(live.n).toBe(3);
  });
});

describe("creating reservations", () => {
  it("prices on the server from the room-type rate", async () => {
    const c = await makeCategory(2, { rateKobo: 4_500_000 });
    const r = await website(c.slug, day(40), day(43));
    expect(r.totalAmountKobo).toBe(13_500_000);
    expect(r.reference).toMatch(/^VL-[A-Z0-9]{6}$/);
  });

  it("keeps the price agreed at booking when the rate later changes", async () => {
    const c = await makeCategory(2, { rateKobo: 4_500_000 });
    const r = await website(c.slug, day(40), day(41));
    await exec("UPDATE room_categories SET nightly_rate_kobo = 9000000 WHERE id = ?", c.id);
    expect((await q1<{ total_amount_kobo: number }>("SELECT total_amount_kobo FROM reservations WHERE id = ?", r.id)).total_amount_kobo).toBe(4_500_000);
  });

  it("requires email and phone on the website", async () => {
    const c = await makeCategory(1);
    await rejects(website(c.slug, day(40), day(41), { email: "" }), /email address and phone number are required/);
    await rejects(website(c.slug, day(40), day(41), { phone: " " }), /email address and phone number are required/);
  });

  it("links a returning guest by email without letting a booking overwrite their name", async () => {
    const c = await makeCategory(3);
    const email = `returning-${crypto.randomUUID().slice(0, 8)}@example.com`;
    await website(c.slug, day(40), day(41), { email, fullName: "Original Name", phone: "" + "+2348011111111" });
    await website(c.slug, day(42), day(43), { email: email.toUpperCase(), fullName: "Someone Else" });
    const guests = await q<{ full_name: string }>("SELECT full_name FROM guests WHERE email = ?", email);
    expect(guests).toEqual([{ full_name: "Original Name" }]);
  });

  it("staff bookings use the direct-booking hold and record who created them", async () => {
    const c = await makeCategory(1);
    const r = await staffBooking(c.id, day(40), day(41));
    const row = await q1<{ created_by: string; source: string; hold_expires_at: string }>("SELECT created_by, source, hold_expires_at FROM reservations WHERE id = ?", r.id);
    expect(row.created_by).toBe(desk!.id);
    expect(row.source).toBe("phone");
    const hours = (Date.parse(row.hold_expires_at) - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(23);
    const log = await q1<{ actor_id: string }>("SELECT actor_id FROM activity_log WHERE entity_id = ? AND action = 'reservation.created'", r.id);
    expect(log.actor_id).toBe(desk!.id);
  });

  it("requires a staff member (never a website visitor)", async () => {
    const c = await makeCategory(1);
    await rejects(createStaffReservation(db, null, { categoryId: c.id, checkIn: day(40), checkOut: day(41), guests: 1, source: "phone", fullName: "X Y" }), /session has ended/, "UNAUTHENTICATED");
  });
});

describe("room assignment", () => {
  it("assigns a room, and refuses a second overlapping assignment with a clear message", async () => {
    const c = await makeCategory(2);
    const a = await staffBooking(c.id, day(40), day(42));
    const b = await staffBooking(c.id, day(41), day(43));
    await assignRoom(db, desk, a.id, c.roomIds[0]!);
    await rejects(assignRoom(db, desk, b.id, c.roomIds[0]!), /is already booked for some of these nights/, "CONFLICT");
  });

  it("refuses rooms under maintenance", async () => {
    const c = await makeCategory(1);
    const broken = await makeRoom(c.id, { serviceStatus: "maintenance" });
    const r = await staffBooking(c.id, day(40), day(41));
    await rejects(assignRoom(db, desk, r.id, broken), /under maintenance/);
  });

  it("allows an upgrade only when the better room type has capacity", async () => {
    const std = await makeCategory(1);
    const suite = await makeCategory(1);
    const r = await staffBooking(std.id, day(40), day(41));
    await assignRoom(db, desk, r.id, suite.roomIds[0]!);
    const r2 = await staffBooking(std.id, day(40), day(41)); // standard is free again after the upgrade
    const extraSuiteRoom = await makeRoom(suite.id);
    await exec("UPDATE rooms SET service_status = 'maintenance' WHERE id = ?", extraSuiteRoom);
    await rejects(assignRoom(db, desk, r2.id, suite.roomIds[0]!), /are free on all of these nights|already booked/);
  });
});

describe("front desk lifecycle", () => {
  it("checks a confirmed, assigned guest into a ready room, then out", async () => {
    const c = await makeCategory(1);
    const r = await insertReservation({ categoryId: c.id, checkIn: day(0), checkOut: day(2), status: "confirmed" });
    await assignRoom(db, desk, r, c.roomIds[0]!);
    await checkInReservation(db, desk, r);
    expect(await status(r)).toBe("checked_in");
    const { balance } = await checkOutReservation(db, desk, r);
    expect(balance).toBe(0);
    expect(await status(r)).toBe("checked_out");
    expect((await q1<{ readiness: string }>("SELECT readiness FROM rooms WHERE id = ?", c.roomIds[0])).readiness).toBe("needs_cleaning");
    const actions = await q<{ action: string; actor_id: string }>("SELECT action, actor_id FROM activity_log WHERE entity_id = ? ORDER BY id", r);
    expect(actions.map((a) => a.action)).toEqual(["reservation.room_assigned", "reservation.checked_in", "reservation.checked_out"]);
    expect(new Set(actions.map((a) => a.actor_id))).toEqual(new Set([desk!.id]));
  });

  it("will not check in before arrival, without a room, unpaid, or into an unready room", async () => {
    const c = await makeCategory(2);
    const future = await insertReservation({ categoryId: c.id, checkIn: day(3), checkOut: day(4), status: "confirmed" });
    await rejects(checkInReservation(db, desk, future), /arrives on .*Check-in opens that day/);
    const noRoom = await insertReservation({ categoryId: c.id, checkIn: day(0), checkOut: day(1), status: "confirmed" });
    await rejects(checkInReservation(db, desk, noRoom), /Assign a room/);
    const unpaid = await insertReservation({ categoryId: c.id, checkIn: day(0), checkOut: day(1) });
    await rejects(checkInReservation(db, desk, unpaid), /awaiting payment/);
    await assignRoom(db, desk, noRoom, c.roomIds[1]!);
    await updateRoomStatus(db, desk, { roomId: c.roomIds[1]!, readiness: "needs_cleaning" });
    await rejects(checkInReservation(db, desk, noRoom), /not marked ready/);
  });

  it("requires a reason to cancel, and only cancels upcoming stays (reason in history)", async () => {
    const c = await makeCategory(1);
    const r = await staffBooking(c.id, day(40), day(41));
    await rejects(cancelReservation(db, desk, r.id, " "), /Give a reason/);
    await cancelReservation(db, desk, r.id, "Guest changed plans");
    await rejects(cancelReservation(db, desk, r.id, "again"), /hasn't started can be cancelled/);
    const h = await q1<{ reason: string; changed_by: string }>("SELECT reason, changed_by FROM reservation_status_history WHERE reservation_id = ? AND to_status = 'cancelled'", r.id);
    expect(h).toEqual({ reason: "Guest changed plans", changed_by: desk!.id });
  });

  it("marks no-shows only once the arrival date has come", async () => {
    const c = await makeCategory(2);
    const future = await insertReservation({ categoryId: c.id, checkIn: day(2), checkOut: day(3), status: "confirmed" });
    await rejects(markNoShow(db, desk, future), /isn't due yet/);
    const due = await insertReservation({ categoryId: c.id, checkIn: day(0), checkOut: day(1), status: "confirmed" });
    await markNoShow(db, desk, due);
    expect(await status(due)).toBe("no_show");
  });

  it("updates guest count within the room type's limit", async () => {
    const c = await makeCategory(1, { maxOccupancy: 2 });
    const r = await staffBooking(c.id, day(40), day(41));
    await rejects(updateReservationDetails(db, desk, r.id, 3, null), /sleeps up to 2/);
    await updateReservationDetails(db, desk, r.id, 2, "Late arrival");
  });

  it("an in-house guest's room can't go into maintenance", async () => {
    const c = await makeCategory(1);
    const r = await insertReservation({ categoryId: c.id, checkIn: day(0), checkOut: day(2), status: "confirmed" });
    await assignRoom(db, desk, r, c.roomIds[0]!);
    await checkInReservation(db, desk, r);
    await rejects(updateRoomStatus(db, desk, { roomId: c.roomIds[0]!, serviceStatus: "maintenance", note: "AC" }), /has a guest checked in/);
  });
});

describe("payment override (managers only, reason required, audited)", () => {
  it("front desk cannot override", async () => {
    const c = await makeCategory(1);
    const r = await staffBooking(c.id, day(40), day(41));
    await rejects(overridePaymentRequirement(db, desk, r.id, "confirm", "Trusted corporate guest"), /role can't do this/, "FORBIDDEN");
  });

  it("nobody can confirm a booking without full payment, not even a manager", async () => {
    const c = await makeCategory(1);
    const r = await staffBooking(c.id, day(40), day(41));
    await rejects(overridePaymentRequirement(db, gm, r.id, "confirm", "Corporate account, invoiced monthly"), /only when paid in full/);
    await rejects(overridePaymentRequirement(db, owner, r.id, "confirm", "Corporate account, invoiced monthly"), /only when paid in full/);
    expect(await status(r.id)).toBe("pending_payment");
  });

  it("extends a hold, and re-checks availability if the hold had already lapsed", async () => {
    const c = await makeCategory(1);
    const r = await staffBooking(c.id, day(40), day(41));
    await lapseHold(r.id);
    await staffBooking(c.id, day(40), day(41)); // someone else took the room
    await rejects(overridePaymentRequirement(db, owner, r.id, "extend", "Guest is sending the transfer now"), /now fully booked/, "UNAVAILABLE");
  });
});

describe("date changes", () => {
  it("re-prices at the agreed rate and checks availability", async () => {
    const c = await makeCategory(1, { rateKobo: 4_000_000 });
    const r = await staffBooking(c.id, day(40), day(41));
    await changeReservationDates(db, desk, r.id, day(40), day(43));
    expect((await q1<{ total_amount_kobo: number }>("SELECT total_amount_kobo FROM reservations WHERE id = ?", r.id)).total_amount_kobo).toBe(12_000_000);
    await staffBooking(c.id, day(45), day(46));
    await rejects(changeReservationDates(db, desk, r.id, day(44), day(46)), /No availability for the new dates/);
  });
});

describe("expiry job", () => {
  it("expires only lapsed holds and logs each one exactly once", async () => {
    const c = await makeCategory(2);
    const lapsed = await staffBooking(c.id, day(40), day(41));
    const live = await staffBooking(c.id, day(40), day(41));
    await lapseHold(lapsed.id);
    expect(await expireUnpaidReservations(db)).toBeGreaterThanOrEqual(1);
    expect(await status(lapsed.id)).toBe("expired");
    expect(await status(live.id)).toBe("pending_payment");
    const logs = await q("SELECT 1 FROM activity_log WHERE entity_id = ? AND action = 'reservation.expired' AND actor_type = 'system'", lapsed.id);
    expect(logs).toHaveLength(1);
    expect(await expireUnpaidReservations(db)).toBe(0);
  });
});

describe("website abuse limits", () => {
  it("allows at most three unpaid website holds per email", async () => {
    const c = await makeCategory(5);
    const email = `limit-${crypto.randomUUID().slice(0, 8)}@example.com`;
    for (let i = 0; i < 3; i++) await website(c.slug, day(60 + i), day(61 + i), { email });
    await rejects(website(c.slug, day(70), day(71), { email }), /already have bookings waiting for payment/, "CONFLICT");
  });
});

describe("concurrent staff actions", () => {
  it("two desks acting on one reservation at once: one wins, the other gets a clear answer", async () => {
    const c = await makeCategory(1);
    const r = await staffBooking(c.id, day(40), day(41));
    const results = await Promise.allSettled([
      cancelReservation(db, desk, r.id, "Desk one cancels"),
      cancelReservation(db, gm, r.id, "Desk two cancels too"),
    ]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await status(r.id)).toBe("cancelled");
    const rejected = results.find((x) => x.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason.message).toMatch(/hasn't started can be cancelled|Only a booking awaiting payment|just changed by someone else/);
  });
});

describe("undo (room assignment and status changes)", () => {
  it("undoes a check-in and a check-out, restoring the room's readiness", async () => {
    const c = await makeCategory(1);
    const r = await insertReservation({ categoryId: c.id, checkIn: day(0), checkOut: day(2), status: "confirmed" });
    await assignRoom(db, desk, r, c.roomIds[0]!);
    const inn = await checkInReservation(db, desk, r);
    expect((await undoAction(db, desk, r, inn.undoId!)).message).toBe("Check-in undone.");
    expect(await status(r)).toBe("confirmed");
    expect((await q1<{ checked_in_at: string | null }>("SELECT checked_in_at FROM reservations WHERE id = ?", r)).checked_in_at).toBeNull();

    await checkInReservation(db, desk, r);
    const out = await checkOutReservation(db, desk, r);
    expect((await q1<{ readiness: string }>("SELECT readiness FROM rooms WHERE id = ?", c.roomIds[0])).readiness).toBe("needs_cleaning");
    await undoAction(db, desk, r, out.undoId!);
    expect(await status(r)).toBe("checked_in");
    expect((await q1<{ readiness: string }>("SELECT readiness FROM rooms WHERE id = ?", c.roomIds[0])).readiness).toBe("ready");
    const h = await q1<{ reason: string; changed_by: string }>(
      "SELECT reason, changed_by FROM reservation_status_history WHERE reservation_id = ? ORDER BY id DESC LIMIT 1", r);
    expect(h).toEqual({ reason: "Undone", changed_by: desk!.id });
  });

  it("undoes a room assignment and a no-show", async () => {
    const c = await makeCategory(2);
    const r = await insertReservation({ categoryId: c.id, checkIn: day(0), checkOut: day(1), status: "confirmed" });
    const a = await assignRoom(db, desk, r, c.roomIds[0]!);
    await undoAction(db, desk, r, a.undoId!);
    expect((await q1<{ room_id: string | null }>("SELECT room_id FROM reservations WHERE id = ?", r)).room_id).toBeNull();
    const ns = await markNoShow(db, desk, r);
    await undoAction(db, desk, r, ns.undoId!);
    expect(await status(r)).toBe("confirmed");
  });

  it("only the same person, only straight away, and only if nothing happened since", async () => {
    const c = await makeCategory(2);
    const r = await insertReservation({ categoryId: c.id, checkIn: day(0), checkOut: day(2), status: "confirmed" });
    const a = await assignRoom(db, desk, r, c.roomIds[0]!);
    await rejects(undoAction(db, gm, r, a.undoId!), /Only the person who made a change/, "FORBIDDEN");
    await updateReservationDetails(db, desk, r, 1, "Late arrival");
    await rejects(undoAction(db, desk, r, a.undoId!), /can no longer be undone/);

    const b = await insertReservation({ categoryId: c.id, checkIn: day(0), checkOut: day(1), status: "confirmed" });
    const late = await assignRoom(db, desk, b, c.roomIds[1]!);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + UNDO_WINDOW_MS + 1_000);
    try {
      await rejects(undoAction(db, desk, b, late.undoId!), /can no longer be undone/);
    } finally {
      vi.useRealTimers();
    }
    await rejects(undoAction(db, desk, b, 999_999_999), /can no longer be undone/);
  });

  it("never reverses a cancellation, and the database refuses backwards moves that aren't undos", async () => {
    const c = await makeCategory(1);
    const r = await insertReservation({ categoryId: c.id, checkIn: day(0), checkOut: day(2), status: "confirmed" });
    await assignRoom(db, desk, r, c.roomIds[0]!);
    await checkInReservation(db, desk, r);
    await rejects(exec("UPDATE reservations SET status = 'confirmed' WHERE id = ?", r), /invalid_transition/);
    const x = await insertReservation({ categoryId: c.id, checkIn: day(5), checkOut: day(6) });
    await cancelReservation(db, desk, x, "Guest changed plans");
    const log = await q1<{ id: number }>("SELECT id FROM activity_log WHERE entity_id = ? AND action = 'reservation.cancelled'", x);
    await rejects(undoAction(db, desk, x, log.id), /can no longer be undone/);
  });

  it("can't undo a room assignment if the old room has been taken since", async () => {
    const c = await makeCategory(2);
    const r = await insertReservation({ categoryId: c.id, checkIn: day(3), checkOut: day(5), status: "confirmed" });
    await assignRoom(db, desk, r, c.roomIds[0]!);
    const move = await assignRoom(db, desk, r, c.roomIds[1]!);
    await insertReservation({ categoryId: c.id, checkIn: day(3), checkOut: day(5), roomId: c.roomIds[0], status: "confirmed" });
    await rejects(undoAction(db, desk, r, move.undoId!), /given to another guest|filled up/);
  });
});

describe("free nights (for suggesting other dates)", () => {
  it("says yes or no per night per type, counting live bookings only", async () => {
    const c = await makeCategory(1);
    await insertReservation({ categoryId: c.id, checkIn: day(60), checkOut: day(62), status: "confirmed" });
    const gone = await insertReservation({ categoryId: c.id, checkIn: day(63), checkOut: day(64), status: "confirmed" });
    await exec("UPDATE reservations SET status = 'cancelled' WHERE id = ?", gone);
    const free = (await freeNights(db, [c.slug], day(59), day(65))).get(c.slug)!;
    expect([59, 60, 61, 62, 63, 64].map((n) => free.get(day(n)))).toEqual([true, false, false, true, true, true]);
    expect((await freeNights(db, [], day(1), day(2))).size).toBe(0);
  });
});
