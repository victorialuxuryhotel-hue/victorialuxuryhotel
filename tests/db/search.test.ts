// Interface brief I9: global search finds guests, bookings and rooms, 5 at most each, and only the
// groups a role can open.
import { describe, expect, it } from "vitest";
import { globalSearch, SEARCH_LIMIT } from "@/server/domain/search";
import { day, db, exec, insertReservation, makeCategory, q1 } from "./helpers";

const all3 = { guests: true, bookings: true, rooms: true };

describe("global search", () => {
  it("finds a booking by reference or guest name, a guest by phone typed another way, and a room by number", async () => {
    const c = await makeCategory(1);
    const tag = `Zq${crypto.randomUUID().slice(0, 5)}`;
    const n = String(Math.floor(1_000_000 + Math.random() * 8_999_999));
    const guest = crypto.randomUUID();
    await exec("INSERT INTO guests (id, full_name, phone) VALUES (?, ?, ?)", guest, `Ada ${tag}`, `+234 803 ${n.slice(0, 3)} ${n.slice(3)}`);
    const r = await insertReservation({ categoryId: c.id, checkIn: day(40), checkOut: day(41), guestId: guest });
    const { reference } = await q1<{ reference: string }>("SELECT reference FROM reservations WHERE id = ?", r);
    const { room_number } = await q1<{ room_number: string }>("SELECT room_number FROM rooms WHERE id = ?", c.roomIds[0]);

    expect((await globalSearch(db, all3, reference)).bookings.map((b) => b.id)).toEqual([r]);
    expect((await globalSearch(db, all3, reference.slice(3).toLowerCase())).bookings.map((b) => b.id)).toContain(r);
    expect((await globalSearch(db, all3, tag)).bookings.map((b) => b.id)).toContain(r);
    expect((await globalSearch(db, all3, `0803${n}`)).guests.map((g) => g.id)).toContain(guest);
    expect((await globalSearch(db, all3, room_number)).rooms.map((x) => x.number)).toContain(room_number);
  });

  it("only searches what the role can open", async () => {
    const res = await globalSearch(db, { guests: false, bookings: true, rooms: false }, "Room");
    expect(res.guests).toEqual([]);
    expect(res.rooms).toEqual([]);
  });

  it("at most 5 per group, nothing for one letter, and wildcards are plain text", async () => {
    const tag = `Wq${crypto.randomUUID().slice(0, 5)}`;
    for (let i = 0; i < 7; i++) await exec("INSERT INTO guests (id, full_name) VALUES (?, ?)", crypto.randomUUID(), `${tag} Guest ${i}`);
    expect((await globalSearch(db, all3, tag)).guests).toHaveLength(SEARCH_LIMIT);
    expect(await globalSearch(db, all3, "a")).toEqual({ guests: [], bookings: [], rooms: [] });
    expect((await globalSearch(db, all3, "%%")).guests).toEqual([]);
  });
});
