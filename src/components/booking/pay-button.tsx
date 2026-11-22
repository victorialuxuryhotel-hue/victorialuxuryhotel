"use client";

import { useActionState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form";
import { keepValues } from "@/lib/forms";
import { startPayment } from "@/server/booking";

const noop = () => () => {};
const NOTE = "Lost connection after paying? We'll still confirm it.";

/**
 * "Pay ₦110,000". On phones the button is pinned to the bottom (full width,
 * 50px) with the reassurance under it; it stays the form's real submit.
 * The note is true because the Paystack webhook confirms payment even if the
 * guest never returns to the site.
 */
export function PayButton({ token, total }: { token: string; total: string }) {
  const [state, action, pending] = useActionState(startPayment, null);
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  return (
    <form action={action} onSubmit={keepValues(action)} className="mt-6 space-y-3">
      <input type="hidden" name="token" value={token} />
      {state && !state.ok ? <FormMessage>{state.message}</FormMessage> : null}
      <div className="hidden md:block">
        <Button type="submit" variant="accent" size="lg" pending={pending}><Lock className="size-4" aria-hidden /> Pay {total}</Button>
        <p className="mt-2 text-xs text-ink-500">{NOTE}</p>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-40 space-y-1.5 border-t border-hairline bg-ivory-50/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
        <Button type="submit" variant="accent" size="lg" pending={pending} className="w-full text-base"><Lock className="size-4" aria-hidden /> Pay {total}</Button>
        <p className="text-center text-xs text-ink-500">{NOTE}</p>
      </div>
      {mounted ? createPortal(<div aria-hidden className="h-28 shrink-0 bg-navy-950 md:hidden" />, document.body) : null}
    </form>
  );
}
