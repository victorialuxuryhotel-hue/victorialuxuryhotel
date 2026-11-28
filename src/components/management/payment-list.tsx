"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/card";
import { Chip } from "@/components/ui/choice";
import { EmptyState } from "@/components/ui/feedback";
import { paymentMethod } from "@/domain/status";
import type { PaymentRow } from "@/domain/views";
import { formatNaira } from "@/lib/format";
import { cn } from "@/lib/utils/cn";
import { GuestAvatar } from "./guest-avatar";

export type ListedRow = PaymentRow & { at: string; recordedById?: string; kind: "payment" | "refund"; toConfirm?: boolean };
/** Links worked out on the server (functions can't be passed to this client component). */
type LinkedRow = ListedRow & { href: string; receiptHref?: string };

type Method = "cash" | "transfer" | "pos" | "online";
const METHODS: Array<[Method, string]> = [["cash", "Cash"], ["transfer", "Transfer"], ["pos", "POS"], ["online", "Online"]];
const methodOf = (p: ListedRow): Method | "other" =>
  p.provider === "paystack" ? "online" : p.method === "cash" ? "cash" : p.method === "bank_transfer" ? "transfer" : p.method === "pos_terminal" ? "pos" : "other";

/** "Card online", "Cash", "Transfer · 7741203", "POS · slip 4417" (design R107). */
function methodLabel(p: ListedRow): string {
  if (p.kind === "refund") return "Correction";
  switch (methodOf(p)) {
    case "online":
      return "Card online";
    case "transfer":
      return p.providerReference ? `Transfer · ${p.providerReference}` : "Transfer";
    case "pos":
      return p.providerReference ? `POS · slip ${p.providerReference}` : "POS";
    default:
      return paymentMethod[p.method];
  }
}

const TZ = "Africa/Lagos";
const time = (iso: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(iso));
const dateTime = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(iso));

const th = "px-4 py-2.5 text-xs font-semibold text-[#5b6372] whitespace-nowrap";
const td = "px-4 py-2.5 align-middle text-sm text-ink-900";

/**
 * The payments table with method chips (design R107): chips narrow the list on screen, several at once.
 * Status: Paid, To confirm (a transfer or POS payment not yet checked) or Correction.
 */
export function PaymentList({ rows, todayOnly, staffId, footer, empty, leading }: {
  rows: LinkedRow[]; todayOnly: boolean; staffId?: string; footer?: ReactNode; empty: string;
  /** Shown at the left of the chips (Today | Mine). */
  leading?: ReactNode;
}) {
  const [on, setOn] = useState<Method[]>([]);
  const shown = on.length ? rows.filter((p) => on.includes(methodOf(p) as Method)) : rows;
  const who = (p: ListedRow) =>
    p.provider === "paystack" ? "Website" : staffId && p.recordedById === staffId ? "You" : (p.recordedBy?.split(" ")[0] ?? "Staff");
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {leading ?? <span />}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Show only">
          {METHODS.map(([m, label]) => (
            <Chip key={m} on={on.includes(m)} onClick={() => setOn((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]))}>{label}</Chip>
          ))}
        </div>
      </div>
      <Section title="Payments" count={shown.length}>
        {shown.length === 0 ? (
          <div className="p-5"><EmptyState title={rows.length ? "No payments by that method" : empty} /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-left tabular-nums">
              <thead className="border-b border-hairline">
                <tr>
                  <th scope="col" className={th}>Time</th>
                  <th scope="col" className={th}>Receipt</th>
                  <th scope="col" className={th}>From</th>
                  <th scope="col" className={th}>Method</th>
                  <th scope="col" className={th}>Status</th>
                  <th scope="col" className={cn(th, "text-right")}>Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1eee8]">
                {shown.map((p) => (
                  <tr key={p.id} className="hover:bg-ivory-50">
                    <td className={cn(td, "whitespace-nowrap")}>{todayOnly ? time(p.at) : dateTime(p.at)}</td>
                    <td className={cn(td, "whitespace-nowrap")}>
                      {p.receiptNumber && p.receiptHref ? <Link href={p.receiptHref} className="font-bold hover:text-navy-700">{p.receiptNumber}</Link> : "—"}
                    </td>
                    <td className={td}>
                      <Link href={p.href} className="group flex items-center gap-2.5">
                        <GuestAvatar name={p.guestName} size="sm" />
                        <span className="flex flex-col">
                          <span className="font-semibold group-hover:text-navy-700">{p.guestName}</span>
                          <span className="text-xs text-[#5b6372]">{p.reservationReference}</span>
                        </span>
                      </Link>
                    </td>
                    <td className={td}>
                      {methodLabel(p)}
                      <span className="block text-xs text-[#5b6372]">{p.provider === "paystack" ? "Paystack" : `Taken by ${who(p)}`}</span>
                    </td>
                    <td className={td}>
                      {p.kind === "refund" ? <Badge tone="neutral">Correction</Badge> : p.toConfirm ? <Badge tone="warning">To confirm</Badge> : <Badge tone="success">Paid</Badge>}
                    </td>
                    <td className={cn(td, "text-right font-semibold whitespace-nowrap")}>{p.kind === "refund" ? "−" : ""}{formatNaira(p.amountKobo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {footer}
      </Section>
    </>
  );
}
