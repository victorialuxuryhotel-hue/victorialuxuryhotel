import { actorOf, authorizeRead } from "@/server/auth";
import { csvResponse, deniedResponse, lagosDate, lagosTime, naira } from "@/server/csv";
import { first, getDb } from "@/server/db";
import { incomeRows, rangeDates, reportRange, type Bucket, type Department } from "@/server/domain/reports";
import { hotelToday } from "@/lib/hotel-date";
import { vatIncluded } from "@/lib/vat";

const DEPARTMENT: Record<Department, string> = { rooms: "Rooms", restaurantBar: "Restaurant & bar", hall: "Conference hall" };
const METHOD: Record<Bucket, string> = { cash: "Cash", transfer: "Bank transfer", pos: "POS / card", cardOnline: "Card (online)", other: "Other" };

export async function GET(request: Request) {
  let staff;
  try {
    staff = await authorizeRead("reports.view");
  } catch (err) {
    return deniedResponse(err);
  }
  const range = reportRange(new URL(request.url).searchParams.get("range") ?? undefined);
  const { from, to } = rangeDates(range, hotelToday());
  const db = await getDb();
  const [rows, settings] = await Promise.all([
    incomeRows(db, actorOf(staff), range),
    first<{ vat_rate_bp: number }>(db, "SELECT vat_rate_bp FROM hotel_settings WHERE id = 1"),
  ]);
  const rate = settings?.vat_rate_bp ?? 750;
  return csvResponse(
    `income-${from}-to-${to}.csv`,
    ["Date", "Time", "Department", "Reference", "Details", "Method", "Type", "Amount (NGN)", `VAT included at ${rate / 100}% (NGN)`, "Receipt / no.", "Taken by"],
    rows.map((r) => [
      r.department === "hall" ? r.day : lagosDate(r.at),
      lagosTime(r.at),
      DEPARTMENT[r.department],
      r.reference,
      r.detail,
      METHOD[r.method],
      r.correction ? "Correction" : "Payment",
      naira(r.kobo),
      naira(Math.sign(r.kobo) * vatIncluded(Math.abs(r.kobo), rate)),
      r.document,
      r.takenBy,
    ]),
  );
}
