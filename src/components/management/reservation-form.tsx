"use client";

import { useActionState, useEffect, useState } from "react";
import { Check, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, FormMessage, Input, Textarea } from "@/components/ui/form";
import { Stepper } from "@/components/ui/stepper";
import { bookingSource } from "@/domain/status";
import type { CategoryRow } from "@/domain/views";
import { formatNaira, nightsBetween, plural } from "@/lib/format";
import { keepValues } from "@/lib/forms";
import { addDays } from "@/lib/hotel-date";
import { localDigits } from "@/lib/phone";
import { cn } from "@/lib/utils/cn";
import { createReservation, lookupGuestsByPhone, stayAvailability } from "@/server/reservations";
import type { PhoneMatch, TypeAvailability } from "@/server/domain/staff-booking";

type Source = "walk_in" | "phone" | "whatsapp" | "staff";

const chip = (on: boolean) =>
  cn(
    "inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-4 text-sm whitespace-nowrap",
    on ? "border-navy-800 bg-navy-50 text-navy-800" : "border-hairline text-ink-900 hover:bg-ink-900/7",
  );

/**
 * Direct booking (walk-in, phone, WhatsApp), in the order the desk works:
 * who (phone first, so a returning guest is one tap), when, then which room
 * type is free. Submits to the same engine as the website: the database
 * re-checks availability and sets the price. Counts and totals here are a
 * preview only.
 */
export function ReservationForm({ categories, today, holdHours, aboveTabs = false }: { categories: CategoryRow[]; today: string; holdHours: number; aboveTabs?: boolean }) {
  const [state, action, pending] = useActionState(createReservation, null);
  const err = (n: string) => (state && !state.ok ? state.fieldErrors?.[n]?.[0] : undefined);
  const active = categories.filter((c) => c.isActive);

  // Guest: phone lookup as it's typed (7+ digits), debounced.
  const [phone, setPhone] = useState("");
  const [found, setFound] = useState<{ phone: string; list: PhoneMatch[] }>({ phone: "", list: [] });
  const [guest, setGuest] = useState<PhoneMatch | null>(null);
  const searchable = !guest && localDigits(phone).length >= 7;
  useEffect(() => {
    if (!searchable) return;
    let live = true;
    const t = setTimeout(() => {
      lookupGuestsByPhone(phone).then((list) => {
        if (live) setFound({ phone, list });
      });
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [phone, searchable]);
  // Only show results for the number currently typed.
  const matches = searchable && found.phone === phone ? found.list : [];

  // Stay: tonight by default.
  const [checkIn, setCheckIn] = useState(today);
  const [checkOut, setCheckOut] = useState(addDays(today, 1));
  const [source, setSource] = useState<Source>("walk_in");
  const [moreSources, setMoreSources] = useState(false);
  const nights = checkIn && checkOut && checkOut > checkIn ? nightsBetween(checkIn, checkOut) : 0;

  // Room type: free counts for these dates.
  const stayKey = `${checkIn}|${checkOut}`;
  const [freeFor, setFreeFor] = useState<{ key: string; map: Map<string, TypeAvailability> | null }>({ key: "", map: null });
  const [picked, setPicked] = useState("");
  useEffect(() => {
    if (!nights) return;
    let live = true;
    stayAvailability(checkIn, checkOut).then((rows) => {
      if (live) setFreeFor({ key: `${checkIn}|${checkOut}`, map: rows ? new Map(rows.map((r) => [r.categoryId, r])) : null });
    });
    return () => {
      live = false;
    };
  }, [checkIn, checkOut, nights]);
  const typeInfo = (id: string) => (nights && freeFor.key === stayKey ? freeFor.map?.get(id) : undefined);
  const freeOf = (id: string) => typeInfo(id)?.free;
  // A type that is full for the current dates can't stay chosen.
  const categoryId = picked && freeOf(picked) !== 0 ? picked : "";
  const setCategoryId = setPicked;

  const cat = active.find((c) => c.id === categoryId);
  // The specific room: the one staff picked if still free, else the first free one (ready rooms first).
  const [pickedRoom, setPickedRoom] = useState("");
  const freeRooms = categoryId ? (typeInfo(categoryId)?.rooms ?? []) : [];
  const room = freeRooms.find((r) => r.id === pickedRoom) ?? freeRooms[0];
  const total = cat && nights ? cat.nightlyRateKobo * nights : 0;
  const tonight = checkIn === today;

  const pickGuest = (m: PhoneMatch) => {
    setGuest(m);
  };

  return (
    <form action={action} onSubmit={keepValues(action)} className="px-4 pt-6 pb-32 lg:px-8 lg:pb-10">
      <div className="mx-auto max-w-3xl space-y-6">
        {state && !state.ok && !state.fieldErrors ? <FormMessage>{state.message}</FormMessage> : null}

        <Card>
          <CardHeader title="Guest" description="Start with the phone number. Returning guests appear as you type." />
          <div className="space-y-5 p-5">
            {guest ? (
              <div className="flex items-center gap-3 rounded-md border border-navy-800 bg-navy-50 p-4">
                <UserRound className="size-5 shrink-0 text-navy-800" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink-900">{guest.name}</p>
                  <p className="text-sm text-ink-600">
                    {guest.phone ?? phone}
                    {guest.stays ? ` · ${plural(guest.stays, "stay")}` : ""}
                  </p>
                  {guest.email ? <p className="truncate text-sm text-ink-600">{guest.email}</p> : null}
                </div>
                <Button variant="ghost" size="sm" onClick={() => setGuest(null)}>Change</Button>
                <input type="hidden" name="guestId" value={guest.id} />
                <input type="hidden" name="fullName" value={guest.name} />
                <input type="hidden" name="phone" value={guest.phone ?? phone} />
                <input type="hidden" name="email" value={guest.email ?? ""} />
              </div>
            ) : (
              <>
                <Field label="Phone" htmlFor="gp" error={err("phone")}>
                  <Input id="gp" name="phone" type="tel" inputMode="tel" autoComplete="off" placeholder="0803 123 4567" value={phone} onChange={(e) => setPhone(e.target.value)} required />
                </Field>
                {matches.length ? (
                  <ul aria-label="Returning guests with this number" className="divide-y divide-hairline rounded-md border border-hairline">
                    {matches.map((m) => (
                      <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[15px] text-ink-900">{m.name}</p>
                          <p className="text-xs break-words text-ink-500">{["Returning", m.stays ? plural(m.stays, "stay") : "no stays yet", m.email].filter(Boolean).join(" · ")}</p>
                        </div>
                        <Button variant="secondary" size="sm" onClick={() => pickGuest(m)}>Use</Button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Full name" htmlFor="gn" error={err("fullName")}><Input id="gn" name="fullName" autoComplete="off" required /></Field>
                  <Field label="Email" optional htmlFor="ge" hint="Needed to email a confirmation." error={err("email")}><Input id="ge" name="email" type="email" autoComplete="off" /></Field>
                </div>
              </>
            )}
            <Field label="Special requests" optional htmlFor="gr"><Textarea id="gr" name="specialRequests" rows={2} maxLength={1000} /></Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Stay" />
          <div className="grid gap-5 p-5 sm:grid-cols-3">
            <Field label="Check-in" htmlFor="nci" error={err("checkIn")}>
              <Input
                id="nci"
                name="checkIn"
                type="date"
                min={today}
                value={checkIn}
                onChange={(e) => {
                  const v = e.target.value;
                  setCheckIn(v);
                  if (v && (!checkOut || checkOut <= v)) setCheckOut(addDays(v, 1));
                }}
                required
              />
            </Field>
            <Field label="Check-out" htmlFor="nco" error={err("checkOut")}>
              <Input id="nco" name="checkOut" type="date" min={checkIn ? addDays(checkIn, 1) : today} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} required />
            </Field>
            <Field label="Guests" htmlFor="ng" error={err("guests")}>
              <Stepper id="ng" name="guests" max={cat?.maxOccupancy ?? 20} unit={["guest", "guests"]} />
            </Field>
          </div>
          <fieldset className="border-t border-hairline p-5">
            <legend className="mb-3 text-sm text-ink-700">Received by</legend>
            <input type="hidden" name="source" value={source} />
            <input type="hidden" name="roomId" value={room?.id ?? ""} />
            <div className="flex flex-wrap gap-2">
              {(moreSources || source === "whatsapp" || source === "staff" ? (["walk_in", "phone", "whatsapp", "staff"] as const) : (["walk_in", "phone"] as const)).map((s) => (
                <button key={s} type="button" aria-pressed={source === s} onClick={() => setSource(s)} className={chip(source === s)}>
                  {source === s ? <Check className="size-3.5" aria-hidden /> : null}
                  {bookingSource[s]}
                </button>
              ))}
              {!moreSources && source !== "whatsapp" && source !== "staff" ? (
                <button type="button" onClick={() => setMoreSources(true)} className={chip(false)}>More</button>
              ) : null}
            </div>
          </fieldset>
        </Card>

        <Card>
          <CardHeader title="Room type" description={nights ? `${plural(nights, "night")} · rooms free for these dates` : "Choose dates first"} />
          <fieldset>
            <legend className="sr-only">Room type</legend>
            <ul className="divide-y divide-hairline">
              {active.map((c) => {
                const n = freeOf(c.id);
                const full = n === 0;
                return (
                  <li key={c.id}>
                    <label className={cn("flex min-h-16 items-center gap-3 px-5 py-3", full ? "cursor-not-allowed opacity-50" : "cursor-pointer has-[:checked]:bg-navy-50")}>
                      <input
                        type="radio"
                        name="categoryId"
                        value={c.id}
                        checked={categoryId === c.id}
                        disabled={full || !nights}
                        onChange={() => setCategoryId(c.id)}
                        className="size-5 shrink-0 accent-navy-800"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] text-ink-900">{c.name}</span>
                        <span className="block text-xs text-ink-500">
                          Sleeps {c.maxOccupancy} · {n === undefined ? "…" : full ? (tonight && nights === 1 ? "Full tonight" : "Full for these dates") : `${n} free`}
                        </span>
                      </span>
                      <span className="text-right text-sm tabular-nums text-ink-700">{formatNaira(c.nightlyRateKobo)}<span className="block text-xs text-ink-500">a night</span></span>
                    </label>
                    {categoryId === c.id && freeRooms.length ? (
                      <fieldset className="bg-navy-50 px-5 pb-4">
                        <legend className="mb-2 pt-1 text-[13px] text-ink-700">Room</legend>
                        <div className="flex flex-wrap gap-2">
                          {freeRooms.map((r) => (
                            <button key={r.id} type="button" aria-pressed={room?.id === r.id} onClick={() => setPickedRoom(r.id)} className={cn(chip(room?.id === r.id), "bg-ivory-50")}>
                              {room?.id === r.id ? <Check className="size-3.5" aria-hidden /> : null}
                              {r.number}
                              {r.floor ? <span className="text-xs text-ink-500">{/^\d+$/.test(r.floor) ? `Floor ${r.floor}` : r.floor}</span> : null}
                            </button>
                          ))}
                        </div>
                      </fieldset>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {err("categoryId") ? <p className="px-5 pb-4 text-sm text-danger-700">{err("categoryId")}</p> : null}
          </fieldset>
        </Card>

        <p className="text-sm text-ink-600">
          Held for {plural(holdHours, "hour")} until payment is recorded. The final price is set by the system when you create it.
        </p>
      </div>

      {/* Pinned on mobile, inline on desktop. */}
      <div
        className={cn(
          "fixed inset-x-0 z-30 border-t border-hairline bg-ivory-50 px-4 pt-3 shadow-[0_-4px_12px_rgb(0_0_0/0.06)] lg:static lg:mx-auto lg:mt-6 lg:max-w-3xl lg:rounded-card lg:border lg:p-5 lg:shadow-none",
          // Front desk has the bottom tab bar on phones; sit just above it.
          aboveTabs ? "bottom-[calc(3.25rem+env(safe-area-inset-bottom))] pb-3 md:bottom-0 md:pb-[max(0.75rem,env(safe-area-inset-bottom))]" : "bottom-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]",
        )}
      >
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <p className="min-w-0 text-sm text-ink-600">
            {cat && nights ? (
              <>
                <span className="block truncate">{room ? `Room ${room.number} · ` : ""}{cat.name} · {plural(nights, "night")}</span>
                <span className="block text-lg font-semibold tabular-nums text-navy-950">{formatNaira(total)}</span>
              </>
            ) : (
              "Choose a room type"
            )}
          </p>
          <div className="flex shrink-0 gap-2">
            <Button type="submit" name="next" value="reservation" variant="secondary" pending={pending} className="hidden sm:inline-flex">Create only</Button>
            <Button type="submit" name="next" value="payment" size="lg" pending={pending} disabled={!cat || !nights} className="px-4 whitespace-nowrap min-[360px]:px-6">
              <span className="min-[360px]:hidden">Create &amp; pay</span>
              <span className="hidden min-[360px]:inline">Create &amp; take payment</span>
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
