import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { MapMotif } from "@/components/public/map-card";
import { PageHero } from "@/components/public/page-hero";
import { Section } from "@/components/public/section";
import { buttonStyles } from "@/components/ui/button";
import { hotel } from "@/config/hotel";
import { faqJsonLd, hotelFaqs, ldJson } from "@/lib/seo";
import { publicBookingRules } from "@/server/queries/booking";

export const metadata: Metadata = {
  title: "Contact & location",
  description: `Call, WhatsApp or email ${hotel.name}. ${hotel.address.line1}, ${hotel.address.city}.`,
  alternates: { canonical: "/contact" },
};

const channels: Array<{ icon: LucideIcon; label: string; value: string; href: string; action: string; short: string }> = [
  { icon: Phone, label: "Call the front desk", value: hotel.phoneDisplay, href: `tel:${hotel.phone}`, action: "Call now", short: "Call" },
  { icon: MessageCircle, label: "WhatsApp", value: hotel.phoneDisplay, href: `https://wa.me/${hotel.whatsapp}`, action: "Start a chat", short: "Chat" },
  { icon: Mail, label: "Email", value: hotel.email, href: `mailto:${hotel.email}`, action: "Send an email", short: "Email" },
];

export default function ContactPage() {
  const address = `${hotel.address.line1}, ${hotel.address.city}, ${hotel.address.state}`;
  return (
    <>
      <PageHero eyebrow="Contact" title="We look forward to welcoming you" intro="For reservations, questions or special requests, our team is a call or message away." />

      <Section className="pt-6 sm:pt-20">
        <ul className="divide-y divide-hairline border-b border-hairline md:hidden">
          {channels.map((c) => (
            <li key={c.label}>
              <a href={c.href} className="flex min-h-16 items-center justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="block text-sm text-ink-500">{c.label}</span>
                  <span className="block font-display text-xl break-words text-navy-950">{c.value}</span>
                </span>
                <span className="shrink-0 text-sm font-medium text-gold-600">{c.short}</span>
              </a>
            </li>
          ))}
        </ul>
        <div className="hidden gap-6 md:grid md:grid-cols-3">
          {channels.map((c) => (
            <a key={c.label} href={c.href} className="group rounded-card bg-ivory-50 p-8 shadow-card transition-shadow hover:shadow-lg">
              <span className="flex size-12 items-center justify-center rounded-full bg-gold-50">
                <c.icon className="size-6 text-gold-600" strokeWidth={1.5} aria-hidden />
              </span>
              <p className="mt-6 text-sm text-ink-500">{c.label}</p>
              <p className="mt-1 break-all font-display text-2xl text-navy-950">{c.value}</p>
              <p className="mt-6 text-sm font-medium text-navy-800 group-hover:text-gold-600">{c.action} →</p>
            </a>
          ))}
        </div>

        <div className="mt-8 grid overflow-hidden rounded-card bg-ivory-50 shadow-card sm:mt-12 lg:grid-cols-[1fr_1.4fr]">
          <MapMotif className="lg:hidden" />
          <div className="p-5 sm:p-12">
            <MapPin className="hidden size-8 text-gold-500 lg:block" strokeWidth={1.5} aria-hidden />
            <h2 className="font-display text-2xl text-navy-950 sm:text-4xl lg:mt-5">Find us</h2>
            <address className="mt-2 text-base leading-relaxed not-italic text-ink-700 sm:mt-4 sm:text-lg">
              {hotel.address.line1}
              <br />
              {hotel.address.city}, {hotel.address.state}
              <br />
              {hotel.address.country}
            </address>
            <a href={hotel.mapsUrl} className={buttonStyles({ variant: "secondary", size: "lg", className: "mt-5 w-full sm:mt-8 sm:w-auto" })}>Open in Google Maps</a>
          </div>
          <iframe
            title={`Map showing ${hotel.name}`}
            src={`https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`}
            className="hidden w-full border-0 lg:block lg:h-full lg:min-h-[28rem]"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </Section>
      <Suspense fallback={null}>
        <GoodToKnow />
      </Suspense>
    </>
  );
}

async function GoodToKnow() {
  await connection();
  const rules = await publicBookingRules().catch(() => null);
  if (!rules) return null;
  const faqs = hotelFaqs(rules, rules.cancellationPolicy ?? "Please contact the hotel.");
  return (
    <Section tone="ivory">
      <h2 className="font-display text-4xl text-navy-950">Good to know</h2>
      <dl className="mt-8 grid gap-x-10 gap-y-6 md:grid-cols-2">
        {faqs.map((f) => (
          <div key={f.q} className="border-t border-hairline pt-4">
            <dt className="font-medium text-navy-950">{f.q}</dt>
            <dd className="mt-1 text-sm leading-relaxed text-ink-700">{f.a}</dd>
          </div>
        ))}
      </dl>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(faqJsonLd(faqs)) }} />
    </Section>
  );
}
