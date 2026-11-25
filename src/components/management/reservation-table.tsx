import { owedOf } from "@/domain/next-step";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { bookingSource } from "@/domain/status";
import type { ReservationRow } from "@/domain/views";
import { formatDate, formatNaira, nightsBetween, plural } from "@/lib/format";
import { PaidProgress, ReservationBadge } from "./badges";

/** today: the hotel date from the page, so dates in another year show their year. */
/** inHouse: the compact Today version: guest, room, check-out, what's owed, status (no source or payment bars). */
export function ReservationTable({ rows, hrefFor, today, inHouse = false }: { rows: ReservationRow[]; hrefFor: (r: ReservationRow) => string; today: string; inHouse?: boolean }) {
  const year = today.slice(0, 4);
  return (
    <>
      <ul className="divide-y divide-hairline md:hidden">
        {rows.map((r) => (
          <li key={r.id}>
            <Link href={hrefFor(r)} className="block px-4 py-4 hover:bg-ivory-50">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-ink-900">{r.guestName}</p>
                  <p className="mt-0.5 font-mono text-xs text-ink-500">{r.reference}</p>
                </div>
                <ReservationBadge status={r.status} />
              </div>
              <p className="mt-2 text-sm text-ink-600">
                {r.category}
                {r.roomNumber ? ` · Room ${r.roomNumber}` : ""} · {formatDate(r.checkIn, { year })} → {formatDate(r.checkOut, { year })}
              </p>
              {r.attention ? (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-warning-700">
                  <AlertTriangle className="size-3.5" aria-hidden /> Needs attention
                </p>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>

      <div className="hidden md:block">
        <Table>
          <THead>
            <tr>
              <TH>Guest</TH>
              <TH>{inHouse ? "Check-out" : "Stay"}</TH>
              <TH>Room</TH>
              {inHouse ? null : <TH>Source</TH>}
              <TH>{inHouse ? "Owed" : "Payment"}</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.id} className="cursor-pointer">
                <TD>
                  <Link href={hrefFor(r)} className="font-medium text-ink-900 hover:text-navy-700">{r.guestName}</Link>
                  <p className="font-mono text-xs text-ink-500">{r.reference}</p>
                </TD>
                {inHouse ? (
                  <TD>
                    <p className={r.checkOut < today ? "whitespace-nowrap font-medium text-danger-700" : "whitespace-nowrap text-ink-900"}>
                      {formatDate(r.checkOut, { year })}{r.checkOut < today ? " · overdue" : r.checkOut === today ? " · today" : ""}
                    </p>
                  </TD>
                ) : (
                <TD>
                  <p className="whitespace-nowrap text-ink-900">
                    {formatDate(r.checkIn, { year })} → {formatDate(r.checkOut, { year })}
                  </p>
                  <p className="text-xs text-ink-500">
                    {plural(nightsBetween(r.checkIn, r.checkOut), "night")} · {plural(r.guests, "guest")}
                  </p>
                </TD>
                )}
                <TD>
                  <p className="text-ink-900">{r.roomNumber ? `Room ${r.roomNumber}` : <span className="text-ink-400">Unassigned</span>}</p>
                  <p className="text-xs text-ink-500">{r.category}</p>
                </TD>
                {inHouse ? null : <TD>{bookingSource[r.source]}</TD>}
                {inHouse ? (
                  <TD>
                    {owedOf(r) > 0 ? <p className="font-semibold tabular-nums text-warning-700">{formatNaira(owedOf(r))}</p> : <p className="text-ink-500">Nothing</p>}
                  </TD>
                ) : (
                <TD>
                  <p className="tabular-nums text-ink-900">{formatNaira(r.totalKobo)}</p>
                  {r.status !== "cancelled" && r.status !== "expired" ? <PaidProgress paidKobo={r.paidKobo} totalKobo={r.totalKobo} format={formatNaira} /> : null}
                </TD>
                )}
                <TD>
                  <div className="flex flex-col items-start gap-1.5">
                    <ReservationBadge status={r.status} />
                    {r.attention ? (
                      <span className="flex items-center gap-1 text-xs text-warning-700" title={r.attention}>
                        <AlertTriangle className="size-3.5" aria-hidden /> Attention
                      </span>
                    ) : null}
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
    </>
  );
}
