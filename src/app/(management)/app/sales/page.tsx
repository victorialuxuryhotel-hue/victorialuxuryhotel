import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/management/access-denied";
import { PageHeader } from "@/components/management/page-header";
import { MenuManager, SalesList, Till } from "@/components/management/till";
import { Card, CardHeader } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/feedback";
import { can } from "@/lib/auth/permissions";
import { formatNaira } from "@/lib/format";
import { hotelToday } from "@/lib/hotel-date";
import { actorOf, authorizeRead, requireStaff } from "@/server/auth";
import { getDb } from "@/server/db";
import { inHouseGuests, listMenu, salesToday } from "@/server/domain/pos";

export const metadata: Metadata = { title: "Restaurant & bar" };

async function Content() {
  const staff = await requireStaff();
  if (!can(staff.role, "pos.sell")) return <AccessDenied />;
  const reader = await authorizeRead("pos.sell");
  const db = await getDb();
  const [menu, guests, sales] = await Promise.all([listMenu(db, actorOf(reader)), inHouseGuests(db, actorOf(reader)), salesToday(db, actorOf(reader), hotelToday())]);
  const manage = can(staff.role, "pos.manage");
  const taken = sales.filter((s) => s.status === "paid" || s.status === "settled").reduce((t, s) => t + s.total_kobo, 0);
  const onRooms = sales.filter((s) => s.status === "room_charge").reduce((t, s) => t + s.total_kobo, 0);
  return (
    <div className="space-y-6 px-4 py-6 lg:px-8">
      <Till menu={menu} guests={guests} />
      <Card>
        <CardHeader title="Today" description={`${formatNaira(taken)} taken · ${formatNaira(onRooms)} on rooms, paid at check-out`} />
        <SalesList sales={sales} canVoid={manage} />
      </Card>
      {manage ? (
        <Card>
          <CardHeader title="Menu" description="Prices include VAT. Taking an item off hides it from the till." />
          <MenuManager menu={menu} />
        </Card>
      ) : null}
    </div>
  );
}

export default function SalesPage() {
  return (
    <>
      <PageHeader title="Restaurant & bar" description="Take orders and payments, or charge a staying guest's room." />
      <Suspense fallback={<LoadingState />}><Content /></Suspense>
    </>
  );
}
