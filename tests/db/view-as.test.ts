import { describe, expect, it } from "vitest";
import { createWebsiteReservation } from "@/server/domain/reservations";
import { recordOfflinePayment } from "@/server/domain/payments";
import { updateRoomStatus } from "@/server/domain/reservations";
import { listPaymentsFor } from "@/server/domain/payment-list";
import { day, db, makeCategory, owner, q1 } from "./helpers";

const viewingAs = { id: owner!.id, role: "front_desk" as const, readOnly: true };

describe("viewing as front desk", () => {
  it("refuses a payment and stores nothing", async () => {
    const c = await makeCategory(1, { rateKobo: 10_000_000 });
    const r = await createWebsiteReservation(db, {
      categorySlug: c.slug, checkIn: day(60), checkOut: day(61), guests: 1, fullName: "View As Guest",
      email: `viewas-${crypto.randomUUID().slice(0, 8)}@example.com`, phone: "+2348000000009",
    });
    await expect(
      recordOfflinePayment(db, viewingAs, { reservationId: r.id, amountKobo: 10_000_000, method: "cash", paidOn: day(0), confirmReceived: true }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const n = await q1<{ n: number }>("SELECT count(*) AS n FROM payments WHERE reservation_id = ? AND provider = 'offline'", r.id);
    expect(n.n).toBe(0);
  });

  it("refuses a room status change", async () => {
    const c = await makeCategory(1);
    await expect(updateRoomStatus(db, viewingAs, { roomId: c.roomIds[0]!, readiness: "needs_cleaning" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const room = await q1<{ readiness: string }>("SELECT readiness FROM rooms WHERE id = ?", c.roomIds[0]!);
    expect(room.readiness).not.toBe("needs_cleaning");
  });

  it("can still read, with front-desk scope", async () => {
    const { view } = await listPaymentsFor(db, viewingAs, { view: "all" });
    expect(view).toBe("today");
  });
});
