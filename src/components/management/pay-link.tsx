"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormMessage, Input, Textarea } from "@/components/ui/form";
import { formatNaira } from "@/lib/format";
import { makePayLink } from "@/server/pay-links";
import type { PayLink } from "@/server/domain/pay-links";

const waNumber = (phone: string) => {
  const d = phone.replace(/\D/g, "");
  return d.startsWith("0") ? `234${d.slice(1)}` : d;
};

/**
 * Send a payment link (design X14; FUNCTIONALITY.md section 10). Makes a /pay/<code> link for what's owed; the
 * staff member sends it on WhatsApp (wa.me) or by email from their own app, or copies it. The server sends nothing.
 */
export function SendPayLinkButton({ reservationId, size = "md", className }: { reservationId: string; size?: "sm" | "md"; className?: string }) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<PayLink | null>(null);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  const openDrawer = () => {
    setOpen(true);
    setError(null);
    start(async () => {
      const r = await makePayLink(reservationId);
      if (!r.ok) return setError(r.message);
      setLink(r.data);
      setPhone(r.data.phone ?? "");
      setEmail(r.data.email ?? "");
      setMessage(r.data.message);
    });
  };
  const url = link ? message.match(/https?:\/\/\S+\/pay\/[A-Za-z0-9_-]+/)?.[0] ?? "" : "";

  return (
    <>
      <Button variant="secondary" size={size} className={className} onClick={openDrawer}>Send a payment link</Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Send a payment link"
        subtitle={link ? `${link.guestName} · ${link.reference} · ${formatNaira(link.amountKobo)}` : undefined}
        footer={
          link ? (
            <>
              <a
                href={`https://wa.me/${phone ? waNumber(phone) : ""}?text=${encodeURIComponent(message)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-15 w-full items-center justify-center rounded-lg bg-navy-900 text-lg font-semibold text-white hover:bg-navy-800"
              >
                Send on WhatsApp
              </a>
              <div className="flex gap-2">
                {email ? (
                  <a href={`mailto:${email}?subject=${encodeURIComponent(`Pay for your stay · ${link.reference}`)}&body=${encodeURIComponent(message)}`} className="inline-flex h-11 items-center rounded-lg border border-[#cfcabd] bg-white px-4 text-[15px] font-semibold text-ink-900">
                    Send by email
                  </a>
                ) : null}
                <Button
                  variant="ghost"
                  onClick={async () => {
                    await navigator.clipboard.writeText(url).catch(() => undefined);
                    setCopied(true);
                  }}
                >
                  {copied ? "Copied" : "Copy link"}
                </Button>
              </div>
            </>
          ) : null
        }
      >
        {pending && !link ? <p className="text-sm text-ink-500">Making the link…</p> : null}
        {error ? <FormMessage>{error}</FormMessage> : null}
        {link ? (
          <>
            <div className="flex flex-wrap gap-4">
              <Field label="WhatsApp number" htmlFor="pl-phone"><Input id="pl-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-48 tabular-nums" /></Field>
              <Field label="Email" htmlFor="pl-email" optional><Input id="pl-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-64" /></Field>
            </div>
            <p className="text-sm text-ink-600">
              The link shows the booking and a Pay button.{" "}
              {link.message.includes("held until") ? "The room stays held until the time in the message; once paid, it's confirmed by itself." : "Once paid, the balance clears by itself."} A new link replaces this one.
            </p>
            <Field label="Message" htmlFor="pl-message"><Textarea id="pl-message" value={message} onChange={(e) => setMessage(e.target.value)} rows={4} className="w-full" /></Field>
          </>
        ) : null}
      </Drawer>
    </>
  );
}
