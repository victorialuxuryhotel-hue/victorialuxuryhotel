"use client";

import { useClerk } from "@clerk/nextjs";
import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/form";
import { cn } from "@/lib/utils/cn";
import { revokeStationAction, setUpStation } from "@/server/station";

const TYPES = [
  { value: "desk", label: "Front desk" },
  { value: "bar", label: "Bar till" },
  { value: "restaurant", label: "Restaurant till" },
  { value: "office", label: "Office" },
] as const;

/**
 * Set up this computer as a shared station (owner or GM). Once set up, your own sign-in on it ends:
 * from then on staff tap their name and enter their PIN.
 */
export function StationSetupForm() {
  const [state, action, pending] = useActionState(setUpStation, null);
  const [type, setType] = useState<(typeof TYPES)[number]["value"]>("desk");
  const { signOut } = useClerk();
  useEffect(() => {
    if (state?.ok) void signOut({ redirectUrl: "/station" });
  }, [state, signOut]);
  const err = (n: string) => (state && !state.ok ? state.fieldErrors?.[n]?.[0] : undefined);
  return (
    <form action={action} className="space-y-4">
      {state && !state.ok ? <FormMessage>{state.message}</FormMessage> : null}
      {state?.ok ? <FormMessage tone="success">{state.data.name} is set up. Signing you out…</FormMessage> : null}
      <fieldset>
        <legend className="mb-1.5 text-[13px] text-ink-700">Used as</legend>
        <div role="radiogroup" className="inline-flex w-fit rounded-md border border-hairline bg-white p-0.5">
          {TYPES.map((t) => (
            <label key={t.value} className={cn("cursor-pointer rounded px-3 py-2 text-sm whitespace-nowrap", type === t.value ? "bg-navy-900 text-white" : "text-ink-700 hover:bg-navy-50")}>
              <input type="radio" name="type" value={t.value} checked={type === t.value} onChange={() => setType(t.value)} className="sr-only" />
              {t.label}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Name" hint="What staff see on the lock screen" htmlFor="station-name" error={err("name")}>
        <Input id="station-name" name="name" required maxLength={40} placeholder={type === "desk" ? "Front desk 1" : type === "bar" ? "Bar counter" : type === "restaurant" ? "Restaurant till" : "Office"} className="w-64" />
      </Field>
      <Button type="submit" pending={pending}>Set up this computer</Button>
      <p className="text-xs text-ink-500">Your own sign-in on this computer ends. Staff then tap their name and use their PIN; managers can still use Manager sign-in.</p>
    </form>
  );
}

export function RevokeStationButton({ id, name }: { id: string; name: string }) {
  const [sure, setSure] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  if (!sure) return <Button variant="ghost" size="sm" onClick={() => setSure(true)}>Revoke</Button>;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="text-sm text-ink-700">Sign everyone out of {name} for good?</span>
      <Button
        variant="danger"
        size="sm"
        pending={pending}
        onClick={async () => {
          setPending(true);
          const r = await revokeStationAction(id);
          setPending(false);
          if (!r.ok) setError(r.message);
        }}
      >
        Revoke
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setSure(false)}>Keep</Button>
      {error ? <span role="alert" className="text-sm text-danger-700">{error}</span> : null}
    </span>
  );
}
