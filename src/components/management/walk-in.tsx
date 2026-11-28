"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonStyles } from "@/components/ui/button";
import { Segmented } from "@/components/ui/choice";
import { Field, FormMessage, Input, Select } from "@/components/ui/form";
import { addDays } from "@/lib/hotel-date";
import { formatDate, formatNaira } from "@/lib/format";
import { cn } from "@/lib/utils/cn";
import { walkInGuest } from "@/server/front-desk";
import { lookupGuestsByPhone, stayAvailability } from "@/server/reservations";
import type { PhoneMatch, TypeAvailability } from "@/server/domain/staff-booking";
import { cardToSend, emptyCard, RegistrationFields, type Card } from "./check-in-out";
import { BankLine, type PaySettings } from "./offline-payment-form";

type RoomType = { id: string; name: string; rateKobo: number; maxOccupancy: number };
type Method = "cash" | "bank_transfer" | "pos_terminal";

function Section({ n, title, children, className }: { n: number; title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-hairline bg-white", className)}>
      <h2 className="border-b border-hairline px-4 py-3 text-base font-bold text-ink-900">{n} · {title}</h2>
      <div className="space-y-4 px-4 py-4">{children}</div>
    </section>
  );
}

/**
 * Walk-in (design X1; FUNCTIONALITY.md section 4): one screen from guest to checked in. Pay and check in saves
 * everything in one go; "Save without paying" holds the room type for the walk-in hold (default 6 hours).
 */
export function WalkIn({ types, tonight, holdHours, pay, initial }: { types: RoomType[]; tonight: string; holdHours: number; pay: PaySettings; initial: TypeAvailability[] }) {
  const router = useRouter();
  const [requestId] = useState(() => crypto.randomUUID());
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [matches, setMatches] = useState<PhoneMatch[]>([]);
  const [guest, setGuest] = useState<PhoneMatch | null>(null);
  const [nights, setNights] = useState(1);
  const [guests, setGuests] = useState(1);
  const [avail, setAvail] = useState<TypeAvailability[]>(initial);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [card, setCard] = useState<Card>(emptyCard);
  const [method, setMethod] = useState<Method>("cash");
  const [ref, setRef] = useState("");
  const [sender, setSender] = useState("");
  const [slip, setSlip] = useState("");
  const [terminal, setTerminal] = useState(pay.terminals[0] ?? "");
  const [seen, setSeen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const lookup = useRef(0);

  // Returning guest: look up by phone as it's typed.
  useEffect(() => {
    const n = ++lookup.current;
    if (phone.replace(/\D/g, "").length < 7) return;
    const t = setTimeout(() => void lookupGuestsByPhone(phone).then((m) => n === lookup.current && setMatches(m)), 250);
    return () => clearTimeout(t);
  }, [phone]);

  // Rooms free for tonight for the chosen nights.
  useEffect(() => {
    let live = true;
    void stayAvailability(tonight, addDays(tonight, nights)).then((a) => live && a && setAvail(a));
    return () => {
      live = false;
    };
  }, [nights, tonight]);

  const type = types.find((t) => t.id === typeId) ?? null;
  const freeOf = (id: string) => avail.find((a) => a.categoryId === id);
  const rooms = typeId ? (freeOf(typeId)?.rooms ?? []) : [];
  const room = rooms.find((r) => r.id === roomId) ?? null;
  const total = type ? type.rateKobo * nights : 0;

  const send = (paying: boolean, duplicateOk = false) =>
    start(async () => {
      setMessage(null);
      setDuplicate(null);
      const r = await walkInGuest({
        requestId,
        guestId: guest?.id ?? null,
        fullName: guest?.name ?? name,
        phone,
        nights,
        guests,
        categoryId: typeId ?? "",
        roomId: paying ? roomId : null,
        payment: paying ? { method, reference: ref || null, senderName: sender || null, slipLast4: slip || null, terminal: terminal || null, confirmReceived: method === "bank_transfer" ? seen : true, duplicateOk } : null,
        card: paying ? cardToSend(card) : null,
      });
      if (r.ok) {
        router.push(`/app/reservations/${r.data.id}${r.data.receiptNumber ? `?paid=${encodeURIComponent(r.data.receiptNumber)}` : ""}`);
        return;
      }
      if (r.fieldErrors?.duplicate) setDuplicate(r.fieldErrors.duplicate[0]!);
      setErrors(r.fieldErrors ?? {});
      setMessage(r.message);
    });

  const payReady =
    type && room && (method === "cash" || (method === "bank_transfer" && seen && (ref.trim().length >= 3 || sender.trim().length >= 2)) || (method === "pos_terminal" && /^\d{4}$/.test(slip) && terminal));

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1 space-y-4">
        <Section n={1} title="Guest">
          <div className="flex flex-wrap gap-4">
            <Field label="Phone" htmlFor="phone" error={errors.phone?.[0]}>
              <Input id="phone" type="tel" inputMode="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setGuest(null); }} placeholder="0806 220 1934" className="w-48 tabular-nums" autoFocus />
            </Field>
            <Field label="Full name" htmlFor="name" error={errors.fullName?.[0]}>
              <Input id="name" value={guest?.name ?? name} onChange={(e) => { setName(e.target.value); setGuest(null); }} maxLength={120} className="w-72" />
            </Field>
          </div>
          {!guest && matches.length && phone.replace(/\D/g, "").length >= 7 ? (
            <div className="flex flex-wrap gap-2">
              {matches.map((m) => (
                <button key={m.id} type="button" onClick={() => setGuest(m)} className="w-fit rounded-lg border border-hairline px-3 py-2 text-left text-sm hover:border-navy-700">
                  <span className="font-semibold text-ink-900">{m.name}</span> <span className="text-ink-500">· {m.phone} · {m.stays} past stay{m.stays === 1 ? "" : "s"}</span>
                </button>
              ))}
            </div>
          ) : null}
          {guest ? <p className="text-sm text-[#166534]">Returning guest: {guest.stays} past stay{guest.stays === 1 ? "" : "s"}. Details filled in.</p> : null}
        </Section>

        <Section n={2} title="Stay">
          <div className="flex flex-wrap gap-4">
            <Field label="Arrive" htmlFor="arrive">
              <Input id="arrive" value={`Tonight · ${formatDate(tonight, { weekday: true })}`} readOnly className="w-56 bg-ivory-100" />
            </Field>
            <Field label="Nights" htmlFor="nights">
              <Select id="nights" value={nights} onChange={(e) => { setNights(Number(e.target.value)); setRoomId(null); }} className="w-24">
                {Array.from({ length: 14 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </Field>
            <Field label="Guests" htmlFor="guests" error={errors.guests?.[0]}>
              <Select id="guests" value={guests} onChange={(e) => setGuests(Number(e.target.value))} className="w-32">
                {Array.from({ length: 6 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} {n === 1 ? "adult" : "adults"}</option>)}
              </Select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {types.map((t) => {
              const a = freeOf(t.id);
              const ready = a?.rooms.filter((r) => r.ready).length ?? 0;
              const full = !a || a.free <= 0;
              const tooMany = guests > t.maxOccupancy;
              return (
                <button
                  key={t.id}
                  type="button"
                  disabled={full || tooMany}
                  aria-pressed={typeId === t.id}
                  onClick={() => { setTypeId(t.id); setRoomId(null); }}
                  className={cn("rounded-xl border p-3 text-left disabled:opacity-55", typeId === t.id ? "border-2 border-navy-900 bg-[#e8eefb]" : "border-hairline bg-white hover:border-ink-400")}
                >
                  <span className="block font-semibold text-ink-900">{t.name}</span>
                  <span className="block text-sm tabular-nums text-ink-700">{formatNaira(t.rateKobo)}/night</span>
                  <span className={cn("mt-1 block text-xs", full ? "text-[#a61b1b]" : "text-ink-500")}>
                    {full ? "Full tonight" : tooMany ? `Sleeps ${t.maxOccupancy}` : `${ready} ready tonight`}
                  </span>
                </button>
              );
            })}
          </div>
        </Section>

        <Section n={3} title="Room">
          {type ? (
            rooms.length ? (
              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 xl:grid-cols-6">
                {rooms.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    disabled={!r.ready}
                    aria-pressed={roomId === r.id}
                    onClick={() => setRoomId(r.id)}
                    className={cn("flex flex-col items-start gap-1 rounded-lg border p-2.5 disabled:opacity-55", roomId === r.id ? "border-2 border-navy-900 bg-[#e8eefb]" : "border-hairline bg-white")}
                  >
                    <span className="text-base font-bold text-ink-900">{r.number}</span>
                    <Badge tone={r.ready ? "success" : "warning"}>{r.ready ? "Ready" : "To clean"}</Badge>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-600">No {type.name} room is free tonight.</p>
            )
          ) : (
            <p className="text-sm text-ink-500">Choose a room type first.</p>
          )}
          {errors.roomId ? <p className="text-sm text-danger-700">{errors.roomId[0]}</p> : null}
        </Section>

        <section className="rounded-xl border border-hairline bg-white">
          <h2 className="border-b border-hairline px-4 py-3 text-base font-bold text-ink-900">Registration card</h2>
          <div className="px-4 py-4"><RegistrationFields card={card} onChange={setCard} errors={errors} /></div>
        </section>
      </div>

      <aside className="w-full shrink-0 space-y-3.5 lg:sticky lg:top-4 lg:w-[380px]">
        <Section n={4} title="Pay and check in">
          <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 text-sm">
            <dt className="text-ink-600">{type ? `${type.name} · ${nights} night${nights === 1 ? "" : "s"}` : "Room type"}</dt><dd className="text-right tabular-nums">{type ? formatNaira(total) : "-"}</dd>
            <dt className="text-ink-600">Room</dt><dd className="text-right">{room?.number ?? "-"}</dd>
            <dt className="border-t border-hairline pt-2 font-semibold text-ink-900">Total</dt><dd className="border-t border-hairline pt-2 text-right text-xl font-bold tabular-nums">{formatNaira(total)}</dd>
          </dl>
          <Segmented label="How the guest paid" value={method} onChange={setMethod} className="w-full" options={[{ value: "cash", label: "Cash" }, { value: "bank_transfer", label: "Transfer" }, { value: "pos_terminal", label: "POS" }]} />
          {method === "bank_transfer" ? (
            <div className="space-y-3">
              <Field label="Transfer reference" htmlFor="w-ref" error={errors.reference?.[0]}><Input id="w-ref" value={ref} onChange={(e) => setRef(e.target.value)} maxLength={80} className="w-52" /></Field>
              <Field label="Sender's name" htmlFor="w-sender" hint="If there's no reference"><Input id="w-sender" value={sender} onChange={(e) => setSender(e.target.value)} maxLength={80} className="w-60" /></Field>
              <BankLine bank={pay.bank} />
              <label className="flex gap-3 text-sm text-ink-800">
                <input type="checkbox" checked={seen} onChange={(e) => setSeen(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-navy-900" />
                <span><span className="font-semibold text-ink-900">I&apos;ve seen {formatNaira(total)} arrive in the hotel&apos;s bank app</span> (not the guest&apos;s phone)</span>
              </label>
            </div>
          ) : null}
          {method === "pos_terminal" ? (
            <div className="flex flex-wrap gap-3">
              <Field label="Slip: last 4 digits" htmlFor="w-slip" error={errors.slipLast4?.[0]}><Input id="w-slip" value={slip} onChange={(e) => setSlip(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" className="w-28 tabular-nums" /></Field>
              <Field label="Terminal" htmlFor="w-terminal"><Select id="w-terminal" value={terminal} onChange={(e) => setTerminal(e.target.value)} className="w-52">{pay.terminals.map((t) => <option key={t} value={t}>{t}</option>)}</Select></Field>
              <p className="text-xs text-ink-500">Only once the terminal prints APPROVED.</p>
            </div>
          ) : null}
          {duplicate ? (
            <div role="alert" className="space-y-2 rounded-lg border border-[#f3d28a] bg-[#fff4dc] p-3 text-sm text-[#8a4b06]">
              <p>{duplicate}</p>
              <Button variant="secondary" size="sm" onClick={() => send(true, true)}>Record anyway</Button>
            </div>
          ) : message ? (
            <FormMessage>{message}</FormMessage>
          ) : null}
          <div className="flex flex-col items-center gap-2">
            <Button size="lg" className="w-full" pending={pending} disabled={!payReady} onClick={() => send(true)}>
              {type ? `Take ${formatNaira(total)} and check in` : "Take payment and check in"}
            </Button>
            <Button variant="ghost" disabled={!type || pending} onClick={() => send(false)}>Save without paying (hold {holdHours} hours)</Button>
          </div>
        </Section>
        <div className="text-center"><Link href="/app/today" className={buttonStyles({ variant: "ghost" })}>Cancel</Link></div>
      </aside>
    </div>
  );
}
