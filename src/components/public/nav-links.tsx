"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";

/** The header's page links; the page you're on is dark with a navy underline (design D4). */
export function NavLinks({ items, static: still }: { items: ReadonlyArray<{ href: string; label: string }>; static?: boolean }) {
  return still ? <Links items={items} path="" /> : <Current items={items} />;
}

function Current({ items }: { items: ReadonlyArray<{ href: string; label: string }> }) {
  return <Links items={items} path={usePathname()} />;
}

function Links({ items, path }: { items: ReadonlyArray<{ href: string; label: string }>; path: string }) {
  return (
    <nav aria-label="Main" className="hidden items-center gap-7 lg:flex">
      {items.map((item) => {
        const here = path === item.href || path.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={here ? "page" : undefined}
            className={cn(
              "border-b-2 py-1.5 text-[15px] transition-colors",
              here ? "border-navy-900 font-semibold text-ink-900" : "border-transparent font-medium text-muted hover:text-ink-900",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
