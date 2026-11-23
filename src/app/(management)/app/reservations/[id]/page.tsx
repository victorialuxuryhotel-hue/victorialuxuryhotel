import { AccessDenied } from "@/components/management/access-denied";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { ReservationDetailView } from "@/components/management/reservation-detail";
import { LoadingState } from "@/components/ui/feedback";
import { can, canAny } from "@/lib/auth/permissions";
import { RoomCharges } from "@/components/management/room-charges";
import { actorOf, authorizeRead, requireStaff } from "@/server/auth";
import { getDb } from "@/server/db";
import { chargesFor } from "@/server/domain/pos";
import { getReservation, hotelToday } from "@/server/queries/reservations";
import { assignableRooms } from "@/server/queries/rooms";
import { managerToAskForDesk } from "@/server/queries/settings";

export const metadata: Metadata = { title: "Reservation" };

async function Content({ params, searchParams }: PageProps<"/app/reservations/[id]">) {
  const staff = await requireStaff();
  if (!canAny(staff.role, ["reservations.manage", "payments.record", "reports.view"])) return <AccessDenied />;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [r, today] = await Promise.all([getReservation(id), hotelToday()]);
  if (!r) notFound();
  const canOverride = can(staff.role, "payments.override");
  const [rooms, manager] = await Promise.all([
    ["pending_payment", "confirmed", "checked_in"].includes(r.status) ? assignableRooms(r.id, r.checkIn, r.checkOut) : Promise.resolve([]),
    canOverride ? Promise.resolve(null) : managerToAskForDesk(),
  ]);
  const sp = await searchParams;
  const reader = await authorizeRead(["reservations.manage", "payments.record", "reports.view"]);
  const charges = can(staff.role, "pos.settle") ? await chargesFor(await getDb(), actorOf(reader), r.id) : [];
  return (
    <>
    <ReservationDetailView
      r={r}
      today={today}
      backHref="/app/reservations"
      paymentsHref={`/app/payments/record?reservation=${r.id}`}
      receiptHref={(n) => `/app/payments/receipt/${n}`}
      billHref={`/app/reservations/${r.id}/bill`}
      guestHref={`/app/guests/${r.guestId}`}
      rooms={rooms}
      maxGuests={r.maxGuests}
      canOverride={canOverride}
      manager={manager}
      justCreated={sp.created === "1"}
      paidReceipt={typeof sp.paid === "string" && /^RCT-\d{4}-\d{6}$/.test(sp.paid) ? sp.paid : undefined}
    />
    {charges.length ? <div className="px-4 pb-8 lg:px-8"><RoomCharges reservationId={r.id} charges={charges} canSettle={can(staff.role, "pos.settle")} /></div> : null}
    </>
  );
}

export default function ReservationPage(props: PageProps<"/app/reservations/[id]">) {
  return (
    <Suspense fallback={<LoadingState />}>
      <Content {...props} />
    </Suspense>
  );
}
