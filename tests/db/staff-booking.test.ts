import { describe, expect, it } from "vitest";
import { availabilityForStay, findGuestsByPhone } from "@/server/domain/staff-booking";
import { createStaffReservation } from "@/server/domain/reservations";
import { day, db, desk, exec, makeCategory, q1, rejects } from "./helpers";

describe("new reservation helpers (6d)", () => {
  it("finds a returning guest by phone typed in another format, from 7 digits", async () => {
    const id = crypto.randomUUID();
    const n = String(Math.floor(1_000_000 + Math.random() * 8_999_999));
    await exec("INSERT INTO guests (id, full_name, email, phone) VALUES (?, 'Phone Match', ?, ?)", id, `pm-${n}@example.com`, `+234 803 ${n.slice(0, 3)} ${n.slice(3)}`);
    const found = await findGuestsByPhone(db, desk, `0803${n}`);
    expect(found.map((g) => g.id)).toContain(id);
    expect(await findGuestsByPhone(db, desk, "0803")).toEqual([]);
  });

  it("shows free rooms per type for the dates, and a type full for tonight", async () => {
    const c = await makeCategory(1);
    const before = (await availabilityForStay(db, desk, day(70), day(71))).find((a) => a.categoryId === c.id);
    expect(before?.free).toBe(1);
    await createStaffReservation(db, desk, { categoryId: c.id, checkIn: day(70), checkOut: day(71), guests: 1, source: "walk_in", fullName: "Full Tonight", phone: "+2348000000011" });
    const after = (await availabilityForStay(db, desk, day(70), day(71))).find((a) => a.categoryId === c.id);
    expect(after?.free).toBe(0);
  });

  it("staff pick a specific free room; it's booked with that room and drops off the list", async () => {
    const c = await makeCategory(2);
    const other = await makeCategory(1);
    const list = (await availabilityForStay(db, desk, day(80), day(82))).find((a) => a.categoryId === c.id)!;
    expect(list.rooms.map((r) => r.id).sort()).toEqual([...c.roomIds].sort());
    const base = { categoryId: c.id, checkIn: day(80), checkOut: day(82), guests: 1, source: "walk_in" as const, fullName: "Room Pick", phone: "+2348000000012" };
    await rejects(createStaffReservation(db, desk, { ...base, roomId: other.roomIds[0] }), /Choose a/);
    const r = await createStaffReservation(db, desk, { ...base, roomId: c.roomIds[1] });
    expect((await q1<{ room_id: string }>("SELECT room_id FROM reservations WHERE id = ?", r.id)).room_id).toBe(c.roomIds[1]);
    const after = (await availabilityForStay(db, desk, day(80), day(82))).find((a) => a.categoryId === c.id)!;
    expect(after.rooms.map((x) => x.id)).toEqual([c.roomIds[0]]);
    await rejects(createStaffReservation(db, desk, { ...base, roomId: c.roomIds[1] }), /just booked/);
  });
});
