// The owner's phone dashboard (FUNCTIONALITY.md section 12): view only, owner only.
import { describe, expect, it } from "vitest";
import { ownerSnapshot } from "@/server/domain/owner";
import { recordOfflinePayment } from "@/server/domain/payments";
import { day, db, desk, gm, insertReservation, makeCategory, owner, rejects } from "./helpers";

describe("owner's phone dashboard", () => {
  it("is for the owner only and counts today's takings and tonight's rooms", async () => {
    await rejects(ownerSnapshot(db, gm), /for the owner/);
    const before = await ownerSnapshot(db, owner);
    const c = await makeCategory(1, { rateKobo: 5_000_000 });
    const r = await insertReservation({ categoryId: c.id, checkIn: day(0), checkOut: day(1), rateKobo: 5_000_000, roomId: c.roomIds[0], status: "confirmed", unpaid: true });
    await recordOfflinePayment(db, desk, { reservationId: r, amountKobo: 5_000_000, method: "cash", paidOn: day(0), confirmReceived: true });
    const after = await ownerSnapshot(db, owner);
    expect(after.takenTodayKobo - before.takenTodayKobo).toBe(5_000_000);
    expect(after.occupancy.rooms - before.occupancy.rooms).toBe(1);
    expect(after.week).toHaveLength(7);
  });
});
