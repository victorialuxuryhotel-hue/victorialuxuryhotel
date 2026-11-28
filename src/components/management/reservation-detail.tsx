import Link from "next/link";
import type { ReactNode } from "react";
import { owedOf } from "@/domain/next-step";
import { SendPayLinkButton } from "./pay-link";
import { AlertTriangle, Clock, Printer } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { Section } from "@/components/ui/card";
import { Collapsible } from "@/components/ui/collapsible";
import { FormMessage } from "@/components/ui/form";
import { bookingSource, paymentMethod, staffRole } from "@/domain/status";
import type { ReservationDetail as Detail } from "@/domain/views";
import { hotel } from "@/config/hotel";
import { publicEnv } from "@/lib/env";
import { formatDate, formatDateTime, formatNaira, formatRange, plural } from "@/lib/format";
import { cn } from "@/lib/utils/cn";
import { whatsappLink } from "@/lib/whatsapp";
import { BookingStatusBadge } from "./badges";
import {
  AssignRoomForm,
  CancelForm,
  ChangeDatesForm,
  CheckInButton,
  CheckOutButton,
  TakePaymentLink,
  DetailsForm,
  NoShowButton,
  OverrideForm,
  PendingChangeCard,
  ResolveAttentionForm,
  type RoomOption,
} from "./reservation-actions";
import { ActionFeedbackProvider } from "./action-feedback";
import { CorrectPaymentForm } from "./payment-correction";
import type { ManagerToAsk } from "@/server/domain/admin";
import { NextStepBar } from "./reservation-guide";
import { nextStep } from "@/domain/next-step";
import { GuestAvatar } from "./guest-avatar";
import { reservationSteps } from "./reservation-steps";

/** One fact in the Stay card (design R102): a small grey label over the value. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-xs font-semibold text-[#5b6372]">{label}</span>
      <span className="text-[15px] font-semibold text-ink-900">{children}</span>
    </div>
  );
}

const th = "px-4 py-2.5 text-xs font-semibold text-[#5b6372] whitespace-nowrap";
const td = "px-4 py-2.5 align-top text-sm text-ink-900";

export function ReservationDetailView({
  r,
  today,
  backHref,
  paymentsHref,
  receiptHref,
  billHref,
  guestHref,
  rooms,
  canOverride = false,
  canApprove = false,
  canManage = true,
  maxGuests,
  justCreated,
  paidReceipt,
  manager,
  stayTimes,
}: {
  r: Detail & { roomId?: string; publicToken?: string };
  today: string;
  backHref: string;
  paymentsHref: string;
  receiptHref: (receipt: string) => string;
  billHref?: string;
  guestHref?: string;
  rooms: RoomOption[];
  canOverride?: boolean;
  canApprove?: boolean;
  canManage?: boolean;
  maxGuests: number;
  justCreated?: boolean;
  paidReceipt?: string;
  manager?: ManagerToAsk | null;
  /** "any time" / "by 12:00" from the booking rules, shown beside the dates. */
  stayTimes?: { checkIn: string; checkOut: string };
}) {
  const balance = owedOf(r);
  const year = today.slice(0, 4);
  const receiptLink = r.publicToken ? `${publicEnv().NEXT_PUBLIC_SITE_URL}/book/confirmation/${r.publicToken}` : null;
  const shareReceipt = (receipt: string) =>
    receiptLink
      ? whatsappLink(
          r.guestPhone,
          `Hello ${r.guestName.split(" ")[0]}, thank you for your payment to ${hotel.shortName}. Your receipt ${receipt} for booking ${r.reference}: ${receiptLink}`,
        )
      : null;
  const receiptsById = new Map(r.payments.map((p) => [p.id, p.receiptNumber]));
  // Money received is listed; online attempts that didn't complete are tucked away below it.
  const received = r.payments.filter((p) => p.status === "successful");
  const notCompleted = r.payments.filter((p) => p.status !== "successful");
  const open = r.status === "confirmed" || r.status === "pending_payment";
  const canChange = canManage && (open || r.status === "checked_in");
  const step = nextStep(r, today);
  const now = reservationSteps(r, today)?.find((s) => s.state === "now");
  const roomsKobo = r.nightlyRateKobo * r.nights;
  const otherKobo = r.totalKobo - roomsKobo;
  const date = (d: string) => formatDate(d, { year });

  // The "Next step" card (design R102): what to do now, the one primary button, then the alternatives.
  const headline =
    step.kind === "take_payment" ? `Owes ${formatNaira(step.owedKobo)}`
    : step.kind === "assign_room" ? "Paid · assign a room"
    : step.kind === "wait_for_arrival" ? `Paid · arrives ${formatDate(step.checkIn, { year: false })}`
    : step.kind === "check_in" ? "Paid and room ready"
    : step.kind === "check_out" ? `In house · due out ${formatDate(r.checkOut, { year: false })}`
    : step.kind === "stay_ended" ? "The stay dates have passed"
    : r.status === "checked_out" ? "Stay complete"
    : "Nothing more to do";
  const primary =
    !canManage ? null
    : step.kind === "take_payment" ? <TakePaymentLink reservationId={r.id} balanceKobo={step.owedKobo} className="w-full" />
    : step.kind === "check_in" ? <CheckInButton reservationId={r.id} roomNumber={r.roomNumber} className="w-full" />
    : step.kind === "assign_room" ? <a href="#change-stay" className={buttonStyles({ className: "w-full" })}>Assign a room</a>
    : step.kind === "wait_for_arrival" ? <CheckInButton reservationId={r.id} disabledReason={`Arrival is ${formatDate(step.checkIn)}`} className="w-full" />
    : step.kind === "check_out" ? <CheckOutButton reservationId={r.id} balanceKobo={0} className="w-full" />
    : null;
  const secondary = buttonStyles({ variant: "secondary", className: "w-full" });
  const canPrint = Boolean(billHref) && r.status !== "cancelled" && r.status !== "expired";
  const noShowDue = r.status === "confirmed" && r.checkIn <= today;

  return (
    <ActionFeedbackProvider>
    <div className="flex min-h-[72px] flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline bg-white px-4 py-3 lg:px-7">
      <div className="min-w-0 flex-1">
        <h1 className="text-[22px] font-bold text-ink-900">
          <span className="whitespace-nowrap">{r.reference}</span> · {r.guestName}
        </h1>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[#5b6372]">
          <BookingStatusBadge r={r} today={today} />
          <span>{r.category} · {formatRange(r.checkIn, r.checkOut, year, "–")}</span>
        </p>
      </div>
      <Link href={backHref} className={buttonStyles({ variant: "secondary", size: "sm" })}>← Bookings</Link>
    </div>

    <div className="space-y-3.5 px-4 py-5 lg:px-7">
      {justCreated ? (
        <FormMessage tone="success">
          Booking {r.reference} created. The room is held until {r.holdExpiresAt ? formatDateTime(r.holdExpiresAt) : "payment"}. Take payment to confirm it.
        </FormMessage>
      ) : null}

      {paidReceipt ? (
        <div>
          <FormMessage tone="success">
            Payment recorded. Receipt {paidReceipt}
            {r.guestEmail ? <> emailed to <span className="break-all">{r.guestEmail}</span></> : null}.{" "}
            <Link href={receiptHref(paidReceipt)} className="font-medium underline">Print receipt</Link>
          </FormMessage>
          {shareReceipt(paidReceipt) ? (
            <a
              href={shareReceipt(paidReceipt)!}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonStyles({ variant: "secondary", className: "mt-2" })}
            >
              Share on WhatsApp
            </a>
          ) : null}
        </div>
      ) : null}

      {r.attention ? (
        <div role="alert" className="flex gap-3 rounded-xl border border-[#f3d48a] bg-[#fff4dc] p-4 text-sm text-[#8a4b06]">
          <AlertTriangle className="size-5 shrink-0" aria-hidden />
          <div className="flex-1">
            <p className="font-semibold">Needs attention</p>
            <p className="mt-0.5">{r.attention}</p>
            {canApprove ? <ResolveAttentionForm reservationId={r.id} /> : <p className="mt-1 text-xs">The general manager marks this resolved once it&apos;s sorted.</p>}
          </div>
        </div>
      ) : null}

      {canManage && r.pendingChange ? <PendingChangeCard reservationId={r.id} change={r.pendingChange} owedKobo={balance} canApprove={Boolean(canApprove)} /> : null}

      <div className="flex flex-col gap-3.5 lg:flex-row lg:items-start lg:gap-[18px]">
        <div className="flex min-w-0 flex-1 flex-col gap-3.5">
          <Section title="Stay" id="stay">
            <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3">
              <Fact label="Arrive">{date(r.checkIn)}{stayTimes ? ` · ${stayTimes.checkIn}` : ""}</Fact>
              <Fact label="Leave">{date(r.checkOut)}{stayTimes ? ` · ${stayTimes.checkOut}` : ""}</Fact>
              <Fact label="Nights">{r.nights}</Fact>
              <Fact label="Room">
                {r.category} · {r.roomNumber ? `Room ${r.roomNumber}` : <span className="text-[#8a4b06]">no room yet</span>}
              </Fact>
              <Fact label="Guests">{plural(r.guests, "guest")}</Fact>
              <Fact label="Booked">
                {bookingSource[r.source]} · {formatDate(r.createdAt.slice(0, 10), { weekday: false, year })}
                {r.createdBy ? <span className="block text-xs font-normal text-[#5b6372]">by {r.createdBy}</span> : null}
              </Fact>
            </div>
            {r.specialRequests && !canChange ? (
              <div className="border-t border-hairline px-4 py-3">
                <p className="text-xs font-semibold text-[#5b6372]">Special requests</p>
                <p className="mt-0.5 text-sm text-ink-900">{r.specialRequests}</p>
              </div>
            ) : null}
            {r.status === "pending_payment" && r.holdExpiresAt ? (
              <p className="flex items-center gap-1.5 border-t border-hairline px-4 py-3 text-sm text-[#8a4b06]">
                <Clock className="size-4" aria-hidden /> Held until {formatDateTime(r.holdExpiresAt)}, then released if unpaid
              </p>
            ) : null}
            {canChange ? (
              <div className="border-t border-hairline">
                <Collapsible id="change-stay" collapseWide title={r.status === "pending_payment" ? "Change dates" : "Change dates or room"}>
                  <DetailsForm reservationId={r.id} guests={r.guests} specialRequests={r.specialRequests} maxGuests={maxGuests} />
                  <ChangeDatesForm reservationId={r.id} checkIn={r.checkIn} checkOut={r.checkOut} inHouse={r.status === "checked_in"} />
                  {r.status === "pending_payment" ? (
                    <p className="border-t border-hairline bg-ivory-50 px-5 py-4 text-sm text-ink-600">A room is given automatically once the booking is paid.</p>
                  ) : (
                    <AssignRoomForm reservationId={r.id} current={r.roomNumber} rooms={rooms} booked={r.category} specialRequests={r.specialRequests} />
                  )}
                </Collapsible>
              </div>
            ) : null}
          </Section>

          <Section title="Bill" id="bill">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left tabular-nums">
                <thead className="border-b border-hairline">
                  <tr>
                    <th scope="col" className={th}>Item</th>
                    <th scope="col" className={cn(th, "text-right")}>Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1eee8]">
                  <tr>
                    <td className={td}>{r.category} · {plural(r.nights, "night")} × {formatNaira(r.nightlyRateKobo)}</td>
                    <td className={cn(td, "text-right font-semibold whitespace-nowrap")}>{formatNaira(roomsKobo)}</td>
                  </tr>
                  {otherKobo !== 0 ? (
                    <tr>
                      <td className={td}>{otherKobo > 0 ? "Extras and changes" : "Discount"}</td>
                      <td className={cn(td, "text-right font-semibold whitespace-nowrap")}>{otherKobo < 0 ? "−" : ""}{formatNaira(Math.abs(otherKobo))}</td>
                    </tr>
                  ) : null}
                  {r.pendingChange ? (
                    <tr>
                      <td className={td}>Waiting for payment: {r.pendingChange.description}</td>
                      <td className={cn(td, "text-right font-semibold whitespace-nowrap")}>{formatNaira(r.pendingKobo ?? r.pendingChange.amountKobo)}</td>
                    </tr>
                  ) : null}
                  {received.map((p) => (
                    <tr key={p.id}>
                      <td className={td}>
                        {p.kind === "refund" ? (
                          <>
                            <span>
                              Correction{p.correctsPaymentId && receiptsById.get(p.correctsPaymentId) ? ` to ${receiptsById.get(p.correctsPaymentId)}` : ""} by {p.recordedBy ?? "a manager"}
                            </span>
                            <span className="block text-xs text-[#5b6372]">{p.paidAt ? formatDateTime(p.paidAt) : null}{p.notes ? ` · ${p.notes}` : ""}</span>
                          </>
                        ) : (
                          <>
                            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              Paid by {paymentMethod[p.method].toLowerCase()} {p.provider === "paystack" ? "online" : `· taken by ${p.recordedBy ?? "staff"}`}
                              {p.receiptNumber ? (
                                <Link href={receiptHref(p.receiptNumber)} className="inline-flex items-center gap-1 font-semibold text-navy-700 hover:text-navy-900">
                                  <Printer className="size-3.5" aria-hidden /> {p.receiptNumber}
                                </Link>
                              ) : null}
                            </span>
                            <span className="block text-xs text-[#5b6372]">
                              {p.paidAt ? formatDateTime(p.paidAt) : null}
                              {p.correctedKobo ? ` · ${formatNaira(p.correctedKobo)} corrected` : ""}
                            </span>
                            {canApprove && p.amountKobo - (p.correctedKobo ?? 0) > 0 ? (
                              <CorrectPaymentForm
                                paymentId={p.id}
                                reservationId={r.id}
                                receiptNumber={p.receiptNumber}
                                correctableKobo={p.amountKobo - (p.correctedKobo ?? 0)}
                              />
                            ) : null}
                          </>
                        )}
                      </td>
                      <td className={cn(td, "text-right font-semibold whitespace-nowrap")}>
                        {p.kind === "refund" ? formatNaira(p.amountKobo) : `−${formatNaira(p.amountKobo)}`}
                      </td>
                    </tr>
                  ))}
                  {received.length === 0 ? (
                    <tr>
                      <td colSpan={2} className={cn(td, "text-[#5b6372]")}>No payments received yet.</td>
                    </tr>
                  ) : null}
                  <tr>
                    <td className={td}><b>Balance</b></td>
                    <td className={cn(td, "text-right whitespace-nowrap")}>
                      <b className={balance > 0 ? "text-[#8a4b06]" : "text-[#166534]"}>{formatNaira(Math.max(0, balance))}</b>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {notCompleted.length ? (
              <details className="border-t border-hairline px-4 py-3 text-sm">
                <summary className="cursor-pointer text-ink-600">
                  Show {notCompleted.length === 1 ? "1 online payment" : `${notCompleted.length} online payments`} not completed
                </summary>
                <ul className="mt-2 space-y-1.5 text-ink-600">
                  {notCompleted.map((p) => (
                    <li key={p.id} className="flex justify-between gap-3 tabular-nums">
                      <span>Online payment not completed{p.paidAt ? ` · ${formatDateTime(p.paidAt)}` : ""}</span>
                      <span>{formatNaira(p.amountKobo)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-ink-500">No money was received for these. They&apos;re kept for checking with Paystack.</p>
              </details>
            ) : null}
          </Section>

          <Section title="History" id="history">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left tabular-nums">
                <thead className="border-b border-hairline">
                  <tr>
                    <th scope="col" className={th}>When</th>
                    <th scope="col" className={th}>What</th>
                    <th scope="col" className={th}>Who</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1eee8]">
                  {r.history.map((h, i) => (
                    <tr key={i}>
                      <td className={cn(td, "whitespace-nowrap")}>{formatDateTime(h.at)}</td>
                      <td className={td}>
                        {h.label}
                        {h.note ? <span className="block text-xs text-[#5b6372]">{h.note}</span> : null}
                      </td>
                      <td className={cn(td, "whitespace-nowrap")}>{h.by ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </div>

        <div className="flex w-full flex-col gap-3.5 lg:w-[300px] lg:flex-none">
          {canManage ? (
            <div className="hidden flex-col gap-2.5 rounded-xl border border-hairline bg-white p-4 lg:flex">
              <span className="text-[13px] font-semibold text-[#5b6372]">NEXT STEP</span>
              <span className="text-base font-bold text-ink-900">{headline}</span>
              {now && (step.kind === "take_payment" || step.kind === "assign_room" || step.kind === "check_in") ? <span className="-mt-1.5 text-sm text-[#5b6372]">{now.detail}</span> : null}
              {primary}
              {canOverride && r.status === "checked_in" && balance > 0 ? (
                <CheckOutButton reservationId={r.id} balanceKobo={balance} canLeaveOwing variant="secondary" className="w-full" />
              ) : null}
              {balance > 0 && ["pending_payment", "confirmed", "checked_in"].includes(r.status) ? <SendPayLinkButton reservationId={r.id} /> : null}
              {canChange ? <a href="#change-stay" className={secondary}>{r.status === "checked_in" ? "Extend or shorten" : "Change dates"}</a> : null}
              {canChange && r.status !== "pending_payment" && r.roomNumber ? <a href="#change-stay" className={secondary}>Move room</a> : null}
              {canPrint || noShowDue ? (
                <div className="flex flex-wrap justify-center gap-1">
                  {canPrint && billHref ? (
                    <Link href={billHref} className={buttonStyles({ variant: "ghost", size: "sm" })}>
                      <Printer className="size-4" aria-hidden /> Print bill
                    </Link>
                  ) : null}
                  {noShowDue ? <NoShowButton reservationId={r.id} /> : null}
                </div>
              ) : null}
              {open ? (
                <div className="flex justify-center border-t border-hairline pt-3">
                  <CancelForm reservationId={r.id} />
                </div>
              ) : null}
            </div>
          ) : canPrint && billHref ? (
            <Link href={billHref} className={buttonStyles({ variant: "secondary", className: "w-full" })}>
              <Printer className="size-4" aria-hidden /> Print bill
            </Link>
          ) : null}

          {r.status === "pending_payment" && canOverride ? <div className="hidden lg:block"><OverrideForm reservationId={r.id} /></div> : null}
          {canManage && r.status === "pending_payment" && !canOverride ? (
            <p className="hidden rounded-xl border border-hairline bg-white p-4 text-sm text-ink-700 lg:block">
              <span className="mr-2 rounded-md bg-[#eceae4] px-2 py-0.5 text-xs font-semibold text-ink-700">Manager</span>
              To hold the room longer, ask {manager ? `${manager.name} (${staffRole[manager.role]})` : "a manager"}.
            </p>
          ) : null}

          <Section title="Guest" id="guest" action={guestHref ? <Link href={guestHref} className="text-sm font-semibold text-navy-700 hover:underline">Profile</Link> : undefined}>
            <div className="flex flex-col gap-1.5 px-4 py-3.5 text-sm">
              <span className="flex items-center gap-2.5">
                <GuestAvatar name={r.guestName} size="sm" />
                <span className="font-semibold text-ink-900">{r.guestName}</span>
              </span>
              {r.guestPhone ? <a href={`tel:${r.guestPhone}`} className="text-ink-900 hover:text-navy-700">{r.guestPhone}</a> : null}
              {r.guestEmail ? <a href={`mailto:${r.guestEmail}`} className="break-all text-ink-900 hover:text-navy-700">{r.guestEmail}</a> : null}
            </div>
          </Section>
        </div>
      </div>
      {canManage ? <NextStepBar key={r.status} r={r} today={today} paymentsHref={paymentsHref} canOverride={canOverride} manager={manager ?? null} /> : null}
    </div>
    </ActionFeedbackProvider>
  );
}
