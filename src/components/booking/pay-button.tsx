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
 * Pay through Paystack (designs G6, M7). `computer`: the full-width button in the "Your stay" box.
 * `phone`: the bar fixed to the bottom of the screen, with the total beside the button.
 */
export function PayButton({ token, total, part = "computer" }: { token: string; total: string; part?: "computer" | "phone" }) {
  const [state, action, pending] = useActionState(startPayment, null);
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const label = pending ? "Processing payment…" : <><Lock className="size-4" aria-hidden /> Pay {total}</>;
  if (part === "phone") {
    return (
      <form action={action} onSubmit={keepValues(action)} className="lg:hidden">
        <input type="hidden" name="token" value={token} />
        {state && !state.ok ? <FormMessage>{state.message}</FormMessage> : null}
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-white px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-3">
            <p className="leading-tight tabular-nums">
              <span className="block text-xs text-muted">Total</span>
              <span className="block text-xl font-bold text-ink-900">{total}</span>
            </p>
            <Button type="submit" size="lg" pending={pending} className="flex-1">{label}</Button>
          </div>
          <p className="mt-1 text-center text-xs text-muted">{NOTE}</p>
        </div>
        {mounted ? createPortal(<div aria-hidden className="h-28 shrink-0 bg-white lg:hidden" />, document.body) : null}
      </form>
    );
  }
  return (
    <form action={action} onSubmit={keepValues(action)} className="flex flex-col gap-2">
      <input type="hidden" name="token" value={token} />
      {state && !state.ok ? <FormMessage>{state.message}</FormMessage> : null}
      <Button type="submit" size="lg" pending={pending} className="w-full">{label}</Button>
      <p className="text-center text-xs text-muted">Secured by Paystack · card, transfer or USSD</p>
      <p className="text-center text-xs text-muted">{NOTE}</p>
    </form>
  );
}
