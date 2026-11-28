import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/management/access-denied";
import { PageHeader } from "@/components/management/page-header";
import { AddStockItem, RecordDelivery, StockTable } from "@/components/management/stock";
import { LoadingState } from "@/components/ui/feedback";
import { can, canAny } from "@/lib/auth/permissions";
import { hotelDateOf, hotelToday, addDays } from "@/lib/hotel-date";
import { cn } from "@/lib/utils/cn";
import { actorOf, authorizeRead, requireStaff } from "@/server/auth";
import { getDb } from "@/server/db";
import { listStock, MOVE_KINDS, recentMoves, type MoveRow } from "@/server/domain/stock";

export const metadata: Metadata = { title: "Stock" };

/** "21:14" today, "Yesterday", then "Tue 24 Nov". */
function when(iso: string, today: string): string {
  const d = hotelDateOf(iso);
  if (d === today) return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" }).format(new Date(iso));
  if (d === addDays(today, -1)) return "Yesterday";
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).replace(",", "");
}

function why(m: MoveRow): string {
  if (m.kind === "received") return [m.supplier ? `Delivery · ${m.supplier}` : MOVE_KINDS.received, m.note].filter(Boolean).join(" · ");
  if (m.kind === "sold") return m.order_number ? `Sold · #${m.order_number}` : "Sold";
  if (m.kind === "returned") return m.order_number ? `Sale voided · #${m.order_number}` : "Sale voided";
  const label = m.kind === "wasted" ? "Wasted" : MOVE_KINDS[m.kind];
  return m.note ? `${label} · ${m.note}` : label;
}

const Count = ({ n }: { n: number }) => <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-[#eceae4] px-2 text-[13px] font-semibold tabular-nums text-ink-700">{n}</span>;

async function Content() {
  const staff = await requireStaff();
  if (!canAny(staff.role, ["inventory.view", "inventory.manage"])) return <AccessDenied />;
  const reader = await authorizeRead(["inventory.view", "inventory.manage"]);
  const db = await getDb();
  const [items, moves] = await Promise.all([listStock(db, actorOf(reader)), recentMoves(db, actorOf(reader))]);
  const manage = can(staff.role, "inventory.manage");
  const low = items.filter((i) => i.quantity <= i.min_quantity);
  const today = hotelToday();
  return (
    <>
      <PageHeader
        title="Stock"
        description="Drinks, food and supplies, with low-stock warnings"
        actions={manage ? <>{low.length ? null : <RecordDelivery items={items} />}<AddStockItem /></> : null}
      />
      <div className="space-y-4 px-4 py-5 lg:px-8">
        {low.length ? (
          <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl bg-[#fff4dc] px-4 py-3 text-sm text-[#8a4b06]">
            <p className="min-w-0 flex-1">
              <b>{low.length === 1 ? "1 item" : `${low.length} items`} low or out:</b> {low.map((i) => i.name).join(", ")}
            </p>
            {manage ? <RecordDelivery items={items} /> : null}
          </div>
        ) : null}
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <section className="overflow-clip rounded-xl border border-hairline bg-white">
            <h2 className="flex items-center gap-2.5 border-b border-hairline px-4 py-3 text-base font-bold text-ink-900">Stock <Count n={items.length} /></h2>
            <StockTable items={items} manage={manage} />
          </section>
          <section className="overflow-clip rounded-xl border border-hairline bg-white">
            <h2 className="border-b border-hairline px-4 py-3 text-base font-bold text-ink-900">Recent movements</h2>
            {moves.length ? (
              <div className="max-h-[36rem] overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-hairline text-[13px] text-ink-500">
                      <th scope="col" className="px-4 py-2.5 font-medium">When</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Item</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-medium">Change</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Why</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {moves.map((m) => (
                      <tr key={m.id} title={m.who ? `By ${m.who}` : undefined}>
                        <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-ink-700">{when(m.created_at, today)}</td>
                        <td className="px-4 py-2.5 text-ink-900">{m.item}</td>
                        <td className={cn("whitespace-nowrap px-4 py-2.5 text-right font-bold tabular-nums", m.change < 0 ? "text-ink-900" : "text-[#166534]")}>{m.change > 0 ? "+" : "−"}{Math.abs(m.change).toLocaleString("en-NG")}</td>
                        <td className="px-4 py-2.5 text-ink-700">{why(m)}{m.who ? <span className="block text-xs text-ink-500">{m.who}</span> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="px-4 py-4 text-sm text-ink-500">Nothing recorded yet.</p>}
          </section>
        </div>
      </div>
    </>
  );
}

export default function StockPage() {
  return (
    <Suspense fallback={<><PageHeader title="Stock" description="Drinks, food and supplies, with low-stock warnings" /><LoadingState /></>}>
      <Content />
    </Suspense>
  );
}
