import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/public/page-skeleton";
import { CtaBand } from "@/components/public/cta-band";
import { PageHero } from "@/components/public/page-hero";
import { Photo } from "@/components/public/photo";
import { Section, SectionHeading } from "@/components/public/section";
import { sitePhoto } from "@/components/public/site-photo";
import { facilities, highlights } from "@/content/site";
import { getSitePhotos } from "@/server/queries/catalogue";

export const metadata: Metadata = {
  title: "Facilities",
  description: "Indoor pool, spa, restaurant, lounge and bar, conference room and more at Victoria Luxury Hotel, Akure.",
  alternates: { canonical: "/facilities" },
};

async function FacilitiesPageContent() {
  const photos = await getSitePhotos();
  const slots = ["pool", "spa", "bar"];
  return (
    <>
      <PageHero
        eyebrow="Facilities & services"
        title="Comfort, care and everything on site"
        intro="Relax by the indoor pool, unwind in the spa, or meet colleagues in the conference room, all without leaving the hotel."
      />

      <Section>
        <div className="space-y-20 sm:space-y-28">
          {highlights.map((h, i) => (
            <article key={h.title} className="grid items-center gap-10 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
              <Photo photo={sitePhoto(photos, slots[i]!, h)} className={`aspect-[16/10] rounded-card ${i % 2 ? "lg:order-2" : ""}`} />
              <div>
                <h.icon className="size-9 text-gold-500" strokeWidth={1.5} aria-hidden />
                <h2 className="mt-5 font-display text-4xl text-navy-950 sm:text-5xl">{h.title}</h2>
                <p className="mt-4 text-lg leading-relaxed text-ink-600">{h.text}</p>
              </div>
            </article>
          ))}
        </div>
      </Section>

      <Section tone="ivory">
        <SectionHeading eyebrow="At a glance" title="Facilities & services" align="center" />
        <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {facilities.map((f) => (
            <li key={f.name} className="flex gap-5 rounded-card bg-ivory-50 p-6 shadow-card">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-navy-50">
                <f.icon className="size-6 text-navy-800" strokeWidth={1.5} aria-hidden />
              </span>
              <div>
                <h3 className="font-medium text-navy-950">{f.name}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-600">{f.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <CtaBand />
    </>
  );
}

/** Content reads room types and photos per request; the page frame shows immediately. */
export default function FacilitiesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <FacilitiesPageContent />
    </Suspense>
  );
}
