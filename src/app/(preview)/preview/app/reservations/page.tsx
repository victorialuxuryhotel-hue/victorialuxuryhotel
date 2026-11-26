import Link from "next/link";
import { CalendarPlus } from "lucide-react";
import { PageHeader } from "@/components/management/page-header";
import { ReservationTable } from "@/components/management/reservation-table";
import { FilterSelect, ListToolbar, Tabs } from "@/components/management/toolbar";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { bookingSource } from "@/domain/status";
import { reservations } from "../../_sample";

export default function Page() {
  return (
    <>
      <PageHeader
        title="Reservations"
        description="All bookings in one place."
        actions={<Link href="/preview/app/reservations/new" className={buttonStyles()}><CalendarPlus className="size-4" aria-hidden />New reservation</Link>}
      />
      <div className="px-4 py-6 lg:px-8">
        <Card>
          <Tabs items={[{ label: "Upcoming", count: 4, active: true, href: "#" }, { label: "Staying now", count: 2, href: "#" }, { label: "Awaiting payment", count: 1, href: "#" }, { label: "Needs attention", count: 1, href: "#" }, { label: "All", href: "#" }]} />
          <ListToolbar
            placeholder="Search by reference, guest name or phone"
            filters={<FilterSelect name="source" label="Source" options={Object.entries(bookingSource)} />}
          />
          <ReservationTable rows={reservations} hrefFor={() => "/preview/app/reservations/vl-7kq3pm"} today="2026-12-01" />
        </Card>
      </div>
    </>
  );
}
