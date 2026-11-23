"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/form";
import { staffRole, type StaffRole } from "@/domain/status";
import type { StaffRow } from "@/domain/views";
import type { ActionResult } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { keepValues } from "@/lib/forms";
import { hotelDateOf } from "@/lib/hotel-date";
import { cn } from "@/lib/utils/cn";
import { inviteStaff, makeOwner, updateStaff } from "@/server/staff";

const fieldError = (state: ActionResult<unknown> | null, name: string) => (state && !state.ok ? state.fieldErrors?.[name]?.[0] : undefined);

const ROLE_HELP: Record<Exclude<StaffRole, "owner">, string> = {
  front_desk: "Bookings, check-in and out, taking payments, room status and hall bookings.",
  general_manager: "Everything front desk does, plus prices, reports, refunds, discounts and expenses.",
  finance: "Reports, payments and expenses. No bookings or rooms.",
};
const ASSIGNABLE = ["front_desk", "finance", "general_manager"] as const;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

function status(s: StaffRow, today: string): string {
  if (!s.isActive) return "Access removed";
  if (s.lastSeen && hotelDateOf(s.lastSeen) === today) return "Active today";
  if (s.lastSeen) return `Last active ${formatDate(hotelDateOf(s.lastSeen), { year: hotelDateOf(s.lastSeen).slice(0, 4) !== today.slice(0, 4) })}`;
  return s.invited ? "Invited · not signed in yet" : "Not signed in yet";
}

function RoleTag({ role }: { role: StaffRole }) {
  return (
    <span className={cn("shrink-0 rounded-full border px-2.5 py-0.5 text-xs whitespace-nowrap", role === "owner" ? "border-gold-500 text-gold-800" : "border-hairline text-ink-700")}>
      {staffRole[role]}
    </span>
  );
}

function RoleRadios({ name, value, onChange }: { name: string; value: Exclude<StaffRole, "owner">; onChange: (r: Exclude<StaffRole, "owner">) => void }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-[13px] text-ink-700">Role</legend>
      <div className="divide-y divide-hairline rounded-md border border-hairline">
        {ASSIGNABLE.map((r) => (
          <label key={r} className="flex min-h-14 cursor-pointer items-start gap-3 px-4 py-3 has-[:checked]:bg-navy-50">
            <input type="radio" name={name} value={r} checked={value === r} onChange={() => onChange(r)} className="mt-0.5 size-5 shrink-0 accent-navy-800" />
            <span>
              <span className="block text-[15px] text-ink-900">{staffRole[r]}</span>
              <span className="block text-xs text-ink-500">{ROLE_HELP[r]}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function InviteForm({ onDone }: { onDone: () => void }) {
  const [state, action, pending] = useActionState(inviteStaff, null);
  const [role, setRole] = useState<Exclude<StaffRole, "owner">>("front_desk");
  if (state?.ok) {
    return (
      <div className="space-y-4">
        <FormMessage tone="success">Invitation sent to {state.data.email}. They&apos;ll get an email with a link to sign in.</FormMessage>
        <Button className="w-full" onClick={onDone}>Done</Button>
      </div>
    );
  }
  return (
    <form action={action} onSubmit={keepValues(action)} className="space-y-4">
      {state && !state.ok && !state.fieldErrors ? <FormMessage>{state.message}</FormMessage> : null}
      <Field label="Full name" htmlFor="sname" error={fieldError(state, "fullName")}>
        <Input id="sname" name="fullName" autoComplete="off" required />
      </Field>
      <Field label="Phone" optional htmlFor="sphone" hint="Shown only to signed-in staff, never to guests." error={fieldError(state, "phone")}>
        <Input id="sphone" name="phone" type="tel" inputMode="tel" autoComplete="off" />
      </Field>
      <Field label="Email" htmlFor="semail" error={fieldError(state, "email")}>
        <Input id="semail" name="email" type="email" autoComplete="off" required />
      </Field>
      <RoleRadios name="role" value={role} onChange={setRole} />
      <Button type="submit" size="lg" pending={pending} className="w-full">Send invitation</Button>
    </form>
  );
}

function ManageForm({ s, isSelf, onDone }: { s: StaffRow; isSelf: boolean; onDone: () => void }) {
  const [state, action, pending] = useActionState(updateStaff, null);
  const [ownerState, ownerAction, ownerPending] = useActionState(makeOwner, null);
  const [role, setRole] = useState<Exclude<StaffRole, "owner">>(s.role === "owner" ? "general_manager" : s.role);
  const [confirmOwner, setConfirmOwner] = useState(false);
  useEffect(() => {
    if (state?.ok || ownerState?.ok) onDone();
  }, [state, ownerState, onDone]);

  const save = (isActive: boolean) => (
    <>
      <input type="hidden" name="staffId" value={s.id} />
      <input type="hidden" name="isActive" value={String(isActive)} />
    </>
  );

  return (
    <div className="space-y-5">
      {state && !state.ok ? <FormMessage>{state.message}</FormMessage> : null}
      {ownerState && !ownerState.ok ? <FormMessage>{ownerState.message}</FormMessage> : null}

      {s.isActive ? (
        <form action={action} onSubmit={keepValues(action)} className="space-y-4">
          {save(true)}
          {s.role === "owner" ? <input type="hidden" name="role" value="owner" /> : <RoleRadios name="role" value={role} onChange={setRole} />}
          <Field label="Phone" optional htmlFor={`phone-${s.id}`}>
            <Input id={`phone-${s.id}`} name="phone" type="tel" inputMode="tel" defaultValue={s.phone ?? ""} />
          </Field>
          <Button type="submit" pending={pending} className="w-full">Save changes</Button>
        </form>
      ) : null}

      {s.isActive && s.role !== "owner" ? (
        <div className="border-t border-hairline pt-5">
          {confirmOwner ? (
            <form action={ownerAction} onSubmit={keepValues(ownerAction)} className="space-y-3 rounded-md border border-gold-500 p-4">
              <input type="hidden" name="staffId" value={s.id} />
              <input type="hidden" name="confirm" value="yes" />
              <p className="text-[15px] text-ink-900">Make {s.name} an owner?</p>
              <p className="text-sm text-ink-600">Owners can invite and remove staff, change roles and see everything. This is logged with your name.</p>
              <div className="grid grid-cols-2 gap-3">
                <Button variant="secondary" onClick={() => setConfirmOwner(false)}>Cancel</Button>
                <Button type="submit" variant="accent" pending={ownerPending}>Make owner</Button>
              </div>
            </form>
          ) : (
            <Button variant="ghost" className="w-full" onClick={() => setConfirmOwner(true)}>Make owner…</Button>
          )}
        </div>
      ) : null}

      {!isSelf ? (
        <form action={action} onSubmit={keepValues(action)} className="border-t border-hairline pt-5">
          {save(!s.isActive)}
          <input type="hidden" name="role" value={s.role} />
          {s.isActive ? (
            <>
              <Button type="submit" variant="danger" pending={pending} className="w-full">Remove access</Button>
              <p className="mt-2 text-xs text-ink-500">They&apos;re signed out straight away. Their name stays on past records.</p>
            </>
          ) : (
            <Button type="submit" variant="secondary" pending={pending} className="w-full">Restore access</Button>
          )}
        </form>
      ) : (
        <p className="border-t border-hairline pt-5 text-xs text-ink-500">This is you. Another owner would need to change your access.</p>
      )}
    </div>
  );
}

export function StaffAccess({ rows, selfId, today }: { rows: StaffRow[]; selfId: string; today: string }) {
  const [inviting, setInviting] = useState(false);
  const [inviteKey, setInviteKey] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState(0);
  const inviteButton = useRef<HTMLButtonElement>(null);
  const active = rows.filter((r) => r.isActive).length;
  const selected = rows.find((r) => r.id === open);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-600 tabular-nums">
          {active} active · {rows.length - active} removed
        </p>
        <Button
          ref={inviteButton}
          onClick={() => {
            setInviteKey((k) => k + 1);
            setInviting(true);
          }}
        >
          <Plus className="size-4" aria-hidden /> Invite
        </Button>
      </div>

      <ul className="divide-y divide-hairline overflow-clip rounded-card border border-hairline bg-ivory-50">
        {rows.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => {
                setOpenKey((k) => k + 1);
                setOpen(s.id);
              }}
              className={cn("flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left hover:bg-ink-900/4 sm:px-5", !s.isActive && "opacity-55")}
            >
              <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full border border-navy-800/30 bg-navy-50 text-sm text-navy-800">
                {initials(s.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] text-ink-900">
                  {s.name}
                  {s.id === selfId ? <span className="text-ink-500"> (you)</span> : null}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className={cn("text-xs", status(s, today) === "Active today" ? "text-success-700" : "text-ink-500")}>{status(s, today)}</span>
                  <span className="sm:hidden"><RoleTag role={s.role} /></span>
                </span>
              </span>
              <span className="hidden sm:block"><RoleTag role={s.role} /></span>
              <ChevronRight className="size-4 shrink-0 text-ink-400" aria-hidden />
            </button>
          </li>
        ))}
      </ul>

      <BottomSheet open={inviting} onClose={() => setInviting(false)} title="Invite staff" subtitle="They get an email with a link to sign in." trigger={inviteButton} dialogOnDesktop>
        <InviteForm key={inviteKey} onDone={() => setInviting(false)} />
      </BottomSheet>

      <BottomSheet
        open={Boolean(selected)}
        onClose={() => setOpen(null)}
        title={selected?.name ?? ""}
        subtitle={selected ? `${staffRole[selected.role]} · ${selected.email}` : undefined}
        dialogOnDesktop
      >
        {selected ? <ManageForm key={openKey} s={selected} isSelf={selected.id === selfId} onDone={() => setOpen(null)} /> : null}
      </BottomSheet>
    </div>
  );
}
