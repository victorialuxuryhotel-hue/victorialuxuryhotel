"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage, Input } from "@/components/ui/form";
import { confirmPayment } from "@/server/payments";

/** Matches / Not found for one payment. "Not found" asks what was checked, then raises an alert. */
export function ConfirmButtons({ sourceType, sourceId }: { sourceType: string; sourceId: string }) {
  const [state, action, pending] = useActionState(confirmPayment, null);
  const [missing, setMissing] = useState(false);
  return (
    <form action={action} className="flex flex-wrap items-center justify-end gap-2">
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
          <Button type="submit" name="outcome" value="matched" size="sm" pending={pending}>Matches</Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => setMissing(true)}>Not found</Button>
        </>
      )}
      {state && !state.ok ? <FormMessage>{state.message}</FormMessage> : null}
    </form>
  );
}
