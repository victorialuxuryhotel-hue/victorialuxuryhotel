import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import type { CategoryRow } from "@/domain/views";
import { formatNaira } from "@/lib/format";

export function CategoryTable({ rows, hrefFor }: { rows: CategoryRow[]; hrefFor: (c: CategoryRow) => string }) {
  return (
    <>
      <ul className="divide-y divide-ivory-200 md:hidden">
        {rows.map((c) => (
          <li key={c.id}>
            <Link href={hrefFor(c)} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 px-4 py-3.5 hover:bg-ivory-50">
              <span className="text-base font-medium text-ink-900">{c.name}</span>
              <span className="text-right text-base tabular-nums">{formatNaira(c.nightlyRateKobo)}</span>
              <span className="text-xs text-ink-500 tabular-nums">
                Sleeps {c.maxOccupancy} · {c.rooms} rooms · {c.images === 0 ? "no photos yet" : `${c.images} photos`}
              </span>
              <span className="justify-self-end">{c.isActive ? <Badge tone="success">Bookable</Badge> : <Badge>Hidden</Badge>}</span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
    <Table>
      <THead>
        <tr><TH>Category</TH><TH className="text-right">Nightly rate</TH><TH>Sleeps</TH><TH>Rooms</TH><TH>Photos</TH><TH>Website</TH></tr>
      </THead>
      <TBody>
        {rows.map((c) => (
          <TR key={c.id}>
            <TD><Link href={hrefFor(c)} className="font-medium text-ink-900 hover:text-navy-700">{c.name}</Link></TD>
            <TD className="text-right tabular-nums">{formatNaira(c.nightlyRateKobo)}</TD>
            <TD>{c.maxOccupancy}</TD>
            <TD className="tabular-nums">{c.rooms}</TD>
            <TD>{c.images === 0 ? <span className="text-warning-700">None yet</span> : c.images}</TD>
            <TD>{c.isActive ? <Badge tone="success">Bookable</Badge> : <Badge>Hidden</Badge>}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
      </div>
    </>
  );
}
