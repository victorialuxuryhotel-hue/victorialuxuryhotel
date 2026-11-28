import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AccessDenied } from "@/components/management/access-denied";
import { LoadingState } from "@/components/ui/feedback";
import { formatDate, formatNaira } from "@/lib/format";
import { actorOf, requireStaff } from "@/server/auth";
import { getDb } from "@/server/db";
import { ownerSnapshot } from "@/server/domain/owner";

export const metadata: Metadata = { title: "Owner" };

const short = (kobo: number) => (kobo >= 100_000_000 ? `₦${(kobo / 100_000_000).toFixed(kobo >= 1_000_000_000 ? 0 : 1)}m` : kobo >= 100_000 ? `₦${Math.round(kobo / 100_000)}k` : formatNaira(kobo));

/** The owner's phone dashboard (design X13; FUNCTIONALITY.md section 12). View only: no buttons that change anything. */
async function Content() {
  const staff = await requireStaff();
  if (staff.role !== "owner") return <AccessDenied />;
  const s = await ownerSnapshot(await getDb(), actorOf(staff));
  const max = Math.max(1, ...s.week.map((d) => d.kobo));
  const updated = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" });
  const tile = "rounded-xl border border-hairline bg-white p-4";
  return (
    <div className="mx-auto w-full max-w-[430px] space-y-4 px-4 py-5">
      <header>
        <p className="font-brand text-2xl text-navy-950">Victoria Luxury</p>
        <p className="text-sm text-ink-500">{formatDate(s.today, { weekday: true, year: false })} · updated {updated}</p>
      </header>
      <div className="grid grid-cols-2 gap-3">
        <div className={tile}><p className="text-[13px] font-medium text-ink-500">Tonight</p><p className="text-3xl font-bold tabular-nums">{s.occupancy.pct}%</p><p className="text-[13px] text-ink-500 tabular-nums">{s.occupancy.sold} of {s.occupancy.rooms} rooms</p></div>
        <div className={tile}><p className="text-[13px] font-medium text-ink-500">Taken today</p><p className="text-3xl font-bold tabular-nums">{short(s.takenTodayKobo)}</p><p className="text-[13px] text-ink-500">rooms, bar, hall</p></div>
        <div className={tile}><p className="text-[13px] font-medium text-ink-500">Bar today</p><p className="text-2xl font-bold tabular-nums">{formatNaira(s.bar.kobo)}</p><p className="text-[13px] text-ink-500 tabular-nums">{s.bar.orders} order{s.bar.orders === 1 ? "" : "s"}</p></div>
        <div className={tile}><p className="text-[13px] font-medium text-ink-500">Overdue</p><p className={`text-3xl font-bold tabular-nums ${s.overdue.guests ? "text-[#a61b1b]" : ""}`}>{s.overdue.guests}</p><p className="text-[13px] text-ink-500 tabular-nums">{!s.overdue.guests ? "nobody" : s.overdue.owedKobo ? `owe ${formatNaira(s.overdue.owedKobo)}` : "all paid"}</p></div>
      </div>
      <section className="rounded-xl border border-hairline bg-white">
        <h2 className="flex items-center gap-2 px-4 py-3 text-base font-bold">Anything wrong? <span className={`rounded-md px-1.5 text-[13px] tabular-nums ${s.wrong.length ? "bg-[#fde8e8] text-[#a61b1b]" : "bg-[#e7f6ec] text-[#166534]"}`}>{s.wrong.length}</span></h2>
        {s.wrong.length ? (
          <ul className="divide-y divide-hairline border-t border-hairline">
            {s.wrong.map((w, i) => (
              <li key={i}><Link href={w.href} className="flex min-h-12 items-center justify-between gap-3 px-4 py-2.5 text-sm text-ink-900 hover:bg-ivory-100"><span>{w.text}</span><span aria-hidden className="text-ink-400">›</span></Link></li>
            ))}
          </ul>
        ) : (
          <p className="border-t border-hairline px-4 py-3 text-sm text-ink-600">Nothing needs you.</p>
        )}
      </section>
      <section className="rounded-xl border border-hairline bg-white p-4">
        <h2 className="text-base font-bold">Takings, last 7 days</h2>
        <div className="mt-3 flex h-32 items-end gap-2" role="img" aria-label={`Takings: ${s.week.map((d) => `${formatDate(d.day, { weekday: true, year: false })} ${formatNaira(d.kobo)}`).join(", ")}`}>
          {s.week.map((d) => (
            <div key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <div className={`w-full rounded-t ${d.day === s.today ? "bg-navy-900" : "bg-[#b3c3f0]"}`} style={{ height: `${Math.max(2, Math.round((d.kobo / max) * 100))}%` }} title={formatNaira(d.kobo)} />
              <span className="text-xs text-ink-500">{new Date(`${d.day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "narrow", timeZone: "UTC" })}</span>
            </div>
          ))}
        </div>
      </section>
      <p className="text-center text-xs text-ink-500">View only. Changes are made on the hotel computers.</p>
    </div>
  );
}

export default function OwnerPage() {
  return <Suspense fallback={<LoadingState />}><Content /></Suspense>;
}
