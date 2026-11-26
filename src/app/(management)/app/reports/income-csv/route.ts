import { actorOf, authorizeRead } from "@/server/auth";
import { tableResponse, deniedResponse, lagosDate, lagosTime, naira, logDownload } from "@/server/csv";
import { first, getDb } from "@/server/db";
import { incomeRows, rangeDates, reportDepartment, reportRange, type Bucket, type Department } from "@/server/domain/reports";
import { hotelToday } from "@/lib/hotel-date";
import { vatIncluded } from "@/lib/vat";
import { VAT_SHOWN_SQL } from "@/server/vat";

const DEPARTMENT: Record<Department, string> = { rooms: "Rooms", restaurant: "Restaurant", bar: "Bar", hall: "Conference hall" };
const METHOD: Record<Bucket, string> = { cash: "Cash", transfer: "Bank transfer", pos: "POS / card", cardOnline: "Card (online)", other: "Other" };

export async function GET(request: Request) {
  let staff;
  try {
    staff = await authorizeRead("reports.view");
  } catch (err) {
    return deniedResponse(err);
  }
  const q = new URL(request.url).searchParams;
  const range = reportRange(q.get("range") ?? undefined);
  const dept = reportDepartment(q.get("dept"));
  const { from, to } = rangeDates(range, hotelToday());
  const db = await getDb();
  const [rows, settings] = await Promise.all([
    incomeRows(db, actorOf(staff), range).then((rows) => rows.filter((r) => !dept || r.department === dept)),
    first<{ vat_rate_bp: number }>(db, `SELECT ${VAT_SHOWN_SQL} AS vat_rate_bp FROM hotel_settings WHERE id = 1`),
  ]);
  const rate = settings?.vat_rate_bp ?? 0;
  await logDownload(staff, `income, ${from} to ${to}${dept ? ` (${DEPARTMENT[dept]})` : ""}`, { from, to, dept });
  return tableResponse(
    request,
    `income-${dept ? `${DEPARTMENT[dept].toLowerCase().replace(/[^a-z]+/g, "-")}-` : ""}${from}-to-${to}`,
    "Income",
    // The VAT column appears only when "Show VAT on receipts" is on in Booking rules.
    ["Date", "Time", "Department", "Reference", "Details", "Method", "Type", "Amount (NGN)", ...(rate ? [`VAT included at ${rate / 100}% (NGN)`] : []), "Receipt / no.", "Taken by"],
    rows.map((r) => [
      r.department === "hall" ? r.day : lagosDate(r.at),
      lagosTime(r.at),
      DEPARTMENT[r.department],
      r.reference,
      r.detail,
      METHOD[r.method],
      r.correction ? "Correction" : "Payment",
      naira(r.kobo),
      ...(rate ? [naira(Math.sign(r.kobo) * vatIncluded(Math.abs(r.kobo), rate))] : []),
      r.document,
      r.takenBy,
    ]),
  );
}
