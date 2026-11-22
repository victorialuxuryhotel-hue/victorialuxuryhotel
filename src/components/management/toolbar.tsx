import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { Input, Select } from "@/components/ui/form";
import { cn } from "@/lib/utils/cn";
import { FiltersToggle } from "./filters-toggle";

/**
 * Search + filters row that sits on top of list cards. Submits as GET params.
 * Phones: pinned below the top bar while the list scrolls; filters fold away.
 */
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
  /** A filter is in use: show the filters open on phones. */
  filtersActive?: boolean;
}) {
  return (
    <form
      method="get"
      className={cn(
        "sticky top-14 z-10 grid grid-cols-[1fr_auto] gap-2 border-b border-hairline bg-ivory-50 p-3 md:static md:flex md:items-center md:gap-3 md:p-4 lg:top-0",
        !filters && "grid-cols-1",
        className,
      )}
    >
      {Object.entries(hidden ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <label className="relative flex-1">
        <span className="sr-only">Search</span>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
        <Input type="search" name="q" placeholder={placeholder} defaultValue={defaultQuery} className="h-11 pl-9 md:h-10" />
      </label>
      {filters ? <FiltersToggle initiallyOpen={filtersActive}>{filters}</FiltersToggle> : null}
    </form>
  );
}

export function FilterSelect({ name, label, options, value }: { name: string; label: string; options: Array<[string, string]>; value?: string }) {
  return (
    <label>
      <span className="sr-only">{label}</span>
      <Select name={name} defaultValue={value ?? ""} className="w-full md:w-auto md:min-w-36">
        <option value="">{label}: all</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </Select>
    </label>
  );
}

/** Segmented tabs (links), e.g. Arrivals / Departures / In house. */
export function Tabs({ items }: { items: Array<{ label: string; count?: number; active?: boolean; href: string }> }) {
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-hairline px-4">
      {items.map((t) => (
        <a
          key={t.label}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={cn(
            "-mb-px flex items-center gap-2 border-b-2 px-3 py-3 text-[15px] whitespace-nowrap",
            t.active ? "border-navy-800 text-navy-950" : "border-transparent text-ink-500 hover:text-ink-900",
          )}
        >
          {t.label}
          {t.count !== undefined ? (
            <span className={cn("rounded-full px-2 py-0.5 text-xs", t.active ? "bg-navy-800 text-white" : "bg-ivory-200 text-ink-600")}>{t.count}</span>
          ) : null}
        </a>
      ))}
    </nav>
  );
}
