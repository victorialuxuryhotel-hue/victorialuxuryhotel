import { can, canAny } from "@/lib/auth/permissions";
import { AccessDenied } from "@/components/management/access-denied";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarPlus } from "lucide-react";
import { PageHeader } from "@/components/management/page-header";
import { PAGE_SIZE, Pager, pageFrom } from "@/components/management/pager";
import { ReservationTable } from "@/components/management/reservation-table";
import { FilterSelect, ListToolbar, Tabs } from "@/components/management/toolbar";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, LoadingState } from "@/components/ui/feedback";
import { bookingSource, reservationStatus } from "@/domain/status";
import { requireStaff } from "@/server/auth";
import { listReservations, tabCounts, type ReservationTab } from "@/server/queries/reservations";

export const metadata: Metadata = { title: "Reservations" };

const tabs: Array<{ key: ReservationTab; label: string }> = [
  { key: "upcoming", label: "Upcoming" },
  { key: "in_house", label: "In house" },
  { key: "awaiting", label: "Awaiting payment" },
  { key: "attention", label: "Needs attention" },
  { key: "all", label: "All" },
];

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

async function Content({ searchParams }: { searchParams: SP }) {
  const staff = await requireStaff();
  if (!canAny(staff.role, ["reservations.manage", "reports.view"])) return <AccessDenied />;
  const sp = await searchParams;
  const tab = (tabs.find((t) => t.key === one(sp.tab))?.key ?? "upcoming") as ReservationTab;
  const q = one(sp.q);
  const page = pageFrom(sp.page);
  const [fetched, counts] = await Promise.all([
    listReservations({ tab, q, status: one(sp.status), source: one(sp.source), page, pageSize: PAGE_SIZE }),
    tabCounts(),
  ]);
  const rows = fetched.slice(0, PAGE_SIZE);
  const href = (key: string) => `/app/reservations?tab=${key}`;
  return (
    <Card>
      <Tabs items={tabs.map((t) => ({ label: t.label, href: href(t.key), active: t.key === tab, count: t.key === "all" ? undefined : counts[t.key as keyof typeof counts] }))} />
      <ListToolbar
        placeholder="Search by reference, guest name or phone"
        defaultQuery={q}
        hidden={{ tab }}
        filtersActive={Boolean(one(sp.status) || one(sp.source))}
        filters={
          <>
            <FilterSelect name="status" label="Status" value={one(sp.status)} options={Object.entries(reservationStatus).map(([k, v]) => [k, v.label])} />
            <FilterSelect name="source" label="Source" value={one(sp.source)} options={Object.entries(bookingSource)} />
          </>
        }
      />
      {rows.length ? (
        <>
          <ReservationTable rows={rows} hrefFor={(r) => `/app/reservations/${r.id}`} />
          <Pager basePath="/app/reservations" params={{ tab, q, status: one(sp.status), source: one(sp.source) }} page={page} hasMore={fetched.length > PAGE_SIZE} />
        </>
      ) : (
        <div className="p-5"><EmptyState title={q ? "No reservations match your search" : "No reservations here"} description={q ? "Try a reference, a guest's name or phone number." : undefined} /></div>
      )}
    </Card>
  );
}

async function NewReservationButton() {
  const staff = await requireStaff();
  if (!can(staff.role, "reservations.manage")) return null;
  return <Link href="/app/reservations/new" className={buttonStyles()}><CalendarPlus className="size-4" aria-hidden />New reservation</Link>;
}

export default function ReservationsPage(props: PageProps<"/app/reservations">) {
  return (
    <>
      <PageHeader
        title="Reservations"
        description="All bookings in one place."
        actions={<Suspense fallback={null}><NewReservationButton /></Suspense>}
      />
      <div className="px-4 py-6 lg:px-8">
        <Suspense fallback={<LoadingState />}>
          <Content searchParams={props.searchParams} />
        </Suspense>
      </div>
    </>
  );
}
