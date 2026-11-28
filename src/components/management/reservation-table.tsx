import { owedOf } from "@/domain/next-step";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import type { ReservationRow } from "@/domain/views";
import { formatDate, formatNaira, formatRange } from "@/lib/format";
import { opensPanel } from "@/lib/panel";
import { BookingStatusBadge, ReservationBadge, SourceBadge } from "./badges";
import { GuestAvatar } from "./guest-avatar";

const Attention = ({ r }: { r: ReservationRow }) =>
  r.attention ? (
    <span className="flex items-center gap-1 text-xs text-[#8a4b06]" title={r.attention}>
      <AlertTriangle className="size-3.5" aria-hidden /> Needs attention
    </span>
  ) : null;

/** today: the hotel date from the page, so dates in another year show their year. */
/** inHouse: the compact Today version: guest, room, check-out, what's owed, status (no source). */
export function ReservationTable({ rows, hrefFor, today, inHouse = false }: { rows: ReservationRow[]; hrefFor: (r: ReservationRow) => string; today: string; inHouse?: boolean }) {
  const year = today.slice(0, 4);
  return (
    <>
      <ul className="divide-y divide-[#f1eee8] md:hidden">
        {rows.map((r) => (
          <li key={r.id}>
            <Link href={hrefFor(r)} scroll={!opensPanel(hrefFor(r))} className="block px-4 py-3.5 hover:bg-ivory-50">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2.5">
                  <GuestAvatar name={r.guestName} size="sm" />
                  <div className="min-w-0">
                    <p className="font-semibold text-ink-900">{r.guestName}</p>
                    <p className="mt-0.5 text-xs font-semibold text-[#5b6372]">{r.reference}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <BookingStatusBadge r={r} today={today} />
                  <SourceBadge source={r.source} />
                </div>
              </div>
              <p className="mt-2 text-sm text-ink-700">
                {r.category}
                {r.roomNumber ? ` · ${r.roomNumber}` : ""} · {formatRange(r.checkIn, r.checkOut, year)}
                <span className="float-right font-semibold tabular-nums text-ink-900">{formatNaira(r.totalKobo)}</span>
              </p>
              {r.attention ? <p className="mt-2"><Attention r={r} /></p> : null}
            </Link>
          </li>
        ))}
      </ul>

      <div className="hidden md:block">
        {inHouse ? (
          <Table>
            <THead>
              <tr>
                <TH>Guest</TH>
                <TH>Check-out</TH>
                <TH>Room</TH>
                <TH className="text-right">Owed</TH>
                <TH>Status</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <div className="flex items-center gap-2.5">
                      <GuestAvatar name={r.guestName} size="sm" />
                      <div className="min-w-0">
                        <Link href={hrefFor(r)} scroll={!opensPanel(hrefFor(r))} className="font-semibold text-ink-900 hover:text-navy-700">{r.guestName}</Link>
                        <p className="text-xs text-[#5b6372]">{r.reference}</p>
                      </div>
                    </div>
                  </TD>
                  <TD>
                    <p className={r.checkOut < today ? "whitespace-nowrap font-semibold text-[#a61b1b]" : "whitespace-nowrap"}>
                      {formatDate(r.checkOut, { year })}{r.checkOut < today ? " · overdue" : r.checkOut === today ? " · today" : ""}
                    </p>
                  </TD>
                  <TD className="whitespace-nowrap">{r.category} · {r.roomNumber ?? <span className="text-[#8a4b06]">no room yet</span>}</TD>
                  <TD className="text-right">
                    {owedOf(r) > 0 ? <span className="font-semibold text-[#8a4b06]">{formatNaira(owedOf(r))}</span> : <span className="text-[#5b6372]">Nothing</span>}
                  </TD>
                  <TD>
                    <div className="flex flex-col items-start gap-1.5">
                      <ReservationBadge status={r.status} />
                      <SourceBadge source={r.source} />
                      <Attention r={r} />
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Reference</TH>
                <TH>Guest</TH>
                <TH>Source</TH>
                <TH>Dates</TH>
                <TH>Room</TH>
                <TH>Status</TH>
                <TH className="text-right">Total</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((r) => (
                  <TR key={r.id}>
                    <TD className="whitespace-nowrap">
                      <Link href={hrefFor(r)} scroll={!opensPanel(hrefFor(r))} className="font-bold text-ink-900 hover:text-navy-700">{r.reference}</Link>
                    </TD>
                    <TD>
                      <span className="flex items-center gap-2.5">
                        <GuestAvatar name={r.guestName} size="sm" />
                        <span className="font-semibold">{r.guestName}</span>
                      </span>
                    </TD>
                    <TD><SourceBadge source={r.source} /></TD>
                    <TD className="whitespace-nowrap">{formatRange(r.checkIn, r.checkOut, year)}</TD>
                    <TD className="whitespace-nowrap">
                      {r.category}
                      {r.roomNumber ? ` · ${r.roomNumber}` : r.status === "confirmed" || r.status === "pending_payment" ? <> · <span className="text-[#8a4b06]">no room yet</span></> : null}
                    </TD>
                    <TD>
                      <div className="flex flex-col items-start gap-1">
                        <BookingStatusBadge r={r} today={today} />
                        <Attention r={r} />
                      </div>
                    </TD>
                    <TD className="text-right whitespace-nowrap">
                      <span className="font-semibold">{formatNaira(r.totalKobo)}</span>
                    </TD>
                  </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </>
  );
}
