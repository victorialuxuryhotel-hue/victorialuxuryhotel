import type { Metadata } from "next";
import { Suspense } from "react";
import { MovementList } from "@/components/management/front-desk";
import { PageHeader } from "@/components/management/page-header";
import { ReservationTable } from "@/components/management/reservation-table";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, LoadingState } from "@/components/ui/feedback";
import { formatDate } from "@/lib/format";
import { requireStaff } from "@/server/auth";
import { movements } from "@/server/queries/reservations";

export const metadata: Metadata = { title: "Front desk" };

const href = (r: { id: string }) => `/app/reservations/${r.id}`;

async function Content() {
  await requireStaff();
  const { today, arrivals, departures, inHouse } = await movements();
  return (
    <>
      <p className="px-4 pt-4 text-sm text-ink-500 lg:px-8">{formatDate(today)}</p>
      <div className="grid gap-6 px-4 py-4 lg:px-8 xl:grid-cols-2">
        <MovementList kind="arrivals" rows={arrivals} hrefFor={href} />
        <MovementList kind="departures" rows={departures} hrefFor={href} />
      </div>
      <div className="px-4 pb-6 lg:px-8">
        <Card>
          <CardHeader title="In house" description="Guests currently checked in." />
          {inHouse.length ? <ReservationTable rows={inHouse} hrefFor={href} /> : <div className="p-5"><EmptyState title="No guests checked in" /></div>}
        </Card>
      </div>
    </>
  );
}

export default function FrontDeskPage() {
  return (
    <>
      <PageHeader title="Front desk" description="Today's arrivals, departures and guests in house." />
      <Suspense fallback={<LoadingState />}><Content /></Suspense>
    </>
  );
}
