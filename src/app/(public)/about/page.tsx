import type { Metadata } from "next";
import { Suspense } from "react";
import { Crown, HeartHandshake, ShieldCheck } from "lucide-react";
import { PageSkeleton } from "@/components/public/page-skeleton";
import { CtaBand } from "@/components/public/cta-band";
import { PageHero } from "@/components/public/page-hero";
import { Photo } from "@/components/public/photo";
import { Section, SectionHeading } from "@/components/public/section";
import { sitePhoto } from "@/components/public/site-photo";
import { guestTypes } from "@/content/site";
import { getSitePhotos } from "@/server/queries/catalogue";

export const metadata: Metadata = {
  title: "About the hotel",
  description: "Victoria Luxury Hotel and Apartment, Alagbaka GRA, Akure: our story and what we stand for.",
  alternates: { canonical: "/about" },
};

const values = [
  { icon: Crown, title: "Guests are royalty", text: "Our guests are kings and queens, and every part of the stay is shaped around that belief." },
  { icon: HeartHandshake, title: "Attentive service", text: "A team on hand from booking to check-out, reachable by phone, WhatsApp and email." },
  { icon: ShieldCheck, title: "Peace of mind", text: "Uninterrupted power, free Wi-Fi and on-site parking, at a convenient address in Alagbaka GRA." },
];

async function AboutPageContent() {
  const photos = await getSitePhotos();
  return (
    <>
      <PageHero
        eyebrow="About us"
        title="A standard that will be hard to beat"
        intro="Victoria Luxury Hotel and Apartment offers an ambience rarely found in the vicinity: an exclusive indoor pool, a lounge and bar, and an in-house spa with a heated room and body scrub."
      />

      <Section>
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
          <div className="grid grid-cols-2 gap-4">
            <Photo photo={sitePhoto(photos, "exterior", { alt: "Hotel exterior" })} className="aspect-[3/4] rounded-card" />
            <Photo photo={sitePhoto(photos, "reception", { alt: "Reception" })} className="mt-12 aspect-[3/4] rounded-card" />
          </div>
          <div>
            <SectionHeading eyebrow="Our philosophy" title="We treat our guests as kings and queens" />
            <div className="mt-6 space-y-4 text-lg leading-relaxed text-ink-600">
              <p>
                Whether you are in Akure for business, visiting family or simply taking time away, we want your stay to feel effortless and
                special.
              </p>
              <p>
                Rooms, suites and apartments, a restaurant, lounge and bar, an indoor pool and a spa: everything you need is under one roof.
              </p>
            </div>
          </div>
        </div>
      </Section>

      <Section tone="navy">
        <div className="grid gap-10 md:grid-cols-3">
          {values.map((v) => (
            <div key={v.title} className="border-l border-gold-400/40 pl-6">
              <v.icon className="size-8 text-gold-400" strokeWidth={1.5} aria-hidden />
              <h2 className="mt-5 font-display text-3xl">{v.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-ivory-200/75">{v.text}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section tone="ivory">
        <SectionHeading eyebrow="Who we host" title="However you travel" />
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {guestTypes.map((g) => (
            <div key={g.title} className="rounded-card bg-ivory-50 p-6 shadow-card">
              <h3 className="font-display text-2xl text-navy-950">{g.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">{g.text}</p>
            </div>
          ))}
        </div>
      </Section>

      <CtaBand />
    </>
  );
}

export default function AboutPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AboutPageContent />
    </Suspense>
  );
}
