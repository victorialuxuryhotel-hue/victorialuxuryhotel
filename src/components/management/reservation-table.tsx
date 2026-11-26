import Link from "next/link";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { bookingSource } from "@/domain/status";
import type { ReservationRow } from "@/domain/views";
import { formatDate, formatNaira, nightsBetween, plural } from "@/lib/format";
import { PaidProgress, ReservationBadge } from "./badges";
import { NextStep } from "./next-step";

export function ReservationTable({ rows, hrefFor, today }: {
  rows: ReservationRow[];
  hrefFor: (r: ReservationRow) => string;
  /** Pass the hotel date to offer each booking's next step. Leave out for read-only lists. */
  today?: string;
}) {
  return (
    <>
      <ul className="divide-y divide-hairline md:hidden">
        {rows.map((r) => (
          <li key={r.id} className="px-4 py-3.5">
            <Link href={hrefFor(r)} className="block">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-ink-900">{r.guestName}</p>
                  <p className="mt-0.5 font-mono text-xs text-ink-500">{r.reference}</p>
                </div>
                <ReservationBadge status={r.status} />
              </div>
              <p className="mt-2 text-sm text-ink-600">
                {r.category}
                {r.roomNumber ? ` · Room ${r.roomNumber}` : ""} · {formatDate(r.checkIn, { year: false })} → {formatDate(r.checkOut, { year: false })}
              </p>
              <p className="mt-0.5 text-[13px] tabular-nums text-ink-600">
                {formatNaira(r.totalKobo)}
                {r.status === "cancelled" || r.status === "expired" ? null : r.totalKobo > r.paidKobo ? (
                  <span className="text-warning-700"> · {formatNaira(r.totalKobo - r.paidKobo)} due</span>
                ) : (
                  <span className="text-success-700"> · Paid in full</span>
                )}
              </p>
              {r.attention ? <p className="mt-1.5 text-xs leading-snug text-warning-700">{r.attention}</p> : null}
            </Link>
            {today ? (
              <div className="mt-2.5 empty:hidden [&_a]:h-11 [&_a]:w-full [&_button]:!h-11 [&_button]:w-full [&_form]:items-stretch [&>div]:w-full">
                <NextStep r={r} today={today} href={hrefFor(r)} />
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="hidden md:block">
        <Table>
          <THead>
            <tr>
              <TH>Guest</TH>
              <TH>Stay</TH>
              <TH>Room</TH>
              <TH>Payment</TH>
              <TH>{today ? "Status & next step" : "Status"}</TH>
            </tr>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.id}>
                <TD>
                  <Link href={hrefFor(r)} className="font-medium whitespace-nowrap text-ink-900 hover:text-navy-700">{r.guestName}</Link>
                  <p className="font-mono text-xs text-ink-500">{r.reference}</p>
                </TD>
                <TD>
                  <p className="whitespace-nowrap text-ink-900">
                    {formatDate(r.checkIn, { year: false })} → {formatDate(r.checkOut, { year: false })}
                  </p>
                  <p className="text-xs text-ink-500">
                    {plural(nightsBetween(r.checkIn, r.checkOut), "night")} · {plural(r.guests, "guest")}
                  </p>
                </TD>
                <TD>
                  <p className="text-ink-900">{r.roomNumber ? `Room ${r.roomNumber}` : <span className="text-ink-400">No room yet</span>}</p>
                  <p className="text-xs text-ink-500">{r.category} · {bookingSource[r.source]}</p>
                </TD>
                <TD>
                  <p className="tabular-nums text-ink-900">{formatNaira(r.totalKobo)}</p>
                  {r.status !== "cancelled" && r.status !== "expired" ? <PaidProgress paidKobo={r.paidKobo} totalKobo={r.totalKobo} format={formatNaira} /> : null}
                </TD>
                <TD>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-col items-start gap-1.5">
                      <ReservationBadge status={r.status} />
                      {r.attention ? <p className="max-w-60 text-xs leading-snug text-warning-700">{r.attention}</p> : null}
                    </div>
                    {today ? <NextStep r={r} today={today} href={hrefFor(r)} /> : null}
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
