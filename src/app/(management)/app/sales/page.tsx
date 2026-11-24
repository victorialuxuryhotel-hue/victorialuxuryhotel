import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AccessDenied } from "@/components/management/access-denied";
import { PageHeader } from "@/components/management/page-header";
import { Till } from "@/components/management/till";
import { LoadingState } from "@/components/ui/feedback";
import { can } from "@/lib/auth/permissions";
import { formatNaira } from "@/lib/format";
import { recordId } from "@/lib/ids";
import { actorOf, authorizeRead, requireStaff } from "@/server/auth";
import { first, getDb } from "@/server/db";
import { closingSummary, listMenu, openOrders } from "@/server/domain/pos";
import { businessDate } from "@/lib/hotel-date";

export const metadata: Metadata = { title: "Till" };

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requireStaff();
  if (!can(staff.role, "pos.sell")) return <AccessDenied />;
  const reader = await authorizeRead("pos.sell");
  const actor = actorOf(reader);
  const db = await getDb();
  const sp = await searchParams;
  const resume = typeof sp.order === "string" && recordId().safeParse(sp.order).success ? sp.order : undefined;
  const [menu, open, mine, settings, closed] = await Promise.all([
    listMenu(db, actor),
    openOrders(db, actor),
    closingSummary(db, actor, staff.id),
    first<{ vat_rate_bp: number }>(db, "SELECT vat_rate_bp FROM hotel_settings WHERE id = 1"),
    first(db, "SELECT 1 FROM pos_closings WHERE staff_id = ? AND business_date = ?", staff.id, businessDate()),
  ]);
  const low = can(staff.role, "inventory.manage") ? menu.filter((m) => m.stock_left != null && m.stock_left <= 5) : [];
  return (
    <div className="space-y-6 px-4 py-6 lg:px-8">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink-600">
        <span>Your sales today: <b className="tabular-nums text-ink-900">{mine.sales}</b> · <b className="tabular-nums text-ink-900">{formatNaira(mine.salesKobo)}</b></span>
        <span>Cash to hand in: <b className="tabular-nums text-ink-900">{formatNaira(mine.byMethod.cash)}</b></span>
        <Link href="/app/sales/orders" className="font-medium text-navy-800 hover:underline">Orders & receipts</Link>
        <Link href="/app/sales/closing" className="font-medium text-navy-800 hover:underline">Close my day</Link>
      </div>
      {low.length ? (
        <p role="status" className="rounded-md border border-warning-600/30 bg-warning-50 px-4 py-3 text-sm text-warning-700">
          Running low: {low.map((m) => `${m.name} (${m.stock_left} left)`).join(", ")}. <Link href="/app/stock" className="font-medium underline">Stock</Link>
        </p>
      ) : null}
      {closed ? (
        <p role="status" className="rounded-md border border-hairline bg-ivory-50 px-4 py-3 text-sm text-ink-700">
          You&apos;ve closed today&apos;s sales. <Link href="/app/sales/closing" className="font-medium text-navy-800 underline">See your closing</Link>
        </p>
      ) : (
        <Till menu={menu} open={open} attendant={staff.fullName} vatRateBp={settings?.vat_rate_bp ?? 750} resume={resume} />
      )}
    </div>
  );
}

export default function TillPage(props: PageProps<"/app/sales">) {
  return (
    <>
      <PageHeader title="Till" description="Restaurant & bar orders and payments." />
      <Suspense fallback={<LoadingState />}><Content searchParams={props.searchParams} /></Suspense>
    </>
  );
}
