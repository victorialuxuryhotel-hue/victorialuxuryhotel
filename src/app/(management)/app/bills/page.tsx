import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AccessDenied } from "@/components/management/access-denied";
import { NewBillForm } from "@/components/management/bills";
import { PageHeader } from "@/components/management/page-header";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/ui/feedback";
import { can } from "@/lib/auth/permissions";
import { formatDate, formatNaira } from "@/lib/format";
import { hotelToday } from "@/lib/hotel-date";
import { actorOf, requireStaff } from "@/server/auth";
import { all, getDb } from "@/server/db";
import { listBills } from "@/server/domain/bills";

export const metadata: Metadata = { title: "Company bills" };

async function Content() {
  const staff = await requireStaff();
  if (!can(staff.role, "bills.manage")) return <AccessDenied />;
  const db = await getDb();
  const [bills, unpaid] = await Promise.all([
    listBills(db, actorOf(staff)),
    all<{ id: string; reference: string; guest_name: string; check_in: string; check_out: string; owed: number }>(
      db,
      `SELECT r.id, r.reference, g.full_name AS guest_name, r.check_in, r.check_out,
              r.total_amount_kobo + r.extras_kobo + r.room_change_kobo - r.discount_kobo
                - (SELECT coalesce(sum(CASE WHEN p.kind = 'payment' THEN p.amount_kobo ELSE -p.amount_kobo END), 0) FROM payments p WHERE p.reservation_id = r.id AND p.status = 'successful') AS owed
       FROM reservations r JOIN guests g ON g.id = r.guest_id
       WHERE r.status = 'pending_payment' AND r.hold_expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         AND NOT EXISTS (SELECT 1 FROM bills b, json_each(b.reservation_ids) j WHERE b.cancelled_at IS NULL AND j.value = r.id)
       ORDER BY r.check_in LIMIT 100`,
    ),
  ]);
  return (
    <div className="grid gap-6 px-4 py-6 lg:grid-cols-[1fr_26rem] lg:px-8">
      <section className="rounded-xl border border-hairline bg-white">
        <h2 className="flex items-center gap-2 px-4 py-3 text-base font-bold text-ink-900">Bills <span className="rounded-md bg-[#eceae4] px-1.5 text-[13px] tabular-nums">{bills.length}</span></h2>
        {bills.length ? (
          <table className="w-full text-sm">
            <thead className="border-y border-hairline text-left text-xs text-ink-500">
              <tr><th className="px-4 py-2.5 font-medium">Bill</th><th className="px-4 py-2.5 font-medium">Company</th><th className="px-4 py-2.5 font-medium">Valid until</th><th className="px-4 py-2.5 text-right font-medium">Total</th><th className="px-4 py-2.5" /></tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {bills.map((b) => (
                <tr key={b.id}>
                  <td className="px-4 py-3"><Link href={`/app/bills/${b.id}`} className="font-semibold text-navy-700 hover:underline">{b.number}</Link></td>
                  <td className="px-4 py-3">{b.company_name} <span className="text-ink-500">· {b.bookings} booking{b.bookings === 1 ? "" : "s"}</span></td>
                  <td className="px-4 py-3">{formatDate(b.valid_until, { year: false })}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatNaira(b.total_kobo)}</td>
                  <td className="px-4 py-3">{b.cancelled_at ? <Badge tone="neutral">Cancelled</Badge> : b.valid_until < hotelToday() ? <Badge tone="danger">Expired</Badge> : <Badge tone="warning">Open</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="px-4 pb-4 text-sm text-ink-500">No company bills yet.</p>
        )}
      </section>
      <section className="h-fit rounded-xl border border-hairline bg-white p-4">
        <h2 className="text-base font-bold text-ink-900">New company bill</h2>
        <p className="mt-1 mb-4 text-sm text-ink-600">For bookings a company pays before arrival. Make the bookings first (unpaid); they&apos;re held until the bill&apos;s valid-until date.</p>
        <NewBillForm bookings={unpaid} today={hotelToday()} />
      </section>
    </div>
  );
}

export default function BillsPage() {
  return (
    <>
      <PageHeader title="Company bills" description="Bills a company pays before arrival. Not receipts." />
      <Suspense fallback={<LoadingState />}><Content /></Suspense>
    </>
  );
}
