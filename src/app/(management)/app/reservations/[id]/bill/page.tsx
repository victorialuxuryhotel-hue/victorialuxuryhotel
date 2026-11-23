import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { AccessDenied } from "@/components/management/access-denied";
import { PageHeader } from "@/components/management/page-header";
import { GuestBill } from "@/components/management/payments";
import { PrintButton } from "@/components/management/print-button";
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
  return (
    <GuestBill
      stay={{ ...r, room: r.roomNumber ? `Room ${r.roomNumber}` : undefined }}
      lines={lines}
      vatRateBp={rules.vatRateBp}
      printedAt={new Date().toISOString()}
    />
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
