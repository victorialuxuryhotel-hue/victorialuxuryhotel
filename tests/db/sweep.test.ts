// The scheduled job asks Paystack about pending payments. Payments already flagged for a mismatch
// wait for a person; they must not fill the batch and starve newer payments.
import { describe, expect, it } from "vitest";
import { MISMATCH_FLAG, paymentsToSweep } from "@/server/domain/payments";
import { day, db, exec, insertReservation, iso, makeCategory } from "./helpers";

async function pending(reservationId: string, minutesAgo: number, flagged = false) {
  const ref = `vl-sweep-${crypto.randomUUID().slice(0, 12)}`;
  await exec(
    `INSERT INTO payments (id, reservation_id, amount_kobo, provider, method, provider_reference, status, gateway_response, created_at)
     VALUES (?, ?, 5000000, 'paystack', 'card', ?, 'pending', ?, ?)`,
    crypto.randomUUID(), reservationId, ref, flagged ? `${MISMATCH_FLAG}: expected 5000000 NGN, Paystack reported 1 NGN` : null, iso(-minutesAgo * 60_000),
  );
  return ref;
}

describe("scheduled payment check", () => {
  it("skips payments flagged for a mismatch, and very new ones", async () => {
    const c = await makeCategory(1);
    const r = await insertReservation({ categoryId: c.id, checkIn: day(300), checkOut: day(301), holdMinutes: 600 });
    const flagged = await pending(r, 120, true);
    const normal = await pending(r, 90);
    const fresh = await pending(r, 5);
    const picked = await paymentsToSweep(db, Date.now(), 10_000);
    expect(picked).toContain(normal);
    expect(picked).not.toContain(flagged);
    expect(picked).not.toContain(fresh);
  });
});
