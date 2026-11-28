import Link from "next/link";
import { buttonStyles } from "@/components/ui/button";
import { formatNaira } from "@/lib/format";
import type { PublicCategory } from "@/server/queries/catalogue";
import { Photo } from "./photo";

/** A room type on the home page (designs G1, M1): photo, name, sleeps, summary, price a night and View room. */
export function RoomCard({ c, priority }: { c: PublicCategory; priority?: boolean }) {
  return (
    <article className="relative flex w-full flex-col overflow-hidden rounded-[14px] border border-hairline bg-white">
      <Photo photo={c.photos[0] ?? { alt: c.name }} priority={priority} className="h-[220px]" sizes="(min-width: 1024px) 25vw, 100vw" />
      <div className="flex flex-1 flex-col gap-2 p-[18px]">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-display text-[28px] leading-tight font-semibold text-ink-900">{c.name}</h3>
          <span className="shrink-0 text-[13px] text-muted">Sleeps {c.maxOccupancy}</span>
        </div>
        {c.summary ? <p className="text-sm leading-normal text-muted">{c.summary}</p> : null}
        <div className="mt-auto flex items-center justify-between gap-3 pt-2.5">
          <span className="tabular-nums">
            <b className="text-xl">{formatNaira(c.fromRateKobo)}</b>
            <span className="text-[13px] text-muted"> / night</span>
          </span>
          <Link href={`/rooms/${c.slug}`} className={buttonStyles({ variant: "secondary", size: "sm", className: "after:absolute after:inset-0" })}>
            View room<span className="sr-only">: {c.name}</span>
          </Link>
        </div>
      </div>
    </article>
  );
}
