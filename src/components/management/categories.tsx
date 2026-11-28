import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import type { CategoryRow } from "@/domain/views";
import { formatNaira } from "@/lib/format";

/** Room types (design R302): one table, prices right-aligned, website state as a badge, Edit at the end. */
export function CategoryTable({ rows, hrefFor }: { rows: CategoryRow[]; hrefFor: (c: CategoryRow) => string }) {
  return (
    <section className="overflow-clip rounded-xl border border-hairline bg-white">
      <h2 className="flex items-center gap-2.5 border-b border-hairline px-4 py-3 text-base font-bold text-ink-900">
        Room types <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-[#eceae4] px-2 text-[13px] font-semibold tabular-nums text-ink-700">{rows.length}</span>
      </h2>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead>
            <tr className="border-b border-hairline text-[13px] text-ink-500">
              <th scope="col" className="px-4 py-2.5 font-medium">Room type</th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">Per night</th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">Sleeps</th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">Rooms</th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">Photos</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Website</th>
              <th scope="col" className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {rows.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-2.5 font-semibold text-ink-900">{c.name}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right font-bold tabular-nums text-ink-900">{formatNaira(c.nightlyRateKobo)}</td>
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-ink-900">{c.maxOccupancy}</td>
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-ink-900">{c.rooms}</td>
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{c.images === 0 ? <span className="text-[#8a4b06]">None yet</span> : <span className="text-ink-900">{c.images}</span>}</td>
                <td className="px-4 py-2.5">{c.isActive ? <Badge tone="success">On the website</Badge> : <Badge>Hidden</Badge>}</td>
                <td className="px-4 py-2.5 text-right">
                  <Link href={hrefFor(c)} className={buttonStyles({ variant: "secondary", size: "sm" })} aria-label={`Edit ${c.name}`}>Edit</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
