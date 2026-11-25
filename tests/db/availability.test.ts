// One definition of "free" (inventory.ts freeOnNightSql): every screen that shows availability must
// agree for the same night, and the database must refuse the booking the screens say can't be made.
import { describe, expect, it, vi } from "vitest";
import { businessDaySql, tonight } from "@/lib/hotel-date";
import { recordOfflinePayment } from "@/server/domain/payments";
import { checkInReservation, createStaffReservation } from "@/server/domain/reservations";
import { availabilityForStay } from "@/server/domain/staff-booking";
import { freeNights, freeUnits, searchAvailability, validateStay } from "@/server/domain/inventory";
import { day, db, desk, exec, insertReservation, makeCategory, makeRoom, q1, rejects, status } from "./helpers";

/** Three rooms in service and one out of order; an overstaying guest in the first; an unpaid hold for tonight. */
async function busyNight() {
  const c = await makeCategory(3);
  await makeRoom(c.id, { serviceStatus: "maintenance" });
  const stay = await insertReservation({ categoryId: c.id, checkIn: day(-4), checkOut: day(-2), roomId: c.roomIds[0], status: "confirmed" });
  await exec("UPDATE reservations SET status = 'checked_in' WHERE id = ?", stay);
  await insertReservation({ categoryId: c.id, checkIn: day(0), checkOut: day(1) });
  return c;
}

async function readers(categoryId: string, slug: string, from: string, to: string) {
  const [units, form, site, nights] = await Promise.all([
    freeUnits(db, categoryId, from, to),
    availabilityForStay(db, desk, from, to),
    searchAvailability(db, from, to, 1),
    freeNights(db, [slug], from, to),
  ]);
  return {
    units,
    form: form.find((a) => a.categoryId === categoryId)!.free,
    site: site.find((r) => r.category_id === categoryId)!.is_available,
    calendar: nights.get(slug)!.get(from),
  };
}

const slugOf = async (id: string) => (await db.prepare("SELECT slug FROM room_categories WHERE id = ?").bind(id).first<{ slug: string }>())!.slug;

describe("availability agrees everywhere", () => {
  it("tonight: out-of-order rooms, an overstaying guest and an unpaid hold all count the same way", async () => {
    const c = await busyNight();
    const slug = await slugOf(c.id);
    expect(await readers(c.id, slug, day(0), day(1))).toEqual({ units: 1, form: 1, site: true, calendar: true });

    await createStaffReservation(db, desk, { categoryId: c.id, checkIn: day(0), checkOut: day(1), guests: 1, source: "walk_in", fullName: "Last Room", phone: "+2348000000031" });
    expect(await readers(c.id, slug, day(0), day(1))).toEqual({ units: 0, form: 0, site: false, calendar: false });

    // And the database agrees on its own (trigger reservations_capacity_insert): a write that skips
    // the app's check, like a second receptionist's stale form, is refused.
    await rejects(insertReservation({ categoryId: c.id, checkIn: day(0), checkOut: day(1) }), /no_capacity/);
  });

  it("a stay is only as free as its tightest night", async () => {
    const c = await makeCategory(1);
    const slug = await slugOf(c.id);
    await insertReservation({ categoryId: c.id, checkIn: day(91), checkOut: day(92), status: "confirmed" });
    expect(await readers(c.id, slug, day(90), day(93))).toEqual({ units: 0, form: 0, site: false, calendar: true });
    expect((await freeNights(db, [slug], day(90), day(93))).get(slug)).toEqual(
      new Map([[day(90), true], [day(91), false], [day(92), true]]),
    );
  });
});

describe("tonight runs until the 06:00 cut-off (decision 25 Nov)", () => {
  it("a 2am walk-in books last night, pays for it and checks in", async () => {
    const c = await makeCategory(1);
    const [before, last, next] = [day(-1), day(0), day(1)]; // read before the clock is moved
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${next}T01:00:00Z`)); // 02:00 Lagos on `next`
    try {
      expect(tonight()).toBe(last);
      expect(() => validateStay(before, last, 1)).toThrow(/in the past/);
      const r = await createStaffReservation(db, desk, { categoryId: c.id, checkIn: last, checkOut: next, guests: 1, source: "walk_in", fullName: "Two Am", phone: "+2348000000033" });
      const { total } = await q1<{ total: number }>("SELECT total_amount_kobo AS total FROM reservations WHERE id = ?", r.id);
      await recordOfflinePayment(db, desk, { reservationId: r.id, amountKobo: total, method: "cash", paidOn: next, confirmReceived: true });
      await checkInReservation(db, desk, r.id);
      expect(await status(r.id)).toBe("checked_in");
    } finally {
      vi.useRealTimers();
    }
  });

  it("the capacity triggers count nights from the same business date as the app", async () => {
    const { results } = await db.prepare("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'reservations_capacity_%'").all<{ sql: string }>();
    expect(results).toHaveLength(2);
    for (const t of results) expect(t.sql).toContain(`max(NEW.check_in, ${businessDaySql("'now'")})`);
  });
});
