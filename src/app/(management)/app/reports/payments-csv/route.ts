import { actorOf, authorize } from "@/server/auth";
import { getDb } from "@/server/db";
import { csvField, paymentsForCsv, rangeDates, reportRange } from "@/server/domain/reports";
import { paymentMethod } from "@/domain/status";
import { hotelToday } from "@/lib/hotel-date";
import { toActionError } from "@/lib/errors";

const TZ = "Africa/Lagos";
const lagos = (iso: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, ...opts }).format(new Date(iso));

export async function GET(request: Request) {
  let staff;
  try {
    staff = await authorize("reports.view");
  } catch (err) {
    const e = toActionError(err);
    return new Response(e.message, { status: e.code === "UNAUTHENTICATED" ? 401 : 403 });
  }
  const range = reportRange(new URL(request.url).searchParams.get("range") ?? undefined);
  const { from, to } = rangeDates(range, hotelToday());
  const rows = await paymentsForCsv(await getDb(), actorOf(staff), range);
  const header = ["Date", "Time", "Booking", "Guest", "Method", "Type", "Amount (NGN)", "Receipt", "Taken by"];
  const lines = rows.map((r) =>
    [
      csvField(lagos(r.paid_at, { year: "numeric", month: "2-digit", day: "2-digit" })),
      csvField(lagos(r.paid_at, { hour: "2-digit", minute: "2-digit", hour12: false })),
      csvField(r.reference),
      csvField(r.guest),
      csvField(r.provider === "paystack" ? "Card (online)" : paymentMethod[(r.method ?? "other") as keyof typeof paymentMethod] ?? r.method),
      csvField(r.kind === "refund" ? "Correction" : "Payment"),
      (r.kind === "refund" ? -r.amount_kobo : r.amount_kobo) / 100,
      csvField(r.receipt_number),
      csvField(r.provider === "paystack" ? "Website" : r.taken_by),
    ].join(","),
  );
  return new Response([header.map(csvField).join(","), ...lines].join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="payments-${from}-to-${to}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
