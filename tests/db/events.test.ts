import { describe, expect, it } from "vitest";
import { createHallBooking, listHallBookings, recordHallPayment, setHallStatus } from "@/server/domain/events";
import { day, db, desk, gm, rejects } from "./helpers";

const base = { customerName: "Acme Ltd", phone: null, email: null, guests: 40, priceKobo: 30_000_000, notes: null };

describe("hall bookings", () => {
  const pay = (bookingId: string, amountKobo: number, method: "cash" | "bank_transfer" = "cash", reference: string | null = null) =>
    recordHallPayment(db, desk, { bookingId, amountKobo, method, paidOn: day(0), reference });

  it("a new hall booking is an enquiry; paying in full confirms it in the same step", async () => {
    const date = day(90 + Math.floor(Math.random() * 200));
    const a = await createHallBooking(db, desk, { ...base, title: "Training", eventDate: date, startTime: "09:00", endTime: "13:00" });
    const find = async () => (await listHallBookings(db, desk)).find((b) => b.id === a)!;
    expect((await find()).status).toBe("enquiry");
    await pay(a, 10_000_000);
    expect(await find()).toMatchObject({ status: "enquiry", paid_kobo: 10_000_000 });
    await rejects(setHallStatus(db, desk, a, "confirmed"), /₦200,000 is still owed/);
    await rejects(pay(a, 25_000_000), /owed/);
    await pay(a, 20_000_000, "bank_transfer", "GTB 7731 ACME");
    expect(await find()).toMatchObject({ status: "confirmed", paid_kobo: 30_000_000 });
  });

  it("a payment needs a price first, and a transfer needs its reference", async () => {
    const date = day(90 + Math.floor(Math.random() * 200));
    const free = await createHallBooking(db, desk, { ...base, priceKobo: 0, title: "Unpriced", eventDate: date, startTime: "09:00", endTime: "10:00" });
    await rejects(pay(free, 1_000), /Set the price/);
    const b = await createHallBooking(db, desk, { ...base, title: "Priced", eventDate: date, startTime: "10:00", endTime: "11:00" });
    await rejects(pay(b, 1_000, "bank_transfer", null), /transfer reference or the sender's name/);
  });

  it("refuses two confirmed events at once: the payment that would confirm a clash is refused", async () => {
    const date = day(90 + Math.floor(Math.random() * 200));
    const a = await createHallBooking(db, desk, { ...base, title: "Morning", eventDate: date, startTime: "09:00", endTime: "13:00" });
    await pay(a, 30_000_000);
    const clash = await createHallBooking(db, desk, { ...base, title: "Clash", eventDate: date, startTime: "12:00", endTime: "15:00" });
    await rejects(pay(clash, 30_000_000), /already booked/);
    expect((await listHallBookings(db, desk)).find((b) => b.id === clash)).toMatchObject({ status: "enquiry", paid_kobo: 0 });
    const after = await createHallBooking(db, gm, { ...base, title: "Afternoon", eventDate: date, startTime: "13:00", endTime: "17:00" });
    await pay(after, 30_000_000);
    await setHallStatus(db, desk, a, "cancelled");
    await rejects(pay(a, 1_000), /cancelled/);
  });
});
