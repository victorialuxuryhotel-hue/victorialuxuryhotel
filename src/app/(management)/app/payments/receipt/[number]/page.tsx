import { canAny } from "@/lib/auth/permissions";
import { AccessDenied } from "@/components/management/access-denied";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/management/page-header";
import { RoomReceipt } from "@/components/management/room-receipt";
import { PrintButton } from "@/components/management/print-button";
import { PrintAs, ThermalReceipt } from "@/components/management/thermal";
import { paymentMethod } from "@/domain/status";
import { formatDate, formatDateTime, formatNaira } from "@/lib/format";
import { isReprint } from "@/lib/station";
import { vatIncluded } from "@/lib/vat";
import { nowIso } from "@/server/clock";
import { LoadingState } from "@/components/ui/feedback";
import { getBookingRules } from "@/server/queries/settings";
import { requireStaff } from "@/server/auth";
import { getBillCharges, getReservation, reservationIdForReceipt } from "@/server/queries/reservations";

export const metadata: Metadata = { title: "Receipt" };

async function Content({ params }: { params: Promise<{ number: string }> }) {
  const staff = await requireStaff();
  if (!canAny(staff.role, ["payments.record", "reports.view"])) return <AccessDenied />;
  const { number } = await params;
  if (!/^RCT-\d{4}-\d{6}$/.test(number)) notFound();
  const reservationId = await reservationIdForReceipt(number);
  if (!reservationId) notFound();
  const [r, lines] = await Promise.all([getReservation(reservationId), getBillCharges(reservationId)]);
  const payment = r?.payments.find((x) => x.receiptNumber === number);
  if (!r || !payment || !lines) notFound();
  const rules = await getBookingRules();
  const vat = rules.vatOnReceipts ? rules.vatRateBp : 0;
  const copy = isReprint(payment.paidAt, nowIso());
  const room = r.roomNumber ? `Room ${r.roomNumber}` : undefined;
  return (
    <>
      <RoomReceipt payment={payment} stay={{ ...r, room }} lines={lines} vatRateBp={vat} taxId={rules.taxId} copy={copy} />
      <PrintAs
        thermal={
          <ThermalReceipt
            title="Payment receipt"
            number={number}
            copy={copy}
            rows={[
              ["Date", payment.paidAt ? formatDateTime(payment.paidAt) : "—"],
              ["Guest", r.guestName],
              ["Booking", r.reference],
              ["Stay", `${room ? `${room} · ` : ""}${r.category}`],
              ["Dates", `${formatDate(r.checkIn, { year: false })} → ${formatDate(r.checkOut, { year: false })}`],
            ]}
            total={["Paid", formatNaira(payment.amountKobo)]}
            after={[
              ["Method", `${paymentMethod[payment.method]}${payment.providerReference ? ` · ${payment.providerReference}` : ""}`],
              ...(vat ? ([["Includes VAT", formatNaira(vatIncluded(payment.amountKobo, vat))], ...(rules.taxId ? [["TIN", rules.taxId] as [string, string]] : [])] as [string, string][]) : []),
              ["Stay total", formatNaira(r.totalKobo)],
              ["Still owed", formatNaira(Math.max(0, r.totalKobo - r.paidKobo))],
              ["Taken by", payment.provider === "paystack" ? "Paystack" : payment.recordedBy ?? "staff"],
            ]}
            footer="Thank you for staying with us."
          />
        }
      />
    </>
  );
}

export default function ReceiptPage(props: PageProps<"/app/payments/receipt/[number]">) {
  return (
    <>
      <div className="print:hidden"><PageHeader title="Receipt" actions={<PrintButton />} /></div>
      <div className="px-4 py-8 lg:px-8 print:p-0"><Suspense fallback={<LoadingState />}><Content params={props.params} /></Suspense></div>
    </>
  );
}
