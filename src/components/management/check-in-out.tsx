"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Button, buttonStyles } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormMessage, Input, MoneyInput, Select } from "@/components/ui/form";
import { Segmented } from "@/components/ui/choice";
import { hotel } from "@/config/hotel";
import { formatDate, formatNaira } from "@/lib/format";
import { askForRefund, checkInGuest, checkOutGuest, checkOutInfo, loadRegistration } from "@/server/front-desk";
import type { CheckOutSummary } from "@/server/domain/front-desk";

export const ID_TYPES = { nin: "National ID (NIN)", passport: "Passport", drivers_licence: "Driver's licence", voters_card: "Voter's card", other: "Other ID" } as const;
export const PURPOSES = { business: "Business", leisure: "Leisure", family: "Family visit", event: "Event", other: "Other" } as const;

export type Card = { idType: string; idNumber: string; address: string; comingFrom: string; nationality: string; purpose: string; rulesAccepted: boolean };
export const emptyCard: Card = { idType: "nin", idNumber: "", address: "", comingFrom: "", nationality: "Nigerian", purpose: "business", rulesAccepted: false };

/** Only the last 4 letters or digits ever leave this screen. */
export const last4 = (typed: string) => typed.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(-4);
export const cardToSend = (c: Card) => ({ idType: c.idType, idLast4: last4(c.idNumber), address: c.address, comingFrom: c.comingFrom, nationality: c.nationality, purpose: c.purpose, rulesAccepted: c.rulesAccepted });

/**
 * The registration card (X2; FUNCTIONALITY.md section 5). The ID number box can take the full number, but only
 * its last 4 characters are sent or stored; once saved, only ••• and those 4 show.
 */
export function RegistrationFields({ card, onChange, errors = {}, savedLast4 }: { card: Card; onChange: (c: Card) => void; errors?: Record<string, string[] | undefined>; savedLast4?: string | null }) {
  const set = <K extends keyof Card>(k: K, v: Card[K]) => onChange({ ...card, [k]: v });
  const e = (k: string) => errors[k]?.[0];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4">
        <Field label="ID type" htmlFor="idType" error={e("idType")}>
          <Select id="idType" value={card.idType} onChange={(x) => set("idType", x.target.value)} className="w-52">
            {Object.entries(ID_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
        <Field label="ID number" htmlFor="idNumber" hint="Only the last 4 show after saving" error={e("idLast4")}>
          <Input
            id="idNumber"
            value={card.idNumber}
            onChange={(x) => set("idNumber", x.target.value)}
            placeholder={savedLast4 ? `••••••• ${savedLast4}` : undefined}
            autoComplete="off"
            maxLength={30}
            className="w-48 tabular-nums"
          />
        </Field>
      </div>
      <Field label="Home address" htmlFor="address" error={e("address")}>
        <Input id="address" value={card.address} onChange={(x) => set("address", x.target.value)} maxLength={200} className="w-full max-w-md" />
      </Field>
      <div className="flex flex-wrap gap-4">
        <Field label="Coming from" htmlFor="comingFrom" error={e("comingFrom")}>
          <Input id="comingFrom" value={card.comingFrom} onChange={(x) => set("comingFrom", x.target.value)} maxLength={80} className="w-44" />
        </Field>
        <Field label="Nationality" htmlFor="nationality" error={e("nationality")}>
          <Input id="nationality" value={card.nationality} onChange={(x) => set("nationality", x.target.value)} maxLength={60} list="nationalities" className="w-40" />
        </Field>
        <datalist id="nationalities">{["Nigerian", "Ghanaian", "British", "American", "Beninese", "Togolese", "Cameroonian", "South African"].map((n) => <option key={n} value={n} />)}</datalist>
        <Field label="Purpose of stay" htmlFor="purpose" error={e("purpose")}>
          <Select id="purpose" value={card.purpose} onChange={(x) => set("purpose", x.target.value)} className="w-40">
            {Object.entries(PURPOSES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
      </div>
      <label className="flex items-center gap-3 text-sm font-medium text-ink-900">
        <input type="checkbox" checked={card.rulesAccepted} onChange={(x) => set("rulesAccepted", x.target.checked)} className="size-5 accent-navy-900" />
        Guest has seen the house rules and checkout time
      </label>
      {e("rulesAccepted") ? <p className="text-sm text-danger-700">{e("rulesAccepted")}</p> : null}
    </div>
  );
}

/** The A5 registration card: guest, room, dates, house rules and a signature line. Printed from the check-in drawer. */
function PrintableCard({ s, card }: { s: CheckOutSummary; card: Card }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div data-print="" className="registration-card hidden p-8 text-[12px] text-black print:block">
      <p className="font-brand text-2xl">{hotel.name}</p>
      <p className="mb-4 text-xs">{hotel.address.line1}, {hotel.address.city} · {hotel.phone}</p>
      <h1 className="mb-3 text-base font-bold">Guest registration card · {s.reference}</h1>
      <table className="w-full border-collapse">
        <tbody>
          {[
            ["Guest", s.guestName],
            ["Room", `${s.category} · ${s.roomNumber ?? "-"}`],
            ["Arrival", formatDate(s.checkIn)],
            ["Departure", `${formatDate(s.checkOut)} by check-out time`],
            ["ID", `${ID_TYPES[card.idType as keyof typeof ID_TYPES] ?? card.idType} ending ${last4(card.idNumber) || "____"}`],
            ["Home address", card.address],
            ["Coming from", card.comingFrom],
            ["Nationality", card.nationality],
            ["Purpose of stay", PURPOSES[card.purpose as keyof typeof PURPOSES] ?? card.purpose],
          ].map(([k, v]) => (
            <tr key={k} className="border-b border-black/20"><td className="w-40 py-1.5 font-semibold">{k}</td><td className="py-1.5">{v}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="mt-4 text-xs">House rules: check-out is by the time shown at the desk. No smoking in rooms. Visitors leave by 10pm. The hotel is not responsible for valuables not left with the front desk.</p>
      <p className="mt-10 border-t border-black pt-1">Guest signature and date</p>
    </div>,
    document.body,
  );
}

/** Check in with the registration card (X2). A returning guest's last card is filled in for staff to confirm. */
export function CheckInDrawer({ reservationId, open, onClose, onDone }: { reservationId: string; open: boolean; onClose: () => void; onDone: (room: string | null, undoId: number | null) => void }) {
  const [s, setS] = useState<CheckOutSummary | null>(null);
  const [card, setCard] = useState<Card>(emptyCard);
  const [saved, setSaved] = useState<{ last4: string; earlier: boolean } | null>(null);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    let live = true;
    void Promise.all([checkOutInfo(reservationId), loadRegistration(reservationId)]).then(([info, reg]) => {
      if (!live) return;
      if (info.ok) setS(info.data);
      else setMessage(info.message);
      if (reg) {
        setCard({ idType: reg.idType, idNumber: "", address: reg.address, comingFrom: reg.comingFrom, nationality: reg.nationality, purpose: reg.purpose, rulesAccepted: false });
        setSaved({ last4: reg.idLast4, earlier: reg.fromEarlierStay });
      }
    });
    return () => {
      live = false;
    };
  }, [open, reservationId]);

  const submit = () =>
    start(async () => {
      setMessage(null);
      const toSend = cardToSend(card.idNumber || !saved ? card : { ...card, idNumber: saved.last4 });
      const r = await checkInGuest({ reservationId, card: toSend });
      if (r.ok) {
        onDone(s?.roomNumber ?? null, r.data.undoId);
        onClose();
      } else {
        setErrors(r.fieldErrors ?? {});
        setMessage(r.message);
      }
    });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={s ? `Check in ${s.guestName}` : "Check in"}
      subtitle={s ? `${s.category} · ${s.nights} night${s.nights === 1 ? "" : "s"}` : undefined}
      footer={
        <>
          <Button size="lg" className="w-full" pending={pending} disabled={!s || s.balanceKobo > 0} onClick={submit}>
            Check in and give key {s?.roomNumber ?? ""}
          </Button>
          <Button variant="ghost" onClick={() => window.print()} disabled={!s}>Print registration card</Button>
        </>
      }
    >
      {s ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-ink-500">Booking</dt><dd>{s.reference} · {s.balanceKobo > 0 ? <span className="font-semibold text-[#8a4b06]">owes {formatNaira(s.balanceKobo)}</span> : "paid"}</dd>
          <dt className="text-ink-500">Room</dt><dd>{s.category} · {s.roomNumber ?? "not assigned"}</dd>
          <dt className="text-ink-500">Leave</dt><dd>{formatDate(s.checkOut, { weekday: true })} · by check-out time</dd>
        </dl>
      ) : null}
      <div>
        <p className="mb-3 text-base font-bold text-ink-900">Registration card</p>
        {saved?.earlier ? <p className="mb-3 text-sm text-ink-600">Filled in from the guest&apos;s last stay. Check it with them.</p> : null}
        <RegistrationFields card={card} onChange={setCard} errors={errors} savedLast4={saved?.last4} />
      </div>
      {message ? <FormMessage>{message}</FormMessage> : null}
      {s ? <PrintableCard s={s} card={card.idNumber || !saved ? card : { ...card, idNumber: saved.last4 }} /> : null}
    </Drawer>
  );
}

/** Check out (X3): key returned, room to cleaning, the receipt; leave owing (manager) or ask for a refund. */
export function CheckOutDrawer({ reservationId, open, onClose, onDone, canLeaveOwing }: { reservationId: string; open: boolean; onClose: () => void; onDone: (undoId: number | null) => void; canLeaveOwing: boolean }) {
  const [s, setS] = useState<CheckOutSummary | null>(null);
  const [key, setKey] = useState(false);
  const [owingReason, setOwingReason] = useState("");
  const [refund, setRefund] = useState<{ amount: string; method: "bank_transfer" | "cash"; reason: string; sent: boolean } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    let live = true;
    void checkOutInfo(reservationId).then((r) => live && (r.ok ? setS(r.data) : setMessage(r.message)));
    return () => {
      live = false;
    };
  }, [open, reservationId]);

  const owes = (s?.balanceKobo ?? 0) > 0;
  const credit = s ? Math.max(0, -s.balanceKobo) : 0;
  const receiptText = s
    ? `${hotel.name}: receipt for ${s.reference}. Stayed ${formatDate(s.checkIn)} – ${formatDate(s.checkOut)} (${s.nights} night${s.nights === 1 ? "" : "s"}). Charges ${formatNaira(s.chargesKobo)}, paid ${formatNaira(s.paidKobo)}. Thank you for staying with us.`
    : "";
  const wa = s?.phone ? `https://wa.me/${s.phone.replace(/\D/g, "")}?text=${encodeURIComponent(receiptText)}` : `https://wa.me/?text=${encodeURIComponent(receiptText)}`;

  const submit = () =>
    start(async () => {
      setMessage(null);
      const r = await checkOutGuest({ reservationId, keyReturned: key, leaveOwingReason: owes ? owingReason : undefined });
      if (r.ok) {
        onDone(r.data.undoId);
        onClose();
      } else setMessage(r.message);
    });

  const sendRefund = () =>
    start(async () => {
      if (!refund) return;
      const amountKobo = Math.round(Number(refund.amount.replace(/[,\s₦]/g, "")) * 100);
      const r = await askForRefund({ reservationId, amountKobo, method: refund.method, reason: refund.reason });
      if (r.ok) setRefund({ ...refund, sent: true });
      else setMessage(r.message);
    });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={s ? `Check out ${s.guestName}` : "Check out"}
      subtitle={s?.reference}
      footer={
        <>
          <Button size="lg" className="w-full" pending={pending} disabled={!s || !key || (owes && (!canLeaveOwing || owingReason.trim().length < 5))} onClick={submit}>
            {owes ? `Check out, leave ${formatNaira(s!.balanceKobo)} owing` : "Check out"}
          </Button>
          {owes && !canLeaveOwing ? <p className="text-center text-xs text-ink-500">Take the payment first. Only a manager can let a guest leave owing.</p> : null}
        </>
      }
    >
      {s ? (
        <>
          <dl className="grid grid-cols-[1fr_auto] gap-y-2 text-sm">
            <dt className="text-ink-500">Room</dt><dd className="text-right">{s.category} · {s.roomNumber ?? "-"}</dd>
            <dt className="text-ink-500">Stayed</dt><dd className="text-right">{formatDate(s.checkIn, { weekday: true })} – {formatDate(s.checkOut, { weekday: true })} · {s.nights} night{s.nights === 1 ? "" : "s"}</dd>
            <dt className="text-ink-500">Charges</dt><dd className="text-right tabular-nums">{formatNaira(s.chargesKobo)}</dd>
            <dt className="text-ink-500">Paid</dt><dd className="text-right tabular-nums">{formatNaira(s.paidKobo)}</dd>
            <dt className="border-t border-hairline pt-2 font-semibold text-ink-900">{owes ? "Owed" : credit ? "In credit" : "Nothing owed"}</dt>
            <dd className={`border-t border-hairline pt-2 text-right text-lg font-bold tabular-nums ${owes ? "text-[#8a4b06]" : "text-[#166534]"}`}>{formatNaira(Math.abs(s.balanceKobo))}</dd>
          </dl>
          {owes ? (
            <div className="space-y-3 rounded-lg border border-[#f3d28a] bg-[#fff4dc] p-4">
              <a href={`/app/payments/record?reservation=${reservationId}`} className={buttonStyles({ variant: "secondary" })}>Take payment · {formatNaira(s.balanceKobo)}</a>
              {canLeaveOwing ? (
                <Field label="Or leave it owing: why?" htmlFor="owing" hint="Shows under Owed until it's paid.">
                  <Input id="owing" value={owingReason} onChange={(e) => setOwingReason(e.target.value)} maxLength={300} className="w-full" placeholder="e.g. Company pays by Friday" />
                </Field>
              ) : null}
            </div>
          ) : null}
          {credit > 0 ? (
            refund?.sent ? (
              <FormMessage tone="success">Refund request sent to the GM. It isn&apos;t paid out at the desk.</FormMessage>
            ) : refund ? (
              <div className="space-y-3 rounded-lg border border-hairline p-4">
                <p className="text-sm text-ink-700">Up to {formatNaira(s.refundLimitKobo)} can be refunded. The GM or owner approves it; nothing is paid out at the desk.</p>
                <Field label="Amount" htmlFor="refund-amount"><MoneyInput id="refund-amount" value={refund.amount} onChange={(e) => setRefund({ ...refund, amount: e.target.value })} /></Field>
                <Segmented label="Refund by" value={refund.method} onChange={(m) => setRefund({ ...refund, method: m })} options={[{ value: "bank_transfer", label: "Transfer" }, { value: "cash", label: "Cash" }]} />
                <Field label="Reason" htmlFor="refund-reason"><Input id="refund-reason" value={refund.reason} onChange={(e) => setRefund({ ...refund, reason: e.target.value })} maxLength={500} className="w-full" /></Field>
                <Button variant="secondary" pending={pending} onClick={sendRefund}>Send refund request</Button>
              </div>
            ) : (
              <Button variant="secondary" onClick={() => setRefund({ amount: String(Math.min(credit, s.refundLimitKobo) / 100), method: "bank_transfer", reason: "", sent: false })}>Ask for a refund of {formatNaira(credit)}</Button>
            )
          ) : null}
          <div className="space-y-2.5">
            <label className="flex items-center gap-3 text-sm font-medium text-ink-900">
              <input type="checkbox" checked={key} onChange={(e) => setKey(e.target.checked)} className="size-5 accent-navy-900" />
              Key returned
            </label>
            <label className="flex items-center gap-3 text-sm font-medium text-ink-900">
              <input type="checkbox" checked disabled className="size-5 accent-navy-900" />
              Room {s.roomNumber ?? ""} goes to cleaning
            </label>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-ink-900">Send the receipt</p>
            <div className="flex flex-wrap gap-2">
              {s.lastReceipt ? <a href={`/app/payments/receipt/${encodeURIComponent(s.lastReceipt)}`} target="_blank" rel="noreferrer" className={buttonStyles({ variant: "secondary", size: "sm" })}>Print</a> : null}
              {s.email ? <a href={`mailto:${s.email}?subject=${encodeURIComponent(`Your receipt · ${s.reference}`)}&body=${encodeURIComponent(receiptText)}`} className={buttonStyles({ variant: "secondary", size: "sm" })}>Email</a> : null}
              <a href={wa} target="_blank" rel="noreferrer" className={buttonStyles({ variant: "secondary", size: "sm" })}>WhatsApp</a>
            </div>
          </div>
        </>
      ) : null}
      {message ? <FormMessage>{message}</FormMessage> : null}
    </Drawer>
  );
}
