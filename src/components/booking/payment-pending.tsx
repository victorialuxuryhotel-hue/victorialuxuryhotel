"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { buttonStyles } from "@/components/ui/button";

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" });

/**
 * Waiting for your transfer (design G12; FUNCTIONALITY.md section 10). Shown while Paystack reports the payment as
 * pending. Checks every 10 seconds until it's paid, failed, or the hold ends; the guest is told not to pay again.
 */
export function WaitingForTransfer({ reference, category, heldUntil, whatsappText }: { reference: string; category: string; heldUntil: string | null; whatsappText: string }) {
  const router = useRouter();
  useEffect(() => {
    const until = heldUntil ? Date.parse(heldUntil) + 30 * 60_000 : Date.now() + 60 * 60_000; // the in-flight grace too
    const id = setInterval(() => {
      if (Date.now() > until) return clearInterval(id);
      router.refresh();
    }, 10_000);
    return () => clearInterval(id);
  }, [router, heldUntil]);
  return (
    <div className="mx-auto max-w-xl text-center">
      <p className="text-sm font-semibold tracking-[0.2em] text-gold-600 uppercase">Waiting for your transfer</p>
      <h1 className="mt-3 font-display text-4xl text-navy-950 sm:text-5xl">We&apos;re waiting for your bank</h1>
      <p className="mt-4 text-ink-700">
        Transfers usually arrive within a few minutes.{" "}
        {heldUntil ? <>Your {category || "room"} is held until <b className="tabular-nums">{time(heldUntil)}</b>. </> : null}
        <b>You don&apos;t need to pay again.</b>
      </p>
      <div className="mx-auto mt-6 h-1 max-w-xs overflow-hidden rounded-full bg-ivory-200" aria-hidden>
        <div className="h-full w-1/3 animate-pulse rounded-full bg-gold-500" />
      </div>
      <p className="mt-6 text-sm text-ink-600" role="status">This page updates by itself. We&apos;ll also email you when it arrives. Booking {reference}.</p>
      <a href={`https://wa.me/?text=${encodeURIComponent(whatsappText)}`} target="_blank" rel="noreferrer" className={buttonStyles({ variant: "secondary", className: "mt-6" })}>
        Send my booking to WhatsApp
      </a>
    </div>
  );
}
