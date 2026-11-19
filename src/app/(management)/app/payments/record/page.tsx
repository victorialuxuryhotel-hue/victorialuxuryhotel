import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { AccessDenied } from "@/components/management/access-denied";
import { OfflinePaymentForm } from "@/components/management/offline-payment-form";
import { PageHeader } from "@/components/management/page-header";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/feedback";
import { can } from "@/lib/auth/permissions";
import { requireStaff } from "@/server/auth";
import { getReservation, hotelToday } from "@/server/queries/reservations";

export const metadata: Metadata = { title: "Record payment" };

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requireStaff();
  if (!can(staff.role, "payments.record")) return <AccessDenied />;
  const id = (await searchParams).reservation;
  if (typeof id !== "string" || !z.uuid().safeParse(id).success) {
    return (
      <Card className="max-w-xl p-6">
        <p className="font-medium text-ink-900">Open the reservation first</p>
        <p className="mt-1 text-sm text-ink-600">Payments are recorded against a reservation. Find it, then choose “Record payment”.</p>
        <Link href="/app/reservations?tab=awaiting" className={buttonStyles({ variant: "secondary", className: "mt-4" })}>Reservations awaiting payment</Link>
      </Card>
    );
  }
  const [r, today] = await Promise.all([getReservation(id), hotelToday()]);
  if (!r) notFound();
  return (
    <Card className="max-w-2xl p-6">
      <OfflinePaymentForm reservation={r} today={today} />
    </Card>
  );
}

export default function RecordPaymentPage(props: PageProps<"/app/payments/record">) {
  return (
    <>
      <PageHeader title="Record offline payment" description="Cash, bank transfer or POS received directly by the hotel." />
      <div className="px-4 py-6 lg:px-8"><Suspense fallback={<LoadingState />}><Content searchParams={props.searchParams} /></Suspense></div>
    </>
  );
}
