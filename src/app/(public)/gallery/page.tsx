import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/public/page-skeleton";
import { CtaBand } from "@/components/public/cta-band";
import { PageHero } from "@/components/public/page-hero";
import { Photo } from "@/components/public/photo";
import { Section } from "@/components/public/section";
import { galleryGroups } from "@/content/photo-slots";
import { gallery as placeholders, type Photo as PhotoContent } from "@/content/site";
import { cn } from "@/lib/utils/cn";
import { getPublicCategories, getSitePhotos } from "@/server/queries/catalogue";

export const metadata: Metadata = {
  title: "Gallery",
  description: "Photographs of the rooms, pool, spa and dining at Victoria Luxury Hotel, Akure.",
  alternates: { canonical: "/gallery" },
};

// Varied tile shapes give an editorial rhythm on large screens.
const spans = ["lg:col-span-2 lg:row-span-2", "", "", "lg:row-span-2", "", "lg:col-span-2", ""];

async function GalleryPageContent() {
  const [categories, site] = await Promise.all([getPublicCategories(), getSitePhotos()]);

  // Real photos per section: room-type photos feed "Rooms"; the rest come from
  // the gallery uploads. Sections with no photos yet keep their placeholders.
  const real: Record<string, PhotoContent[]> = Object.fromEntries(galleryGroups.map((g) => [g, [] as PhotoContent[]]));
  for (const c of categories) real.Rooms!.push(...c.photos);
  for (const p of site.gallery) real[p.group]?.push(p);
  const sections = galleryGroups.map((group) => {
    const photos = real[group]!;
    return { group, photos: photos.length ? photos : placeholders.filter((p) => p.group === group) };
  });

  return (
    <>
      <PageHero eyebrow="Gallery" title="A glimpse of your stay" intro="Rooms, pool, spa and dining at Victoria Luxury Hotel and Apartment." />
      <Section>
        <div className="space-y-16">
          {sections.map(({ group, photos }) => (
            <section key={group} aria-labelledby={`g-${group}`}>
              <h2 id={`g-${group}`} className="font-display text-3xl text-navy-950">{group}</h2>
              <div className="mt-6 grid auto-rows-[220px] grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {photos.map((p, i) => (
                  <Photo
                    key={`${p.image ?? p.alt}-${i}`}
                    photo={p}
                    tone={!p.image && i % 4 === 1 ? "dark" : "light"}
                    className={cn("h-full rounded-card", spans[i % spans.length])}
                    sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </Section>
      <CtaBand />
    </>
  );
}

/** Content reads room types and photos per request; the page frame shows immediately. */
export default function GalleryPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <GalleryPageContent />
    </Suspense>
  );
}
