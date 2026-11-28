"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/form";
import { payByLink } from "@/server/pay-links";

export function PayButton({ code, amount, needsEmail }: { code: string; amount: string; needsEmail: boolean }) {
  const [state, action, pending] = useActionState(payByLink, null);
  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="code" value={code} />
      {needsEmail ? (
        <Field label="Your email" htmlFor="email" hint="For your receipt" error={state && !state.ok ? state.fieldErrors?.email?.[0] : undefined}>
          <Input id="email" name="email" type="email" autoComplete="email" required className="w-full" />
        </Field>
      ) : null}
      {state && !state.ok && !state.fieldErrors?.email ? <FormMessage>{state.message}</FormMessage> : null}
      <p className="text-center text-sm text-ink-500">Card, bank transfer or USSD · secured by Paystack</p>
      <Button type="submit" variant="primary" size="lg" pending={pending} className="h-13 w-full text-base">Pay {amount}</Button>
    </form>
  );
}
