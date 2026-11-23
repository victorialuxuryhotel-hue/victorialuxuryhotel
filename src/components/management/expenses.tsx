"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, Select } from "@/components/ui/form";
import { formatDate, formatNaira } from "@/lib/format";
import { cn } from "@/lib/utils/cn";
import { addExpense, cancelExpense } from "@/server/finance";
import type { ExpenseCategory, ExpenseRow } from "@/server/domain/finance";

const departmentLabel: Record<string, string> = { rooms: "Rooms", restaurant_bar: "Restaurant & bar", hall: "Conference hall" };

export function ExpenseForm({ today, categories, methods, departments }: { today: string; categories: Record<string, string>; methods: Record<string, string>; departments: Record<string, string> }) {
  const [state, action, pending] = useActionState(addExpense, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);
  const err = (n: string) => (state && !state.ok ? state.fieldErrors?.[n]?.[0] : undefined);
  return (
    <form ref={form} action={action} className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
      {state?.ok ? <div className="sm:col-span-2 lg:col-span-3"><FormMessage tone="success">Expense recorded.</FormMessage></div> : null}
      {state && !state.ok && !state.fieldErrors ? <div className="sm:col-span-2 lg:col-span-3"><FormMessage>{state.message}</FormMessage></div> : null}
      <Field label="Date" htmlFor="eon" error={err("spentOn")}><Input id="eon" name="spentOn" type="date" max={today} defaultValue={today} required /></Field>
      <Field label="Category" htmlFor="ecat" error={err("category")}>
        <Select id="ecat" name="category" defaultValue="" required>
          <option value="" disabled>Choose…</option>
          {Object.entries(categories).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </Field>
      <Field label="Department" htmlFor="edept" error={err("department")}>
        <Select id="edept" name="department" defaultValue="general">{Object.entries(departments).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
      </Field>
      <Field label="Amount (₦)" htmlFor="eamt" error={err("amount")}><Input id="eamt" name="amount" type="number" min={1} step="any" inputMode="decimal" required /></Field>
      <Field label="What for" htmlFor="edesc" error={err("description")} className="sm:col-span-2"><Input id="edesc" name="description" placeholder="Diesel for generator" required /></Field>
      <Field label="Paid by" htmlFor="emeth">
        <Select id="emeth" name="method" defaultValue="cash">{Object.entries(methods).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
      </Field>
      <Field label="Reference" optional htmlFor="eref" hint="Receipt or transfer number."><Input id="eref" name="reference" /></Field>
      <div className="flex items-end lg:col-span-1"><Button type="submit" pending={pending}>Record expense</Button></div>
    </form>
  );
}

function VoidButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(cancelExpense, null);
  if (!open) return <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>Void</Button>;
  return (
    <form action={action} className="flex w-full flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <Input name="reason" placeholder="Why? e.g. entered twice" className="h-9 min-w-0 flex-1 text-sm" required />
      <Button type="submit" size="sm" variant="danger" pending={pending}>Void</Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Keep</Button>
      {state && !state.ok ? <p className="w-full text-xs text-danger-700">{state.message}</p> : null}
    </form>
  );
}

export function ExpenseList({ rows, categories }: { rows: ExpenseRow[]; categories: Record<ExpenseCategory, string> }) {
  if (!rows.length) return <p className="px-5 py-6 text-sm text-ink-500">No expenses in this period.</p>;
  return (
    <ul className="divide-y divide-hairline">
      {rows.map((r) => (
        <li key={r.id} className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3", r.voided_at && "opacity-55")}>
          <div className="min-w-0 flex-1">
            <p className={cn("text-[15px] text-ink-900", r.voided_at && "line-through")}>{r.description}</p>
            <p className="text-xs text-ink-500">
              {formatDate(r.spent_on, { year: false })} · {categories[r.category]}{r.department && r.department !== "general" ? ` · ${departmentLabel[r.department]}` : ""}{r.reference ? ` · ${r.reference}` : ""}{r.recorded_by_name ? ` · ${r.recorded_by_name}` : ""}
              {r.voided_at ? ` · Voided: ${r.void_reason}` : ""}
            </p>
          </div>
          <p className="text-[15px] tabular-nums text-ink-900">{formatNaira(r.amount_kobo)}</p>
          {r.voided_at ? null : <VoidButton id={r.id} />}
        </li>
      ))}
    </ul>
  );
}
