import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Photo } from "@/components/public/photo";
import { Container, Section } from "@/components/public/section";
import { sitePhoto } from "@/components/public/site-photo";
import { buttonStyles } from "@/components/ui/button";
import { hotel } from "@/config/hotel";
import { faqJsonLd, hotelFaqs, ldJson } from "@/lib/seo";
import { getSitePhotos } from "@/server/queries/catalogue";
import { publicBookingRules } from "@/server/queries/booking";

export const metadata: Metadata = {
  title: "Contact & location",
  description: `Call, WhatsApp or email ${hotel.name}. ${hotel.address.line1}, ${hotel.address.city}.`,
  alternates: { canonical: "/contact" },
};

const address = `${hotel.address.line1}, ${hotel.address.city}, ${hotel.address.state}`;

/** Designs G11 (computer) and M13 (phone). */
export default function ContactPage() {
  const rows: Array<{ label: string; value: string; href: string; phone?: boolean }> = [
    { label: "Address", value: `${hotel.address.line1}, ${hotel.address.city}`, href: hotel.mapsUrl },
    { label: "Front desk", value: `${hotel.phoneDisplay} · open 24 hours`, href: `tel:${hotel.phone}` },
    { label: "WhatsApp", value: hotel.phoneDisplay, href: `https://wa.me/${hotel.whatsapp}`, phone: true },
    { label: "Email", value: hotel.email, href: `mailto:${hotel.email}` },
  ];
  return (
    <>
      <Container className="grid gap-6 pt-4 pb-10 lg:grid-cols-2 lg:gap-12 lg:pt-12 lg:pb-18">
        <div className="flex flex-col">
          <p className="text-[13px] font-semibold tracking-[0.14em] text-gold-500 max-lg:hidden">CONTACT</p>
          <h1 className="font-display text-[34px] leading-[1.1] font-semibold text-ink-900 lg:mt-4 lg:text-[52px]">We look forward to welcoming you</h1>
          <ul className="mt-3 lg:mt-4">
            {rows.map((r) => (
              <li key={r.label} className={r.phone ? "max-lg:hidden" : undefined}>
                <a href={r.href} className="flex flex-col gap-0.5 border-b border-hairline py-3.5 hover:text-navy-700">
                  <span className="text-xs font-semibold text-muted lg:text-[13px]">{r.label}</span>
                  <span className="text-[15px] font-semibold break-words lg:text-[17px]">{r.value}</span>
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-col gap-2.5 lg:mt-6 lg:flex-row">
            <Link href="/book" className={buttonStyles({ className: "max-lg:hidden" })}>Book now</Link>
            <a href={`tel:${hotel.phone}`} className={buttonStyles({ size: "lg", className: "w-full lg:hidden" })}>Call the front desk</a>
            <a href={`https://wa.me/${hotel.whatsapp}`} className={buttonStyles({ variant: "secondary", className: "max-lg:w-full" })}>Message us on WhatsApp</a>
          </div>
        </div>
        <div className="flex flex-col gap-3.5">
          <Suspense fallback={<div className="h-80 rounded-xl bg-ivory-200 max-lg:hidden" />}>
            <ContactPhoto />
          </Suspense>
          <iframe
            title={`Map showing ${hotel.name}`}
            src={`https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`}
            className="h-[180px] w-full rounded-xl border-0 bg-[#e8eefb] lg:h-[220px]"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
          <a href={hotel.mapsUrl} className="inline-flex min-h-11 items-center self-start text-sm font-semibold text-navy-700 hover:underline">Open in Google Maps</a>
        </div>
      </Container>
      <Suspense fallback={null}>
        <GoodToKnow />
      </Suspense>
    </>
  );
}

async function ContactPhoto() {
  const photos = await getSitePhotos();
  return <Photo photo={sitePhoto(photos, "exterior", { alt: "Victoria Luxury Hotel" })} className="h-80 rounded-xl max-lg:hidden" sizes="50vw" />;
}

async function GoodToKnow() {
  await connection();
  const rules = await publicBookingRules().catch(() => null);
  if (!rules) return null;
  const faqs = hotelFaqs(rules, rules.cancellationPolicy ?? "Please contact the hotel.");
  return (
    <Section tone="ivory">
      <h2 className="font-display text-[32px] leading-tight font-semibold text-ink-900 lg:text-[44px]">Good to know</h2>
      <dl className="mt-6 grid gap-x-10 gap-y-5 md:grid-cols-2">
        {faqs.map((f) => (
          <div key={f.q} className="border-t border-hairline pt-4">
            <dt className="font-semibold text-ink-900">{f.q}</dt>
            <dd className="mt-1 text-sm leading-relaxed text-muted">{f.a}</dd>
          </div>
        ))}
      </dl>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(faqJsonLd(faqs)) }} />
    </Section>
  );
}
