"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/form";
import { formatDateTime, formatNaira } from "@/lib/format";
import { cn } from "@/lib/utils/cn";
import { settleCharges } from "@/server/pos";

type Charge = { id: string; number: number; total_kobo: number; status: string; created_at: string; items: string };
const METHODS = { cash: "Cash", bank_transfer: "Transfer", pos_terminal: "POS" } as const;

export function RoomCharges({ reservationId, charges, canSettle }: { reservationId: string; charges: Charge[]; canSettle: boolean }) {
  const [method, setMethod] = useState<keyof typeof METHODS>("cash");
  const [state, action, pending] = useActionState(settleCharges, null);
  const unpaid = charges.filter((c) => c.status === "room_charge").reduce((s, c) => s + c.total_kobo, 0);
  return (
    <Card>
      <CardHeader title="Restaurant & bar" description={unpaid ? `${formatNaira(unpaid)} unpaid: settle before check-out` : "All charges paid"} />
      <ul className="divide-y divide-hairline">
        {charges.map((c) => (
          <li key={c.id} className="flex items-center gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-ink-900">#{c.number} · {c.items}</p>
              <p className="text-xs text-ink-500">{formatDateTime(c.created_at)} · {c.status === "room_charge" ? "Unpaid" : "Paid"}</p>
            </div>
            <span className="text-sm tabular-nums">{formatNaira(c.total_kobo)}</span>
          </li>
        ))}
      </ul>
      {unpaid && canSettle ? (
        <form action={action} className="space-y-3 border-t border-hairline p-5">
          <input type="hidden" name="reservationId" value={reservationId} />
          <input type="hidden" name="method" value={method} />
          {state && !state.ok ? <FormMessage>{state.message}</FormMessage> : null}
          <div className="flex flex-wrap gap-2">
            {Object.entries(METHODS).map(([k, v]) => (
              <button key={k} type="button" aria-pressed={method === k} onClick={() => setMethod(k as keyof typeof METHODS)}
                className={cn("min-h-11 rounded-full border px-4 text-sm", method === k ? "border-navy-800 bg-navy-50 text-navy-800" : "border-hairline")}>{v}</button>
            ))}
          </div>
          <Button type="submit" pending={pending}>Take {formatNaira(unpaid)}</Button>
        </form>
      ) : null}
      {state?.ok ? <div className="px-5 pb-5"><FormMessage tone="success">{formatNaira(state.data.kobo)} received.</FormMessage></div> : null}
    </Card>
  );
}
