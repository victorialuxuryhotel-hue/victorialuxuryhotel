// FUNCTIONALITY.md section 2: declined-but-debited, the duplicate guard at the till, and receipt numbering.
import { describe, expect, it } from "vitest";
import type { Actor } from "@/server/db";
import { AppError } from "@/lib/errors";
import { openPaymentIssues, reportPaymentIssue, resolvePaymentIssue, updatePaymentSettings } from "@/server/domain/payment-details";
import { recordOfflinePayment } from "@/server/domain/payments";
import { payOrder, saveMenuItem, saveOrder } from "@/server/domain/pos";
import { day, db, desk, exec, gm, insertReservation, makeCategory, owner, q, q1, rejects } from "./helpers";

const rand = () => crypto.randomUUID().slice(0, 8);

async function seller(): Promise<NonNullable<Actor>> {
  const id = crypto.randomUUID();
  await exec(
    "INSERT INTO staff_profiles (id, full_name, email, role, department, department_lead) VALUES (?, ?, ?, 'front_desk', 'restaurant_bar', 0)",
    id, `Seller ${rand()}`, `s-${rand()}@example.com`,
  );
  return { id, role: "restaurant_bar" };
}

async function unpaidBooking() {
  const c = await makeCategory(1, { rateKobo: 5_000_000 });
  return insertReservation({ categoryId: c.id, checkIn: day(40), checkOut: day(41), rateKobo: 5_000_000 });
}

describe("declined but the guest was debited", () => {
  it("writes nothing to payments; the GM and owner see it to check with the bank", async () => {
    const r = await unpaidBooking();
    const before = (await q("SELECT id FROM payments WHERE reservation_id = ?", r)).length;
    const id = await reportPaymentIssue(db, desk, { sourceType: "reservation", sourceId: r, amountKobo: 5_000_000, terminal: "Front desk terminal", slipLast4: "4417" });
    expect((await q("SELECT id FROM payments WHERE reservation_id = ?", r)).length).toBe(before);
    expect((await openPaymentIssues(db, gm)).find((i) => i.id === id)).toMatchObject({ amount_kobo: 5_000_000, slip_last4: "4417", source_type: "reservation" });
    await rejects(openPaymentIssues(db, desk), /role can't do this/, "FORBIDDEN");
  });

  it("closing it: not by whoever reported it; 'money arrived' needs the receipt of the payment recorded for it", async () => {
    const r = await unpaidBooking();
    const id = await reportPaymentIssue(db, gm, { sourceType: "reservation", sourceId: r, amountKobo: 5_000_000 });
    await rejects(resolvePaymentIssue(db, gm, { id, outcome: "not_debited", note: "Bank says no debit" }), /You reported this one/, "FORBIDDEN");
    await rejects(resolvePaymentIssue(db, owner, { id, outcome: "money_arrived", receipt: "RCT-0000-000000" }), /Record the payment/);
    const paid = await recordOfflinePayment(db, gm, { reservationId: r, amountKobo: 5_000_000, method: "pos_terminal", slipLast4: "4417", terminal: "Front desk terminal", paidOn: day(0), confirmReceived: true, duplicateOk: true });
    await resolvePaymentIssue(db, owner, { id, outcome: "money_arrived", receipt: paid.receiptNumber });
    expect(await q1("SELECT outcome, payment_id FROM payment_issues WHERE id = ?", id)).toEqual({ outcome: "money_arrived", payment_id: paid.paymentId });
    await rejects(resolvePaymentIssue(db, owner, { id, outcome: "not_debited", note: "again" }), /already closed/, "CONFLICT");
    await rejects(exec("UPDATE payment_issues SET amount_kobo = 1 WHERE id = ?", id), /payment_issue_closed/);
    await rejects(exec("DELETE FROM payment_issues WHERE id = ?", id), /history_immutable/);
  });

  it("other outcomes need a note saying what the bank said", async () => {
    const r = await unpaidBooking();
    const id = await reportPaymentIssue(db, desk, { sourceType: "reservation", sourceId: r, amountKobo: 1_000_000 });
    await rejects(resolvePaymentIssue(db, gm, { id, outcome: "refunded_by_bank" }), /what the bank told you/);
    await resolvePaymentIssue(db, gm, { id, outcome: "refunded_by_bank", note: "Moniepoint reversed it on 28 Nov" });
    expect((await openPaymentIssues(db, gm)).some((i) => i.id === id)).toBe(false);
  });

  it("at the till the order stays unpaid", async () => {
    const s = await seller();
    const item = await saveMenuItem(db, owner, { name: `Chapman ${rand()}`, outlet: "bar", category: "soft_drinks", priceKobo: 350_000, available: true, active: true });
    const order = await saveOrder(db, s, { id: crypto.randomUUID(), outlet: "bar", lines: [{ menuItemId: item, quantity: 2 }] });
    await reportPaymentIssue(db, s, { sourceType: "pos_order", sourceId: order.id, amountKobo: 700_000, terminal: "Bar terminal" });
    expect(await q1("SELECT status, receipt_number FROM pos_orders WHERE id = ?", order.id)).toEqual({ status: "open", receipt_number: null });
    await rejects(reportPaymentIssue(db, desk, { sourceType: "pos_order", sourceId: order.id, amountKobo: 700_000 }), /role can't do this/, "FORBIDDEN");
  });
});

describe("the duplicate guard at the till", () => {
  it("warns when the same slip digits and amount were used in the last 7 days; Record anyway records it", async () => {
    const s = await seller();
    const item = await saveMenuItem(db, owner, { name: `Zobo ${rand()}`, outlet: "bar", category: "soft_drinks", priceKobo: 123_400, available: true, active: true });
    const sale = () => ({ id: crypto.randomUUID(), outlet: "bar" as const, lines: [{ menuItemId: item, quantity: 1 }], method: "pos_terminal" as const, slipLast4: "9031", terminal: "Bar terminal" });
    await payOrder(db, s, sale());
    const err = (await payOrder(db, s, sale()).catch((e: unknown) => e)) as AppError;
    expect(err.fieldErrors?.duplicate?.[0]).toMatch(/slip ending 9031 .* already recorded/);
    expect((await payOrder(db, s, { ...sale(), duplicateOk: true })).receiptNumber).toMatch(/^RB-/);
  });
});

describe("payment details in settings", () => {
  it("the bank details are optional (placeholders show), the account number is 10 digits, and there's at least one terminal", async () => {
    await rejects(updatePaymentSettings(db, desk, { bankName: null, bankAccountNumber: null, bankAccountName: null, terminals: ["X1"] }), /role can't do this/, "FORBIDDEN");
    await rejects(updatePaymentSettings(db, gm, { bankName: "GTB", bankAccountNumber: "12345", bankAccountName: null, terminals: ["Bar terminal"] }), /10 digits/);
    await rejects(updatePaymentSettings(db, gm, { bankName: null, bankAccountNumber: null, bankAccountName: null, terminals: [" "] }), /at least one POS terminal/);
    await updatePaymentSettings(db, gm, { bankName: null, bankAccountNumber: null, bankAccountName: null, terminals: ["Front desk terminal", "Bar terminal", "Bar terminal"] });
    expect(await q1("SELECT bank_name, terminals FROM hotel_settings WHERE id = 1")).toEqual({ bank_name: null, terminals: '["Front desk terminal","Bar terminal"]' });
  });
});

describe("receipt numbers", () => {
  it("stay sequential and never repeat when several desk payments are saved at the same moment", async () => {
    const bookings = await Promise.all([1, 2, 3, 4, 5].map(() => unpaidBooking()));
    const results = await Promise.all(
      bookings.map((r) => recordOfflinePayment(db, desk, { reservationId: r, amountKobo: 5_000_000, method: "cash", paidOn: day(0), confirmReceived: true })),
    );
    const numbers = results.map((x) => Number(x.receiptNumber.split("-").at(-1))).sort((a, b) => a - b);
    expect(new Set(numbers).size).toBe(5);
    expect(numbers.at(-1)! - numbers[0]!).toBe(4); // consecutive: no gaps between them
    for (const r of results) expect(r.receiptNumber).toMatch(/^RCT-\d{4}-\d{6}$/);
  });

  it("till receipts too", async () => {
    const s = await seller();
    const item = await saveMenuItem(db, owner, { name: `Water ${rand()}`, outlet: "bar", category: "soft_drinks", priceKobo: 50_000, available: true, active: true });
    const paid = await Promise.all([1, 2, 3, 4].map(() => payOrder(db, s, { id: crypto.randomUUID(), outlet: "bar", lines: [{ menuItemId: item, quantity: 1 }], method: "cash" })));
    const numbers = paid.map((p) => Number(p.receiptNumber.split("-").at(-1))).sort((a, b) => a - b);
    expect(new Set(numbers).size).toBe(4);
    expect(numbers.at(-1)! - numbers[0]!).toBe(3);
  });
});
