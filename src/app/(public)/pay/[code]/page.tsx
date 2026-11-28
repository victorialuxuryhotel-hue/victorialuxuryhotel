import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Container } from "@/components/public/section";
import { buttonStyles } from "@/components/ui/button";
import { hotel } from "@/config/hotel";
import { formatDate, formatNaira } from "@/lib/format";
import { getDb } from "@/server/db";
import { payLinkView } from "@/server/domain/pay-links";
import { PayButton } from "./pay-button";

export const metadata: Metadata = { title: "Pay for your stay", robots: { index: false, follow: false } };

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" });

/** The guest's pay page from a link the front desk sent (design M14; FUNCTIONALITY.md section 10). */
async function Pay({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const v = await payLinkView(await getDb(), code);
  if (v.state === "paid") redirect(`/book/confirmation/${v.token}`);
  if (v.state === "closed") {
    return (
      <div className="mx-auto max-w-md text-center">
        <h1 className="font-display text-4xl text-navy-950">This payment link has ended</h1>
        <p className="mt-3 text-ink-600">
          {v.reason === "cancelled" ? "The hotel has sent a newer link." : "It has expired or isn't valid."} Ask the front desk for a new one: {hotel.phoneDisplay}.
        </p>
        <a href={`https://wa.me/${hotel.whatsapp}`} className={buttonStyles({ className: "mt-8" })}>WhatsApp the hotel</a>
      </div>
    );
  }
  const row = "flex justify-between gap-4 py-2.5";
  return (
    <div className="mx-auto max-w-md">
      <p className="text-sm text-ink-500">Sent by the front desk · {v.reference}</p>
      <h1 className="mt-1 font-display text-[2rem] leading-tight text-navy-950">Pay for your stay{v.firstName ? `, ${v.firstName}` : ""}</h1>
      <dl className="mt-5 divide-y divide-hairline rounded-xl border border-hairline bg-white px-4 text-[15px]">
        <div className={row}><dt className="text-ink-500">Room</dt><dd className="text-right">{v.category} · {v.guests} {v.guests === 1 ? "adult" : "adults"}</dd></div>
        <div className={row}><dt className="text-ink-500">Arrive</dt><dd>{formatDate(v.checkIn, { weekday: true, year: false })}</dd></div>
        <div className={row}><dt className="text-ink-500">Leave</dt><dd>{formatDate(v.checkOut, { weekday: true, year: false })} · {v.nights} night{v.nights === 1 ? "" : "s"}</dd></div>
        <div className={`${row} font-semibold`}><dt>{v.heldUntil ? "Total" : "To pay"}</dt><dd className="tabular-nums">{formatNaira(v.amountKobo)}</dd></div>
      </dl>
      {v.heldUntil ? (
        <p className="mt-4 rounded-lg bg-[#fff4dc] px-4 py-3 text-sm text-[#8a4b06]">
          Held for you until <b>{time(v.heldUntil)}</b>{new Date(v.heldUntil).toDateString() === new Date().toDateString() ? " today" : ""}. After that the room may be released.
        </p>
      ) : null}
      <PayButton code={code} amount={formatNaira(v.amountKobo)} needsEmail={v.needsEmail} />
      <p className="mt-6 text-center text-sm text-ink-500">
        Questions? <Link href="/contact" className="underline">Contact the hotel</Link> · {hotel.phoneDisplay}
      </p>
    </div>
  );
}

export default function PayPage(props: PageProps<"/pay/[code]">) {
  return (
    <Container className="py-10 sm:py-16">
      <Suspense fallback={<div className="h-96" />}>
        <Pay params={props.params} />
      </Suspense>
    </Container>
  );
}
