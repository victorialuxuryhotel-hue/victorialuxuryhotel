"use client";

import { useActionState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form";
import { keepValues } from "@/lib/forms";
import { startPayment } from "@/server/booking";
import { MobileActionBar } from "./mobile-action-bar";

export function PayButton({ token, label = "Pay securely with Paystack", total }: { token: string; label?: string; total?: string }) {
  const [state, action, pending] = useActionState(startPayment, null);
  return (
    <form action={action} onSubmit={keepValues(action)} className="mt-6 space-y-3">
      <input type="hidden" name="token" value={token} />
      {state && !state.ok ? <FormMessage>{state.message}</FormMessage> : null}
      <Button type="submit" size="lg" pending={pending} className={total ? "hidden md:inline-flex" : "w-full sm:w-auto"}>
        <Lock className="size-4" aria-hidden /> {label}
      </Button>
      {total ? (
        <MobileActionBar label="Total" amount={total}>
          <Button type="submit" variant="accent" size="lg" pending={pending} className="shrink-0 px-5">
            <Lock className="size-4" aria-hidden /> Pay securely
          </Button>
        </MobileActionBar>
      ) : null}
    </form>
  );
}
