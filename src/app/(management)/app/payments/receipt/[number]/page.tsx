import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/management/page-header";
import { Receipt } from "@/components/management/payments";
import { PrintButton } from "@/components/management/print-button";
import { LoadingState } from "@/components/ui/feedback";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/server/auth";
import { getReservation } from "@/server/queries/reservations";

export const metadata: Metadata = { title: "Receipt" };

async function Content({ params }: { params: Promise<{ number: string }> }) {
  await requireStaff();
  const { number } = await params;
  if (!/^RCT-\d{4}-\d{6}$/.test(number)) notFound();
  const { data: p } = await (await createClient()).from("payments").select("reservation_id").eq("receipt_number", number).maybeSingle();
  if (!p) notFound();
  const r = await getReservation(p.reservation_id);
  const payment = r?.payments.find((x) => x.receiptNumber === number);
  if (!r || !payment) notFound();
  return <Receipt payment={payment} reservation={r} />;
}

export default function ReceiptPage(props: PageProps<"/app/payments/receipt/[number]">) {
  return (
    <>
      <div className="print:hidden"><PageHeader title="Receipt" actions={<PrintButton />} /></div>
      <div className="px-4 py-8 lg:px-8 print:p-0"><Suspense fallback={<LoadingState />}><Content params={props.params} /></Suspense></div>
    </>
  );
}
