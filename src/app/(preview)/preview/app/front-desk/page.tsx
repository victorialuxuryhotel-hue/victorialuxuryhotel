import { MovementList } from "@/components/management/front-desk";
import { PageHeader } from "@/components/management/page-header";
import { Tabs } from "@/components/management/toolbar";
import { reservations } from "../../_sample";

const href = () => "/preview/app/reservations/vl-7kq3pm";

export default function Page() {
  const arrivals = reservations.filter((r) => r.checkIn === "2026-12-01" && r.status !== "cancelled");
  const departures = reservations.filter((r) => r.checkOut === "2026-12-01" && r.status === "checked_in");
  return (
    <>
      <PageHeader title="Front desk" description="Tuesday 1 December 2026" />
      <div className="bg-white">
        <Tabs items={[{ label: "Today", active: true, href: "#" }, { label: "Tomorrow", href: "#" }, { label: "In house", count: 2, href: "#" }]} />
      </div>
      <div className="grid gap-6 px-4 py-6 lg:px-8 xl:grid-cols-2">
        <MovementList kind="arrivals" rows={arrivals} hrefFor={href} />
        <MovementList kind="departures" rows={departures} hrefFor={href} />
      </div>
    </>
  );
}
