import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/public/page-skeleton";
import { Photo } from "@/components/public/photo";
import { Container, Eyebrow } from "@/components/public/section";
import { sitePhoto } from "@/components/public/site-photo";
import { facilities } from "@/content/site";
import { cn } from "@/lib/utils/cn";
import { getSitePhotos } from "@/server/queries/catalogue";

export const metadata: Metadata = {
  title: "Facilities",
  description: "Indoor pool, spa, restaurant, lounge and bar, conference room and more at Victoria Luxury Hotel, Akure.",
  alternates: { canonical: "/facilities" },
};

/** The three features of design G10 (M12 on a phone), each with its photo from Website photos. */
const features = [
  { slot: "pool", title: "Exclusive indoor pool", text: "Swim in comfort, rain or shine, in a pool reserved for our guests.", alt: "Indoor swimming pool" },
  { slot: "bar", title: "Lounge & bar", text: "An evening drink, an easy meeting, or a quiet moment to yourself.", alt: "Lounge and bar" },
  { slot: "conference", title: "Conference room", text: "A room for meetings, trainings and corporate events, with catering from our kitchen.", alt: "Conference room" },
];

async function FacilitiesPageContent() {
  const photos = await getSitePhotos();
  return (
    <Container className="flex flex-col gap-6 pt-4 pb-10 lg:gap-10 lg:pt-12 lg:pb-18">
      <div>
        <Eyebrow className="max-lg:hidden">Facilities &amp; services</Eyebrow>
        <h1 className="mt-1.5 font-display text-[34px] leading-[1.1] font-semibold text-ink-900 lg:text-[52px]">Comfort, care and everything on site</h1>
      </div>
      {features.map((f, i) => (
        <article key={f.slot} className="grid items-center gap-3 lg:grid-cols-2 lg:gap-8">
          <Photo photo={sitePhoto(photos, f.slot, { alt: f.alt })} className={cn("h-[200px] rounded-xl lg:h-[300px]", i % 2 === 1 && "lg:order-2")} sizes="(min-width: 1024px) 50vw, 100vw" />
          <div>
            <h2 className="font-display text-[28px] leading-tight font-semibold text-ink-900 lg:text-4xl">{f.title}</h2>
            <p className="mt-1.5 text-[15px] leading-relaxed text-muted lg:mt-2.5 lg:text-base">{f.text}</p>
          </div>
        </article>
      ))}
      <section aria-labelledby="also" className="mt-2">
        <h2 id="also" className="font-sans text-lg font-bold text-ink-900">Also on site <span className="font-normal text-muted">· {facilities.length}</span></h2>
        <ul className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {facilities.map((f) => (
            <li key={f.name} className="flex flex-col gap-1 rounded-xl border border-hairline p-4">
              <b className="text-[15px]">{f.name}</b>
              <span className="text-[13px] text-muted">{f.text}</span>
            </li>
          ))}
        </ul>
      </section>
    </Container>
  );
}

export default function FacilitiesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <FacilitiesPageContent />
    </Suspense>
  );
}
