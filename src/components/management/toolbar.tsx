import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/form";
import { FilterMenu } from "./filter-menu";
import { cn } from "@/lib/utils/cn";
import { FiltersToggle } from "./filters-toggle";
import { SlashHint } from "./shortcuts";

export function ListToolbar({
  placeholder,
  filters,
  className,
  defaultQuery,
  hidden,
  filtersActive,
}: {
  placeholder: string;
  filters?: ReactNode;
  className?: string;
  defaultQuery?: string;
  hidden?: Record<string, string>;
  filtersActive?: boolean;
}) {
  return (
    <form
      method="get"
      className={cn(
        "sticky top-14 z-10 grid grid-cols-[1fr_auto] gap-2 bg-ivory-100 py-2 md:static md:flex md:flex-wrap md:items-center md:gap-2.5 md:bg-transparent md:py-0 lg:top-0",
        !filters && "grid-cols-1",
        className,
      )}
    >
      {Object.entries(hidden ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <label className="relative md:w-80">
        <span className="sr-only">Search</span>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
        <Input type="search" name="q" placeholder={placeholder} defaultValue={defaultQuery} data-search="" aria-keyshortcuts="/" className="h-11 pl-9 text-sm md:h-10 pointer-fine:md:pr-9" />
        <SlashHint />
      </label>
      {filters ? <FiltersToggle initiallyOpen={filtersActive}>{filters}</FiltersToggle> : null}
    </form>
  );
}

/** A list filter (design D2): a dropdown with the choices, a tick on the chosen one, and Clear. */
export function FilterSelect({ name, label, options, value }: { name: string; label: string; options: Array<[string, string]>; value?: string }) {
  return <FilterMenu name={name} label={label} value={value} options={options} />;
}

/** Tabs that switch what a list shows (design R1): an underline under the chosen one, a count beside each. `inset` pads them inside a card. */
export function Tabs({ items, inset = true }: { items: Array<{ label: string; count?: number; active?: boolean; href: string }>; inset?: boolean }) {
  return (
    <nav className={cn("flex gap-[22px] overflow-x-auto border-b border-hairline", inset && "px-4 pt-3")}>
      {items.map((t) => (
        <a
          key={t.label}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={cn(
            "-mb-px flex shrink-0 items-center gap-2 border-b-[3px] px-0.5 pb-2.5 text-[15px] whitespace-nowrap",
            t.active ? "border-navy-900 font-semibold text-ink-900" : "border-transparent font-medium text-[#5b6372] hover:text-ink-900",
          )}
        >
          {t.label}
          {t.count !== undefined ? (
            <span className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded-md px-1.5 text-xs font-semibold tabular-nums", t.active ? "bg-navy-900 text-white" : "bg-[#eceae4] text-ink-700")}>{t.count}</span>
          ) : null}
        </a>
      ))}
    </nav>
  );
}
