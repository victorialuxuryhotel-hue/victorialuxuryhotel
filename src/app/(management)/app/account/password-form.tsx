"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/form";
import { setPassword } from "@/server/account";
import { keepValues } from "@/lib/forms";

export function PasswordForm() {
  const [state, action, pending] = useActionState(setPassword, null);
  const err = (n: string) => (state && !state.ok ? state.fieldErrors?.[n]?.[0] : undefined);
  return (
    <form action={action} onSubmit={keepValues(action)} className="space-y-5 p-5">
      {state?.ok ? <FormMessage tone="success">Password saved. Use it next time you sign in.</FormMessage> : null}
      {state && !state.ok && !state.fieldErrors ? <FormMessage>{state.message}</FormMessage> : null}
      <Field label="New password" htmlFor="pw" hint="At least 10 characters." error={err("password")}>
        <Input id="pw" name="password" type="password" autoComplete="new-password" required minLength={10} />
      </Field>
      <Field label="Confirm password" htmlFor="pw2" error={err("confirm")}>
        <Input id="pw2" name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <Button type="submit" pending={pending}>Save password</Button>
    </form>
  );
}
