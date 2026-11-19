"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/form";
import { signIn, type SignInState } from "./actions";
import { keepValues } from "@/lib/forms";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, {});

  return (
    <form action={action} onSubmit={keepValues(action)} className="space-y-5" noValidate>
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="username" required defaultValue={state.email} className="h-11" />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required className="h-11" />
      </Field>
      <Button type="submit" size="lg" pending={pending} className="w-full">
        Sign in
      </Button>
    </form>
  );
}
