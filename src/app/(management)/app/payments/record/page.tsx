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
import { getDb } from "@/server/db";
import { paymentSettings } from "@/server/domain/payment-details";

export const metadata: Metadata = { title: "Take payment" };

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requireStaff();
  if (!can(staff.role, "payments.record")) return <AccessDenied />;
  const id = (await searchParams).reservation;
  if (typeof id !== "string" || !z.uuid().safeParse(id).success) {
    return (
      <Card className="max-w-xl p-6">
        <p className="font-medium text-ink-900">Open the booking first</p>
        <p className="mt-1 text-sm text-ink-600">Payments are taken against a booking. Find it, then choose “Take payment”.</p>
        <Link href="/app/reservations?tab=awaiting" className={buttonStyles({ variant: "secondary", className: "mt-4" })}>Bookings awaiting payment</Link>
      </Card>
    );
  }
  const [r, today, settings] = await Promise.all([getReservation(id), hotelToday(), getDb().then(paymentSettings)]);
  if (!r) notFound();
  const created = (await searchParams).created === "1";
  return (
    <Card className="max-w-2xl p-6">
      {created ? (
        <p role="status" className="mb-5 rounded-md border border-success-600/20 bg-success-50 px-4 py-3 text-sm text-success-700">
          Booking {r.reference} created and held. Take the payment to confirm it, or{" "}
          <Link href={`/app/reservations/${r.id}`} className="underline underline-offset-2">open the booking</Link>.
        </p>
      ) : null}
      <OfflinePaymentForm reservation={r} today={today} settings={settings} />
    </Card>
  );
}

export default function RecordPaymentPage(props: PageProps<"/app/payments/record">) {
  return (
    <>
      <PageHeader title="Take payment" description="Cash, transfer or POS received directly by the hotel." />
      <div className="px-4 py-6 lg:px-8"><Suspense fallback={<LoadingState />}><Content searchParams={props.searchParams} /></Suspense></div>
    </>
  );
}
