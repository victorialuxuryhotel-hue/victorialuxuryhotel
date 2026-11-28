import Link from "next/link";
import { ChevronRight, Mail, Phone } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { Card, Section } from "@/components/ui/card";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import type { GuestRow, ReservationRow } from "@/domain/views";
import { formatDate, formatNaira, plural } from "@/lib/format";
import { GuestEditForm } from "./guest-form";
import { ReservationTable } from "./reservation-table";
import { GuestAvatar } from "./guest-avatar";

export function GuestTable({ rows, hrefFor }: { rows: GuestRow[]; hrefFor: (g: GuestRow) => string }) {
  return (
    <>
      <ul className="divide-y divide-[#f1eee8] md:hidden">
        {rows.map((g) => (
          <li key={g.id}>
            <Link href={hrefFor(g)} className="flex items-center gap-3 px-4 py-3.5 hover:bg-ivory-50">
              <GuestAvatar name={g.name} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink-900">{g.name}</span>
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
            <tr>
              <TH>Guest</TH>
              <TH>Phone</TH>
              <TH className="text-right">Stays</TH>
              <TH>Last stay</TH>
              <TH className="text-right">Total paid</TH>
              <TH><span className="sr-only">Open</span></TH>
            </tr>
          </THead>
          <TBody>
            {rows.map((g) => (
              <TR key={g.id}>
                <TD>
                  <span className="flex items-center gap-2.5">
                    <GuestAvatar name={g.name} size="sm" />
                    <span className="flex min-w-0 flex-col">
                      <span className="font-semibold">{g.name}</span>
                      <span className="truncate text-xs text-[#5b6372]">{g.email ?? "No email"}</span>
                    </span>
                  </span>
                </TD>
                <TD className="whitespace-nowrap">{g.phone ?? "—"}</TD>
                <TD className="text-right font-semibold">{g.stays}</TD>
                <TD className="whitespace-nowrap">{g.lastStay ? formatDate(g.lastStay, { weekday: false }) : "—"}</TD>
                <TD className="text-right font-semibold whitespace-nowrap">{formatNaira(g.totalPaidKobo)}</TD>
                <TD className="w-px py-1.5 text-right">
                  <Link href={hrefFor(g)} className={buttonStyles({ variant: "secondary", size: "sm" })} aria-label={`Open ${g.name}`}>Open</Link>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
    </>
  );
}

export function GuestProfile({ guest, stays, stayHref, today }: { guest: GuestRow & { notes?: string }; stays: ReservationRow[]; stayHref: (r: ReservationRow) => string; today: string }) {
  return (
    <div className="grid gap-3.5 px-4 py-5 lg:grid-cols-[1fr_2fr] lg:items-start lg:px-7">
      <Card className="rounded-xl bg-white">
        <div className="flex flex-col items-center border-b border-hairline p-6 text-center">
          <GuestAvatar name={guest.name} className="size-16 text-xl" />
          <h1 className="mt-4 text-[22px] font-bold text-ink-900">{guest.name}</h1>
          <div className="mt-3 flex flex-col items-center gap-1 text-sm text-ink-600">
            {guest.phone ? <a href={`tel:${guest.phone}`} className="flex items-center gap-2"><Phone className="size-4 text-ink-400" aria-hidden />{guest.phone}</a> : null}
            {guest.email ? <a href={`mailto:${guest.email}`} className="flex items-center gap-2"><Mail className="size-4 text-ink-400" aria-hidden />{guest.email}</a> : null}
          </div>
          <dl className="mt-6 grid w-full grid-cols-2 gap-4 text-sm">
            <div className="rounded-xl border border-hairline p-3"><dt className="text-[13px] font-semibold text-[#5b6372]">Stays</dt><dd className="mt-0.5 text-2xl font-bold">{guest.stays}</dd></div>
            <div className="rounded-xl border border-hairline p-3"><dt className="text-[13px] font-semibold text-[#5b6372]">Total paid</dt><dd className="mt-0.5 text-2xl font-bold tabular-nums">{formatNaira(guest.totalPaidKobo)}</dd></div>
          </dl>
        </div>
        <GuestEditForm guest={guest} />
      </Card>
      <Section title="Stays" count={stays.length}>
        <ReservationTable rows={stays} hrefFor={stayHref} today={today} />
      </Section>
    </div>
  );
}
