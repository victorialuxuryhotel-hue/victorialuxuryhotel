import { describe, expect, it } from "vitest";
import { guestSort, listGuestRecords } from "@/server/domain/guest-list";
import { db, day, exec, insertReservation, makeCategory } from "./helpers";

describe("Guests list sort", () => {
  it("most recent first goes by the last stay, or the day added for someone who hasn't stayed; Name A–Z by name", async () => {
    const tag = `Srt${crypto.randomUUID().slice(0, 6)}`;
    const c = await makeCategory(2);
    const guest = async (name: string, createdAt: string) => {
      const id = crypto.randomUUID();
      await exec("INSERT INTO guests (id, full_name, created_at, updated_at) VALUES (?, ?, ?, ?)", id, `${name} ${tag}`, createdAt, createdAt);
      return id;
    };
    const stay = async (guestId: string, checkIn: number, roomId: string) => {
      const id = await insertReservation({ categoryId: c.id, guestId, roomId, checkIn: day(checkIn), checkOut: day(checkIn + 1), status: "confirmed" });
      await exec("UPDATE reservations SET status = 'checked_in' WHERE id = ?", id);
    };
    // Added long ago but stayed yesterday; added a week ago, never stayed; added recently, stayed a month ago.
    const ada = await guest("ada", `${day(-400)}T09:00:00.000Z`);
    await stay(ada, -1, c.roomIds[0]!);
    const bola = await guest("Bola", `${day(-7)}T09:00:00.000Z`);
    const chi = await guest("Chi", `${day(-2)}T09:00:00.000Z`);
    await stay(chi, -30, c.roomIds[1]!);

    const recent = await listGuestRecords(db, { q: tag, sort: "recent" });
    expect(recent.map((g) => g.id)).toEqual([ada, bola, chi]);
    const byName = await listGuestRecords(db, { q: tag, sort: "name" });
    expect(byName.map((g) => g.id)).toEqual([ada, bola, chi]); // "ada" sorts with "A", not after "Z"
    await exec("UPDATE guests SET full_name = ? WHERE id = ?", `Zainab ${tag}`, ada);
    expect((await listGuestRecords(db, { q: tag, sort: "name" })).map((g) => g.id)).toEqual([bola, chi, ada]);
  });

  it("anything but name in the address means most recent first", () => {
    expect([guestSort("name"), guestSort("recent"), guestSort("x; DROP"), guestSort(undefined)]).toEqual(["name", "recent", "recent", "recent"]);
  });
});
