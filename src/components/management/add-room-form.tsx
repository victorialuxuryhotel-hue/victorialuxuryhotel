"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, Select } from "@/components/ui/form";
import { createRoom } from "@/server/rooms";
import { keepValues } from "@/lib/forms";

export function AddRoomForm({ categories }: { categories: Array<{ id: string; name: string }> }) {
  const [state, action, pending] = useActionState(createRoom, null);
  const err = (n: string) => (state && !state.ok ? state.fieldErrors?.[n]?.[0] : undefined);
  return (
    <form action={action} onSubmit={keepValues(action)} className="space-y-3 p-5">
      {state && !state.ok && !state.fieldErrors ? <FormMessage>{state.message}</FormMessage> : null}
      {state?.ok ? <FormMessage tone="success">Room added.</FormMessage> : null}
      <div className="grid gap-4 sm:grid-cols-[1fr_1.5fr_1fr_auto] sm:items-start">
        <Field label="Room number" htmlFor="rnum" error={err("roomNumber")}><Input id="rnum" name="roomNumber" required maxLength={10} /></Field>
        <Field label="Category" htmlFor="rcat" error={err("categoryId")}>
          <Select id="rcat" name="categoryId" defaultValue="" required>
            <option value="" disabled>Choose</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Floor" optional htmlFor="rfloor"><Input id="rfloor" name="floor" maxLength={10} /></Field>
        <Button type="submit" variant="secondary" pending={pending} className="sm:mt-7">Add room</Button>
      </div>
    </form>
  );
}
