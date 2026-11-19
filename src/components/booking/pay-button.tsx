"use client";

import { useActionState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form";
import { keepValues } from "@/lib/forms";
import { startPayment } from "@/server/booking";

export function PayButton({ token, label = "Pay securely with Paystack" }: { token: string; label?: string }) {
  const [state, action, pending] = useActionState(startPayment, null);
  return (
    <form action={action} onSubmit={keepValues(action)} className="mt-6 space-y-3">
      <input type="hidden" name="token" value={token} />
      {state && !state.ok ? <FormMessage>{state.message}</FormMessage> : null}
      <Button type="submit" size="lg" pending={pending} className="w-full sm:w-auto">
        <Lock className="size-4" aria-hidden /> {label}
      </Button>
    </form>
  );
}
