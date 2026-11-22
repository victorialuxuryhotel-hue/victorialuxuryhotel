import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";

export const PAGE_SIZE = 20;

/** Previous / next links that keep the current search and filters. */
export function Pager({ basePath, params, page, hasMore }: { basePath: string; params: Record<string, string | undefined>; page: number; hasMore: boolean }) {
  if (page === 1 && !hasMore) return null;
  const href = (p: number) => {
    const q = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => Boolean(e[1])));
    if (p > 1) q.set("page", String(p));
    else q.delete("page");
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  return (
    <nav aria-label="Pages" className="flex items-center justify-between border-t border-hairline px-4 py-3 text-sm">
      <span className="text-ink-500">Page {page}</span>
      <div className="flex gap-2">
        {page > 1 ? <Link href={href(page - 1)} className={buttonStyles({ variant: "secondary" })}><ChevronLeft className="size-4" aria-hidden /> Previous</Link> : null}
        {hasMore ? <Link href={href(page + 1)} className={buttonStyles({ variant: "secondary" })}>Next <ChevronRight className="size-4" aria-hidden /></Link> : null}
      </div>
    </nav>
  );
}

export function pageFrom(v: string | string[] | undefined): number {
  const n = Number(typeof v === "string" ? v : 1);
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
}
