import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/management/access-denied";
import { MenuManager } from "@/components/management/menu-manager";
import { PageHeader } from "@/components/management/page-header";
import { LoadingState } from "@/components/ui/feedback";
import { can } from "@/lib/auth/permissions";
import { actorOf, authorizeRead, requireStaff } from "@/server/auth";
import { getDb } from "@/server/db";
import { listMenu } from "@/server/domain/pos";
import { listStock } from "@/server/domain/stock";

export const metadata: Metadata = { title: "Menu" };

async function Content() {
  const staff = await requireStaff();
  if (!can(staff.role, "pos.manage")) return <AccessDenied />;
  const reader = await authorizeRead("pos.manage");
  const db = await getDb();
  const [menu, stock] = await Promise.all([listMenu(db, actorOf(reader), { includeInactive: true }), listStock(db, actorOf(reader))]);
  return (
    <div className="px-4 py-6 lg:px-8">
      <MenuManager menu={menu} stock={stock.map((s) => ({ id: s.id, name: s.name, unit: s.unit }))} />
    </div>
  );
}

export default function MenuPage() {
  return (
    <>
      <PageHeader title="Menu" description="Items, prices and the stock each one uses. Prices include VAT." />
      <Suspense fallback={<LoadingState />}><Content /></Suspense>
    </>
  );
}
