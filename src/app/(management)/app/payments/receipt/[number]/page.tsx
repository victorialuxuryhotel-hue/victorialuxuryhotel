import { canAny } from "@/lib/auth/permissions";
import { AccessDenied } from "@/components/management/access-denied";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/management/page-header";
import { Receipt } from "@/components/management/payments";
import { PrintButton } from "@/components/management/print-button";
import { LoadingState } from "@/components/ui/feedback";
import { getBookingRules } from "@/server/queries/settings";
import { requireStaff } from "@/server/auth";
import { getReservation, reservationIdForReceipt } from "@/server/queries/reservations";

export const metadata: Metadata = { title: "Receipt" };

async function Content({ params }: { params: Promise<{ number: string }> }) {
  const staff = await requireStaff();
  if (!canAny(staff.role, ["payments.record", "reports.view"])) return <AccessDenied />;
  const { number } = await params;
  if (!/^RCT-\d{4}-\d{6}$/.test(number)) notFound();
  const reservationId = await reservationIdForReceipt(number);
  if (!reservationId) notFound();
  const r = await getReservation(reservationId);
  const payment = r?.payments.find((x) => x.receiptNumber === number);
  if (!r || !payment) notFound();
  const rules = await getBookingRules();
  return <Receipt payment={payment} reservation={{ ...r, room: r.roomNumber ? `Room ${r.roomNumber}` : undefined }} vatRateBp={rules.vatRateBp} />;
}

export default function ReceiptPage(props: PageProps<"/app/payments/receipt/[number]">) {
  return (
    <>
      <div className="print:hidden"><PageHeader title="Receipt" actions={<PrintButton />} /></div>
      <div className="px-4 py-8 lg:px-8 print:p-0"><Suspense fallback={<LoadingState />}><Content params={props.params} /></Suspense></div>
    </>
  );
}
