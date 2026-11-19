import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { ReservationDetailView } from "@/components/management/reservation-detail";
import { LoadingState } from "@/components/ui/feedback";
import { can } from "@/lib/auth/permissions";
import { requireStaff } from "@/server/auth";
import { getReservation, hotelToday } from "@/server/queries/reservations";
import { assignableRooms } from "@/server/queries/rooms";

export const metadata: Metadata = { title: "Reservation" };

async function Content({ params, searchParams }: PageProps<"/app/reservations/[id]">) {
  const staff = await requireStaff();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [r, today] = await Promise.all([getReservation(id), hotelToday()]);
  if (!r) notFound();
  const rooms = ["pending_payment", "confirmed", "checked_in"].includes(r.status) ? await assignableRooms(r.id, r.checkIn, r.checkOut) : [];
  const sp = await searchParams;
  return (
    <ReservationDetailView
      r={r}
      today={today}
      backHref="/app/reservations"
      paymentsHref={`/app/payments/record?reservation=${r.id}`}
      receiptHref={(n) => `/app/payments/receipt/${n}`}
      guestHref={`/app/guests/${r.guestId}`}
      rooms={rooms}
      maxGuests={r.maxGuests}
      canOverride={can(staff.role, "payments.override")}
      justCreated={sp.created === "1"}
      paidReceipt={typeof sp.paid === "string" && /^RCT-\d{4}-\d{6}$/.test(sp.paid) ? sp.paid : undefined}
    />
  );
}

export default function ReservationPage(props: PageProps<"/app/reservations/[id]">) {
  return (
    <Suspense fallback={<LoadingState />}>
      <Content {...props} />
    </Suspense>
  );
}
