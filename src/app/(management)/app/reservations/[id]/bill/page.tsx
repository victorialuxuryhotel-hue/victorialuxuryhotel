import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { AccessDenied } from "@/components/management/access-denied";
import { PageHeader } from "@/components/management/page-header";
import { GuestBill } from "@/components/management/payments";
import { PrintButton } from "@/components/management/print-button";
import { PrintAs, ThermalReceipt } from "@/components/management/thermal";
import { formatDate, formatDateTime, formatNaira } from "@/lib/format";
import { vatIncluded } from "@/lib/vat";
import { nowIso } from "@/server/clock";
import { LoadingState } from "@/components/ui/feedback";
import { canAny } from "@/lib/auth/permissions";
import { requireStaff } from "@/server/auth";
import { getBillCharges, getReservation } from "@/server/queries/reservations";
import { getBookingRules } from "@/server/queries/settings";

export const metadata: Metadata = { title: "Guest bill" };

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  if (!canAny(staff.role, ["reservations.manage", "payments.record", "reports.view"])) return <AccessDenied />;
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const [r, lines, rules] = await Promise.all([getReservation(id.data), getBillCharges(id.data), getBookingRules()]);
  if (!r || !lines) notFound();
  const vat = rules.vatOnReceipts ? rules.vatRateBp : 0;
  const room = r.roomNumber ? `Room ${r.roomNumber}` : undefined;
  const printedAt = nowIso();
  const balance = r.totalKobo - r.paidKobo;
  return (
    <>
      <GuestBill stay={{ ...r, room }} lines={lines} vatRateBp={vat} taxId={rules.taxId} printedAt={printedAt} />
      <PrintAs
        thermal={
          <ThermalReceipt
            title="Guest bill"
            number={r.reference}
            rows={[
              ["Guest", r.guestName],
              ["Room", `${room ? `${room} · ` : ""}${r.category}`],
              ["Stay", `${formatDate(r.checkIn, { year: false })} → ${formatDate(r.checkOut, { year: false })}`],
              ["Printed", formatDateTime(printedAt)],
            ]}
            lines={[
              { name: `Room: ${r.category}`, detail: `${lines.nights} × ${formatNaira(lines.nightlyRateKobo)}`, amount: formatNaira(lines.roomKobo) },
              ...lines.extras.map((e) => ({ name: e.name, detail: e.perNight ? `${lines.nights} × ${formatNaira(e.unitKobo)}` : undefined, amount: formatNaira(e.amountKobo) })),
              ...(lines.roomChangeKobo ? [{ name: "Room change", amount: formatNaira(lines.roomChangeKobo) }] : []),
              ...(lines.discountKobo ? [{ name: `Discount${lines.promoCode ? ` (${lines.promoCode})` : ""}`, amount: `−${formatNaira(lines.discountKobo)}` }] : []),
            ]}
            total={["Total", formatNaira(r.totalKobo)]}
            after={[
              ...(vat ? ([["Includes VAT", formatNaira(vatIncluded(r.totalKobo, vat))], ...(rules.taxId ? [["TIN", rules.taxId] as [string, string]] : [])] as [string, string][]) : []),
              ["Paid", formatNaira(r.paidKobo)],
              [balance > 0 ? "Owed" : "Balance", balance > 0 ? formatNaira(balance) : "Paid in full"],
            ]}
            footer="Thank you for staying with us."
          />
        }
      />
    </>
  );
}

export default function GuestBillPage(props: PageProps<"/app/reservations/[id]/bill">) {
  return (
    <>
      <div className="print:hidden"><PageHeader title="Guest bill" actions={<PrintButton />} /></div>
      <div className="px-4 py-8 lg:px-8 print:p-0"><Suspense fallback={<LoadingState />}><Content params={props.params} /></Suspense></div>
    </>
  );
}
