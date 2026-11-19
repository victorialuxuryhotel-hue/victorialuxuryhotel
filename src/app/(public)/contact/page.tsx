import type { Metadata } from "next";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHero } from "@/components/public/page-hero";
import { Section } from "@/components/public/section";
import { buttonStyles } from "@/components/ui/button";
import { hotel } from "@/config/hotel";

export const metadata: Metadata = {
  title: "Contact & location",
  description: `Call, WhatsApp or email ${hotel.name}. ${hotel.address.line1}, ${hotel.address.city}.`,
};

const channels: Array<{ icon: LucideIcon; label: string; value: string; href: string; action: string }> = [
  { icon: Phone, label: "Call the front desk", value: hotel.phoneDisplay, href: `tel:${hotel.phone}`, action: "Call now" },
  { icon: MessageCircle, label: "WhatsApp", value: hotel.phoneDisplay, href: `https://wa.me/${hotel.whatsapp}`, action: "Start a chat" },
  { icon: Mail, label: "Email", value: hotel.email, href: `mailto:${hotel.email}`, action: "Send an email" },
];

export default function ContactPage() {
  const address = `${hotel.address.line1}, ${hotel.address.city}, ${hotel.address.state}`;
  return (
    <>
      <PageHero eyebrow="Contact" title="We look forward to welcoming you" intro="For reservations, questions or special requests, our team is a call or message away." />

      <Section>
        <div className="grid gap-6 md:grid-cols-3">
          {channels.map((c) => (
            <a key={c.label} href={c.href} className="group rounded-card bg-white p-8 shadow-card transition-shadow hover:shadow-lg">
              <span className="flex size-12 items-center justify-center rounded-full bg-gold-50">
                <c.icon className="size-6 text-gold-600" strokeWidth={1.5} aria-hidden />
              </span>
              <p className="mt-6 text-sm text-ink-500">{c.label}</p>
              <p className="mt-1 break-all font-display text-2xl text-navy-950">{c.value}</p>
              <p className="mt-6 text-sm font-medium text-navy-800 group-hover:text-gold-600">{c.action} →</p>
            </a>
          ))}
        </div>

        <div className="mt-12 grid overflow-hidden rounded-card bg-white shadow-card lg:grid-cols-[1fr_1.4fr]">
          <div className="p-8 sm:p-12">
            <MapPin className="size-8 text-gold-500" strokeWidth={1.5} aria-hidden />
            <h2 className="mt-5 font-display text-4xl text-navy-950">Find us</h2>
            <address className="mt-4 text-lg leading-relaxed not-italic text-ink-700">
              {hotel.address.line1}
              <br />
              {hotel.address.city}, {hotel.address.state}
              <br />
              {hotel.address.country}
            </address>
            <a href={hotel.mapsUrl} className={buttonStyles({ className: "mt-8" })}>Open in Google Maps</a>
          </div>
          <iframe
            title={`Map showing ${hotel.name}`}
            src={`https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`}
            className="h-96 w-full border-0 lg:h-full lg:min-h-[28rem]"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </Section>
    </>
  );
}
