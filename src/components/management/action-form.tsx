"use client";

import { useActionState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/errors";
import { cn } from "@/lib/utils/cn";

type Action<T> = (prev: ActionResult<T> | null, formData: FormData) => Promise<ActionResult<T>>;

/**
 * A single-button form bound to a server action, with pending and error
 * states. The server decides whether the action is allowed; this only
 * reports the outcome.
 */
export function ActionButton<T>({
  action,
  fields,
  children,
  variant,
  size,
  className,
  confirm,
  successMessage,
}: {
  action: Action<T>;
  fields: Record<string, string>;
  children: ReactNode;
  variant?: "primary" | "accent" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  className?: string;
  /** Native confirmation prompt for irreversible actions. */
  confirm?: string;
  successMessage?: (data: T) => string | null;
}) {
  const [state, formAction, pending] = useActionState<ActionResult<T> | null, FormData>(action, null);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className={cn("inline-flex flex-col items-end gap-1", className)}
    >
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Button type="submit" variant={variant} size={size} pending={pending}>
        {children}
      </Button>
      {state && !state.ok ? <p role="alert" className="max-w-xs text-right text-xs text-danger-700">{state.message}</p> : null}
      {state?.ok && successMessage ? <p role="status" className="max-w-xs text-right text-xs text-success-700">{successMessage(state.data)}</p> : null}
    </form>
  );
}
