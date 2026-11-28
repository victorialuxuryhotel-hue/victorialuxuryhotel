import { describe, expect, it } from "vitest";
import { bookingListWhere, bookingStatuses, bookingTabCounts, type ReservationTab } from "@/server/domain/booking-list";
import type { ReservationStatus } from "@/domain/status";
import { hotelToday } from "@/lib/hotel-date";
import { day, db, exec, insertReservation, makeCategory, makeGuest, q } from "./helpers";

/** The booking ids a tab and status filter would list, for one guest only (the test database is shared). */
async function listed(guestId: string, tab: ReservationTab, statuses: ReservationStatus[] = []) {
  const { where, params } = bookingListWhere(tab, statuses, hotelToday());
  const rows = await q<{ id: string }>(`SELECT r.id FROM reservations r WHERE ${where.join(" AND ")} AND r.guest_id = ? ORDER BY r.id`, ...params, guestId);
  return rows.map((r) => r.id).sort();
}

describe("Bookings tabs and the status filter", () => {
  it("Past holds checked-out and no-show bookings; Cancelled holds cancelled and expired ones", async () => {
    const c = await makeCategory(3);
    const guestId = await makeGuest();
    const before = await bookingTabCounts(db, hotelToday());
    const make = (checkIn: number, checkOut: number, roomId?: string) =>
      insertReservation({ categoryId: c.id, guestId, checkIn: day(checkIn), checkOut: day(checkOut), status: "confirmed", roomId });
    const upcoming = await make(5, 7);
    const out = await make(-4, -2, c.roomIds[0]);
    await exec("UPDATE reservations SET status = 'checked_in' WHERE id = ?", out);
    await exec("UPDATE reservations SET status = 'checked_out', checked_out_at = ? WHERE id = ?", new Date().toISOString(), out);
    const noShow = await make(-3, -1);
    await exec("UPDATE reservations SET status = 'no_show' WHERE id = ?", noShow);
    const cancelled = await make(8, 9);
    await exec("UPDATE reservations SET status = 'cancelled' WHERE id = ?", cancelled);
    const expired = await insertReservation({ categoryId: c.id, guestId, checkIn: day(10), checkOut: day(11) });
    await exec("UPDATE reservations SET status = 'expired' WHERE id = ?", expired);

    expect(await listed(guestId, "past")).toEqual([out, noShow].sort());
    expect(await listed(guestId, "cancelled")).toEqual([cancelled, expired].sort());
    expect(await listed(guestId, "upcoming")).toEqual([upcoming]);
    expect(await listed(guestId, "all")).toHaveLength(5);

    const after = await bookingTabCounts(db, hotelToday());
    expect(after.past - before.past).toBe(2);
    expect(after.cancelled - before.cancelled).toBe(2);
    expect(after.upcoming - before.upcoming).toBe(1);

    // Several statuses at once, inside a tab or across all bookings.
    expect(await listed(guestId, "all", ["cancelled", "no_show"])).toEqual([cancelled, noShow].sort());
    expect(await listed(guestId, "past", ["no_show"])).toEqual([noShow]);
    expect(await listed(guestId, "cancelled", ["confirmed"])).toEqual([]);
  });

  it("reads the status filter from the address and drops anything that isn't a status", () => {
    expect(bookingStatuses("checked_in,confirmed")).toEqual(["confirmed", "checked_in"]);
    expect(bookingStatuses(["cancelled", "no_show,cancelled"])).toEqual(["cancelled", "no_show"]);
    expect(bookingStatuses("confirmed,1) OR 1=1 --,bogus")).toEqual(["confirmed"]);
    expect(bookingStatuses(undefined)).toEqual([]);
    expect(bookingStatuses("")).toEqual([]);
  });
});
