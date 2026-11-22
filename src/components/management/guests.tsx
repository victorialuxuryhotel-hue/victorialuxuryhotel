import Link from "next/link";
import { ChevronRight, Mail, Phone } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import type { GuestRow, ReservationRow } from "@/domain/views";
import { formatDate, formatNaira, plural } from "@/lib/format";
import { GuestEditForm } from "./guest-form";
import { ReservationTable } from "./reservation-table";

export function GuestTable({ rows, hrefFor }: { rows: GuestRow[]; hrefFor: (g: GuestRow) => string }) {
  return (
    <>
      {/* Phones: one tappable row per guest. */}
      <ul className="divide-y divide-hairline md:hidden">
        {rows.map((g) => (
          <li key={g.id}>
            <Link href={hrefFor(g)} className="flex items-center gap-3 px-4 py-3.5 hover:bg-ivory-50">
              <span className="min-w-0 flex-1">
                <span className="block text-base text-ink-900">{g.name}</span>
                <span className="block text-sm text-ink-500 tabular-nums">{g.phone ?? g.email ?? "No contact details"}</span>
                <span className="mt-1.5 block text-xs text-ink-500 tabular-nums">
                  {plural(g.stays, "stay")}
                  {g.lastStay ? ` · last ${formatDate(g.lastStay, { weekday: false })}` : ""}
                </span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-ink-400" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
    <Table>
      <THead>
        <tr><TH>Guest</TH><TH>Contact</TH><TH>Stays</TH><TH>Last stay</TH><TH className="text-right">Total paid</TH></tr>
      </THead>
      <TBody>
        {rows.map((g) => (
          <TR key={g.id}>
            <TD>
              <Link href={hrefFor(g)} className="flex items-center gap-3 font-medium text-ink-900 hover:text-navy-700">
                <span className="flex size-9 items-center justify-center rounded-full bg-navy-50 text-xs font-semibold text-navy-800">
                  {g.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                </span>
                {g.name}
              </Link>
            </TD>
            <TD>
              <p>{g.phone ?? "—"}</p>
              <p className="text-xs text-ink-500">{g.email ?? "No email"}</p>
            </TD>
            <TD className="tabular-nums">{g.stays}</TD>
            <TD>{g.lastStay ? formatDate(g.lastStay) : "—"}</TD>
            <TD className="text-right tabular-nums">{formatNaira(g.totalPaidKobo)}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
      </div>
    </>
  );
}

export function GuestProfile({ guest, stays, stayHref }: { guest: GuestRow & { notes?: string }; stays: ReservationRow[]; stayHref: (r: ReservationRow) => string }) {
  return (
    <div className="grid gap-6 px-4 py-6 lg:grid-cols-[1fr_2fr] lg:px-8">
      <Card>
        <div className="flex flex-col items-center border-b border-hairline p-6 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-navy-50 text-xl font-semibold text-navy-800">
            {guest.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
          </span>
          <h1 className="mt-4 text-xl font-semibold text-ink-900">{guest.name}</h1>
          <div className="mt-3 flex flex-col items-center gap-1 text-sm text-ink-600">
            {guest.phone ? <a href={`tel:${guest.phone}`} className="flex items-center gap-2"><Phone className="size-4 text-ink-400" aria-hidden />{guest.phone}</a> : null}
            {guest.email ? <a href={`mailto:${guest.email}`} className="flex items-center gap-2"><Mail className="size-4 text-ink-400" aria-hidden />{guest.email}</a> : null}
          </div>
          <dl className="mt-6 grid w-full grid-cols-2 gap-4 text-sm">
            <div className="rounded-md bg-ivory-100 p-3"><dt className="text-ink-500">Stays</dt><dd className="mt-1 text-lg font-semibold">{guest.stays}</dd></div>
            <div className="rounded-md bg-ivory-100 p-3"><dt className="text-ink-500">Total paid</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{formatNaira(guest.totalPaidKobo)}</dd></div>
          </dl>
        </div>
        <GuestEditForm guest={guest} />
      </Card>
      <Card>
        <CardHeader title="Booking history" />
        <ReservationTable rows={stays} hrefFor={stayHref} />
      </Card>
    </div>
  );
}
