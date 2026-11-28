"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage, Input } from "@/components/ui/form";
import Link from "next/link";
import { buttonStyles } from "@/components/ui/button";
import { closeDebitIssue, confirmPayment } from "@/server/payments";

/** Matches / Not found for one payment. "Not found" asks what was checked, then raises an alert. */
export function ConfirmButtons({ sourceType, sourceId }: { sourceType: string; sourceId: string }) {
  const [state, action, pending] = useActionState(confirmPayment, null);
  const [missing, setMissing] = useState(false);
  return (
    <form action={action} className={`flex items-center justify-end gap-2 ${missing ? "flex-wrap" : ""}`}>
      <input type="hidden" name="sourceType" value={sourceType} />
      <input type="hidden" name="sourceId" value={sourceId} />
      {missing ? (
        <>
          <input type="hidden" name="outcome" value="not_found" />
          <Input name="note" required minLength={5} placeholder="What you checked, e.g. GTB statement 24–25 Nov" aria-label="What you checked" className="h-10 w-64 text-sm" autoFocus />
          <Button type="submit" size="sm" variant="danger" pending={pending}>Not found</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setMissing(false)}>Back</Button>
        </>
      ) : (
        <>
          <Button type="button" size="sm" variant="secondary" onClick={() => setMissing(true)}>Not found</Button>
          <Button type="submit" name="outcome" value="matched" size="sm" pending={pending}>Matches</Button>
        </>
      )}
      {state && !state.ok ? <FormMessage>{state.message}</FormMessage> : null}
    </form>
  );
}

/**
 * Close a "declined but debited" item after checking with the bank. If the money arrived, record it as a
 * payment on the booking or order first (Record it), then close with that payment's receipt.
 */
export function CloseIssueForm({ id, recordHref }: { id: string; recordHref: string }) {
  const [state, action, pending] = useActionState(closeDebitIssue, null);
  const [mode, setMode] = useState<null | "arrived" | "not">(null);
  return (
    <form action={action} className="flex flex-wrap items-center justify-end gap-2">
      <input type="hidden" name="id" value={id} />
      {mode === "arrived" ? (
        <>
          <input type="hidden" name="outcome" value="money_arrived" />
          <Input name="receipt" required placeholder="Receipt number, e.g. RCT-2026-000123" aria-label="Receipt number of the payment recorded for it" className="h-10 w-64 text-sm" autoFocus />
          <Button type="submit" size="sm" pending={pending}>Close</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setMode(null)}>Back</Button>
        </>
      ) : mode === "not" ? (
        <>
          <select name="outcome" aria-label="What the bank said" className="h-10 rounded-lg border border-[#bdb7a8] bg-white px-2 text-sm">
            <option value="not_debited">Not debited</option>
            <option value="refunded_by_bank">Reversed by the bank</option>
          </select>
          <Input name="note" required minLength={5} placeholder="What the bank said" aria-label="What the bank said" className="h-10 w-64 text-sm" autoFocus />
          <Button type="submit" size="sm" pending={pending}>Close</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setMode(null)}>Back</Button>
        </>
      ) : (
        <>
          <Link href={recordHref} className={buttonStyles({ size: "sm" })}>Money arrived: record it</Link>
          <Button type="button" size="sm" variant="secondary" onClick={() => setMode("arrived")}>Close with receipt</Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => setMode("not")}>Not debited</Button>
        </>
      )}
      {state && !state.ok ? <FormMessage>{state.message}</FormMessage> : null}
    </form>
  );
}
