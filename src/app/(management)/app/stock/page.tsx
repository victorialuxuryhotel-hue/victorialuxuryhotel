import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/management/access-denied";
import { PageHeader } from "@/components/management/page-header";
import { AddStockItem, StockList } from "@/components/management/stock";
import { Card, CardHeader } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/feedback";
import { can } from "@/lib/auth/permissions";
import { formatDateTime } from "@/lib/format";
import { actorOf, authorizeRead, requireStaff } from "@/server/auth";
import { getDb } from "@/server/db";
import { listStock, recentMoves } from "@/server/domain/stock";

export const metadata: Metadata = { title: "Stock" };

async function Content() {
  const staff = await requireStaff();
  if (!can(staff.role, "inventory.use")) return <AccessDenied />;
  const reader = await authorizeRead("inventory.use");
  const db = await getDb();
  const [items, moves] = await Promise.all([listStock(db, actorOf(reader)), recentMoves(db, actorOf(reader))]);
  const manage = can(staff.role, "inventory.manage");
  const low = items.filter((i) => i.quantity <= i.min_quantity);
  return (
    <div className="space-y-6 px-4 py-6 lg:px-8">
      {low.length ? (
        <p role="status" className="rounded-md border border-danger-600/20 bg-danger-50 px-4 py-3 text-sm text-danger-700">
          Running low: {low.map((i) => `${i.name} (${i.quantity} ${i.unit})`).join(", ")}
        </p>
      ) : null}
      <Card>
        <CardHeader title="Stock" description={manage ? "Record what's used, what arrives, and count fixes." : "Record what you use."} />
        <StockList items={items} manage={manage} />
      </Card>
      {manage ? (
        <Card>
          <CardHeader title="Add a stock item" />
          <AddStockItem />
        </Card>
      ) : null}
      <Card>
        <CardHeader title="Recent movements" />
        {moves.length ? (
          <ul className="divide-y divide-hairline">
            {moves.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate text-ink-900">{m.item}{m.note ? <span className="text-ink-500"> · {m.note}</span> : null}</span>
                <span className="text-xs text-ink-500">{m.who ?? ""} · {formatDateTime(m.created_at)}</span>
                <span className={m.change < 0 ? "tabular-nums text-ink-700" : "tabular-nums text-success-700"}>{m.change > 0 ? "+" : ""}{m.change} {m.unit}</span>
              </li>
            ))}
          </ul>
        ) : <p className="px-5 py-4 text-sm text-ink-500">Nothing recorded yet.</p>}
      </Card>
    </div>
  );
}

export default function StockPage() {
  return (
    <>
      <PageHeader title="Stock" description="Drinks, food and supplies, with low-stock warnings." />
      <Suspense fallback={<LoadingState />}><Content /></Suspense>
    </>
  );
}
