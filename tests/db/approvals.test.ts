// Approvals: refunds and exceptions (FUNCTIONALITY.md section 7, design X10).
import { describe, expect, it } from "vitest";
import { decideOwing, decideRefund, listApprovals } from "@/server/domain/approvals";
import { checkOutGuest, requestRefund } from "@/server/domain/front-desk";
import { recordOfflinePayment } from "@/server/domain/payments";
import { paymentsToConfirm } from "@/server/domain/payment-checks";
import { markNoShow, netPaid } from "@/server/domain/reservations";
import { day, db, desk, exec, gm, insertReservation, makeCategory, owner, q1, rejects } from "./helpers";

async function stayPaidFor(nights: number, checkInOffset = 0) {
  const c = await makeCategory(1, { rateKobo: 5_000_000 });
  const r = await insertReservation({ categoryId: c.id, checkIn: day(checkInOffset), checkOut: day(checkInOffset + nights), rateKobo: 5_000_000, roomId: c.roomIds[0], status: "confirmed", unpaid: true });
  await recordOfflinePayment(db, desk, { reservationId: r, amountKobo: 5_000_000 * nights, method: "cash", paidOn: day(0), confirmReceived: true });
  return r;
}

describe("approvals: refunds", () => {
  it("approving creates a refund payment of the amount; it can't be more than paid less used; a reason is required", async () => {
    const r = await stayPaidFor(3);
    await exec("UPDATE reservations SET status = 'checked_in' WHERE id = ?", r);
    const id = await requestRefund(db, desk, { reservationId: r, amountKobo: 6_000_000, method: "bank_transfer", reason: "Leaving early" });
    expect((await listApprovals(db, gm, "waiting")).find((a) => a.id === id)).toMatchObject({ kind: "refund", amountKobo: 6_000_000, askedBy: "Dev Front Desk" });
    await rejects(listApprovals(db, desk, "waiting"), /Only the General Manager or the Owner/, "FORBIDDEN");
    await rejects(decideRefund(db, gm, { id, approve: true, note: "" }), /Give a reason/);
    await rejects(decideRefund(db, gm, { id, approve: true, amountKobo: 6_000_100, note: "Family emergency" }), /At most ₦60,000/);
    const before = await netPaid(db, r);
    await decideRefund(db, gm, { id, approve: true, amountKobo: 5_000_000, note: "Family emergency" });
    expect(before - (await netPaid(db, r))).toBe(5_000_000);
    expect(await q1("SELECT decision, decided_by FROM refund_requests WHERE id = ?", id)).toEqual({ decision: "approved", decided_by: gm!.id });
    await rejects(decideRefund(db, owner, { id, approve: false, note: "Changed mind" }), /already decided/, "CONFLICT");
    // A refund by transfer goes through Payments to confirm; the GM who paid it can't confirm it.
    const listed = (await paymentsToConfirm(db, owner)).find((p) => p.reservation_id === r && p.who.startsWith("Refund to"));
    expect(listed).toMatchObject({ amount_kobo: 5_000_000, taken_by_id: gm!.id });
  });

  it("the requester can't approve their own refund; a decline is kept with its reason", async () => {
    const r = await stayPaidFor(2);
    await exec("UPDATE reservations SET status = 'checked_in' WHERE id = ?", r);
    const id = await requestRefund(db, gm, { reservationId: r, amountKobo: 1_000_000, method: "cash", reason: "Noise complaint" });
    await rejects(decideRefund(db, gm, { id, approve: true, note: "Fine by me" }), /another manager or the owner decides/, "FORBIDDEN");
    await decideRefund(db, owner, { id, approve: false, note: "Room was moved instead" });
    expect((await listApprovals(db, owner, "declined")).find((a) => a.id === id)).toMatchObject({ note: "Room was moved instead" });
  });

  it("a no-show puts everything after the first night forward as a refund to decide", async () => {
    const r = await stayPaidFor(3, -1);
    await markNoShow(db, desk, r);
    const item = (await listApprovals(db, gm, "waiting")).find((a) => a.reservationId === r);
    expect(item).toMatchObject({ kind: "no_show", amountKobo: 10_000_000 });
    await rejects(decideRefund(db, gm, { id: item!.id, approve: true, amountKobo: 10_000_100, note: "Policy" }), /At most ₦100,000/);
    await decideRefund(db, gm, { id: item!.id, approve: true, note: "Policy: first night kept" });
    expect(await netPaid(db, r)).toBe(5_000_000);
  });
});

describe("approvals: leave owing", () => {
  it("the GM or owner agrees or asks to chase; not the person who let the guest go", async () => {
    const r = await stayPaidFor(2, -1);
    await exec("UPDATE reservations SET status = 'checked_in' WHERE id = ?", r);
    await exec("UPDATE reservations SET extras_kobo = 1000000 WHERE id = ?", r);
    await checkOutGuest(db, gm, r, { keyReturned: true, leaveOwingReason: "Company pays Friday" });
    const item = (await listApprovals(db, owner, "waiting")).find((a) => a.kind === "leave_owing" && a.reservationId === r);
    expect(item).toMatchObject({ amountKobo: 1_000_000 });
    await rejects(decideOwing(db, gm, { reservationId: r, approve: true, note: "Agreed with HR" }), /another manager or the owner decides/);
    await decideOwing(db, owner, { reservationId: r, approve: true, note: "Agreed with their HR" });
    expect(await q1("SELECT owing_decision FROM reservations WHERE id = ?", r)).toEqual({ owing_decision: "agreed" });
  });
});
