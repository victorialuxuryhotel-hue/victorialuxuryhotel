"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormMessage, Input, MoneyInput, Select } from "@/components/ui/form";
import { formatDateTime, formatNaira } from "@/lib/format";
import { decide } from "@/server/approvals";
import type { Approval, ApprovalState } from "@/server/domain/approvals";

const KIND = { refund: "Refund", no_show: "No-show", unpaid_change: "Unpaid change", leave_owing: "Leave owing" } as const;
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

/** The approvals list (design X10): type, guest, what, asked by, amount, and Review. */
export function ApprovalsTable({ rows, state, selfName }: { rows: Approval[]; state: ApprovalState; selfName: string }) {
  const [open, setOpen] = useState<Approval | null>(null);
  if (!rows.length) {
    return <p className="rounded-xl border border-hairline bg-white p-6 text-sm text-ink-600">{state === "waiting" ? "Nothing is waiting for you." : `Nothing ${state} yet.`}</p>;
  }
  return (
    <section className="rounded-xl border border-hairline bg-white">
      <h2 className="flex items-center gap-2 px-4 py-3 text-base font-bold text-ink-900">
        {state === "waiting" ? "Waiting for you" : state === "approved" ? "Approved" : "Declined"}
        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-[#eceae4] px-1.5 text-[13px] font-semibold tabular-nums">{rows.length}</span>
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-y border-hairline text-left text-xs text-ink-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Type</th>
              <th className="px-4 py-2.5 font-medium">Guest</th>
              <th className="px-4 py-2.5 font-medium">What</th>
              <th className="px-4 py-2.5 font-medium">{state === "waiting" ? "Asked by" : "Decided by"}</th>
              <th className="px-4 py-2.5 text-right font-medium">Amount</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {rows.map((r) => (
              <tr key={`${r.kind}:${r.id}`}>
                <td className="px-4 py-3"><Badge tone={r.kind === "unpaid_change" || r.kind === "leave_owing" ? "warning" : r.kind === "no_show" ? "neutral" : "info"}>{KIND[r.kind]}</Badge></td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2.5">
                    <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#e8eefb] text-xs font-bold text-navy-900">{initials(r.guestName)}</span>
                    <span><span className="block font-semibold text-ink-900">{r.guestName}</span><Link href={`/app/reservations/${r.reservationId}`} className="text-xs text-ink-500 hover:underline">{r.reference}</Link></span>
                  </span>
                </td>
                <td className="max-w-xs px-4 py-3 text-ink-700">{r.what}{r.note && state !== "waiting" ? <span className="block text-xs text-ink-500">“{r.note}”</span> : null}</td>
                <td className="px-4 py-3 text-ink-700">{state === "waiting" ? r.askedBy : r.decidedBy}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatNaira(r.amountKobo)}</td>
                <td className="px-4 py-3 text-right">{state === "waiting" ? <Button size="sm" variant="secondary" onClick={() => setOpen(r)}>Review</Button> : <span className="text-xs text-ink-500">{r.decidedAt ? formatDateTime(r.decidedAt) : ""}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open ? <ReviewDrawer item={open} onClose={() => setOpen(null)} selfName={selfName} /> : null}
    </section>
  );
}

function ReviewDrawer({ item, onClose, selfName }: { item: Approval; onClose: () => void; selfName: string }) {
  const refund = item.kind === "refund" || item.kind === "no_show";
  const [amount, setAmount] = useState(String(item.amountKobo / 100));
  const [method, setMethod] = useState<"bank_transfer" | "cash">((item.method as "bank_transfer" | "cash") ?? "bank_transfer");
  const [note, setNote] = useState(refund ? item.what : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const own = item.askedBy === selfName;

  const send = (approve: boolean) =>
    start(async () => {
      setError(null);
      const r = await decide({
        kind: item.kind, id: item.id, approve, note,
        ...(refund && approve ? { amountKobo: Math.round(Number(amount.replace(/[,\s₦]/g, "")) * 100), method } : {}),
      });
      if (r.ok) onClose();
      else setError(r.message);
    });

  const title = refund
    ? `Refund ${formatNaira(Math.round(Number(amount.replace(/[,\s₦]/g, "")) * 100) || 0)} to ${item.guestName}`
    : item.kind === "unpaid_change" ? `Apply before payment: ${item.guestName}` : `${item.guestName} left owing ${formatNaira(item.amountKobo)}`;
  const approveLabel = refund ? "Approve refund" : item.kind === "unpaid_change" ? "Apply the change" : "Agree";

  return (
    <Drawer
      open
      onClose={onClose}
      title={title}
      subtitle={`Asked by ${item.askedBy} · ${formatDateTime(item.askedAt)}`}
      footer={
        <>
          <Button size="lg" className="w-full" pending={pending} disabled={own || note.trim().length < 5} onClick={() => send(true)}>{approveLabel}</Button>
          <Button variant="danger" disabled={pending || own || note.trim().length < 5} onClick={() => send(false)}>{item.kind === "leave_owing" ? "Chase the payment" : "Decline"}</Button>
          {own ? <p className="text-center text-xs text-ink-500">You asked for this, so another manager or the owner decides it.</p> : null}
        </>
      }
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-ink-500">Booking</dt><dd><Link href={`/app/reservations/${item.reservationId}`} className="hover:underline">{item.reference}</Link> · {item.category}</dd>
        {refund && item.paidKobo != null ? (<><dt className="text-ink-500">Paid</dt><dd className="tabular-nums">{formatNaira(item.paidKobo)}{item.nights ? ` for ${item.nights} night${item.nights === 1 ? "" : "s"}` : ""}</dd></>) : null}
        {refund && item.usedKobo != null ? (<><dt className="text-ink-500">Used</dt><dd className="tabular-nums">{formatNaira(item.usedKobo)}</dd></>) : null}
        <dt className="text-ink-500">{refund ? "Policy" : "What"}</dt>
        <dd>{refund ? (item.kind === "no_show" ? "No-show: the first night is kept; the rest is refunded or kept" : "Unused nights refunded on request") : item.what}</dd>
        {!refund ? (<><dt className="text-ink-500">Amount</dt><dd className="font-semibold tabular-nums">{formatNaira(item.amountKobo)}</dd></>) : null}
      </dl>
      {refund ? (
        <div className="space-y-4">
          <Field label="Refund amount" htmlFor="amount" hint={item.limitKobo != null ? `Up to ${formatNaira(Math.min(item.amountKobo, item.limitKobo))}` : undefined}>
            <MoneyInput id="amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Pay back by" htmlFor="method">
            <Select id="method" value={method} onChange={(e) => setMethod(e.target.value as typeof method)} className="w-48">
              <option value="bank_transfer">Bank transfer</option>
              <option value="cash">Cash</option>
            </Select>
          </Field>
        </div>
      ) : null}
      <Field label="Reason (shown in the history)" htmlFor="note">
        <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className="w-full" />
      </Field>
      {error ? <FormMessage>{error}</FormMessage> : null}
    </Drawer>
  );
}
